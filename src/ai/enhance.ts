import { createHash } from "node:crypto";
import type { AiEnhancement, AiStatus, FallbackReason, Plan, PlanInput } from "@/domain/types";
import { createCanary, guardPlanInput, leaksCanary } from "@/security/guardrails";
import type { Logger } from "@/server/logger";
import type { TtlCache } from "@/server/ttl-cache";
import { SYSTEM_INSTRUCTION, buildUserInput, protectSystemInstruction } from "./prompt";
import { parseAiEnhancement } from "./schema";

export interface GeminiRequest {
  systemInstruction: string;
  input: string;
}
/** The model port: anything that turns a request into the model's raw text. Keeps SDK details out of the logic. */
export type GeminiTransport = (request: GeminiRequest) => Promise<string>;

export interface PlanEnhancer {
  enhance(input: PlanInput, plan: Plan): Promise<AiStatus>;
}

export const disabledEnhancer: PlanEnhancer = { enhance: async () => ({ status: "disabled" }) };

export class TimeoutError extends Error {
  constructor(ms: number) {
    super(`Timed out after ${ms}ms`);
    this.name = "TimeoutError";
  }
}

/** Rejects after `ms`; always clears its timer so nothing leaks. */
export function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(ms)), Math.max(1, ms));
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (error: unknown) => { clearTimeout(timer); reject(error); },
    );
  });
}

function parseJson(text: string): unknown {
  const unfenced = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(unfenced);
  } catch {
    return undefined;
  }
}

export interface GeminiEnhancerOptions {
  transport: GeminiTransport;
  cache: TtlCache<AiEnhancement>;
  model: string;
  timeoutMs: number;
  now: () => number;
  logger: Logger;
  /** Overridable so tests can predict the canary. */
  newCanary?: () => string;
}

const MAX_ATTEMPTS = 2;
const MIN_RETRY_BUDGET_MS = 1_500;
const fallback = (reason: FallbackReason): AiStatus => ({ status: "fallback", reason });

/**
 * Personalises a plan with Gemini. It never throws and never blocks the plan: on flagged input, timeout, upstream
 * failure, leaked context or invalid output it reports a fallback reason and the caller still has the deterministic
 * plan. Identical prompts are served from a small TTL cache so repeat requests cost no tokens.
 */
export function createGeminiEnhancer(options: GeminiEnhancerOptions): PlanEnhancer {
  const { transport, cache, model, timeoutMs, now, logger, newCanary = createCanary } = options;
  return {
    async enhance(input, plan) {
      const guarded = guardPlanInput(input);
      if (guarded.suspicious) {
        logger.warn("ai.input_flagged");
        return fallback("input-flagged");
      }
      if (guarded.redactions > 0) logger.info("ai.input_redacted", { redactions: guarded.redactions });

      const userInput = buildUserInput(guarded.input, plan);
      // The cache key excludes the per-request canary: it identifies the question, not the attempt.
      const key = createHash("sha256").update(`${model}\n${SYSTEM_INSTRUCTION}\n${userInput}`).digest("hex");
      const cached = cache.get(key, now());
      if (cached) return { status: "enhanced", enhancement: cached };

      const canary = newCanary();
      const request: GeminiRequest = { systemInstruction: protectSystemInstruction(canary), input: userInput };
      const deadline = now() + timeoutMs;
      let reason: FallbackReason = "upstream-error";
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const remaining = deadline - now();
        if (attempt > 1 && remaining < MIN_RETRY_BUDGET_MS) break;
        try {
          const raw = await withTimeout(transport(request), remaining);
          if (leaksCanary(raw, canary)) {
            logger.warn("ai.canary_leak");
            return fallback("blocked-output");
          }
          const enhancement = parseAiEnhancement(parseJson(raw));
          if (enhancement) {
            cache.set(key, enhancement, now());
            return { status: "enhanced", enhancement };
          }
          reason = "invalid-output";
        } catch (error) {
          reason = error instanceof TimeoutError ? "timeout" : "upstream-error";
          logger.warn("ai.failed", { reason, errorName: error instanceof Error ? error.name : "unknown", attempt });
          break;
        }
      }
      if (reason === "invalid-output") logger.warn("ai.failed", { reason, attempts: MAX_ATTEMPTS });
      return fallback(reason);
    },
  };
}
