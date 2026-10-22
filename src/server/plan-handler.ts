import type { PlanEnhancer } from "@/ai/enhance";
import { todayIso } from "@/domain/dates";
import { buildPlan } from "@/domain/plan";
import type { EnhanceResponse, FieldErrors, Plan, PlanInput, PlanResponse } from "@/domain/types";
import { getClientId } from "@/security/client-id";
import type { RateLimiter } from "@/security/rate-limit";
import type { Logger } from "./logger";
import { parsePlanInput } from "./validate-request";

export const MAX_BODY_BYTES = 8 * 1024;

/** The two endpoints are limited separately: planning is nearly free, enhancement costs model tokens. */
export type Scope = "plan" | "enhance";

export interface HandlerDeps {
  now: () => Date;
  limiters: Record<Scope, RateLimiter>;
  enhancer: PlanEnhancer;
  logger: Logger;
}

interface ErrorBody {
  error: { code: string; message: string; fields?: FieldErrors };
  requestId: string;
}

function respond(body: PlanResponse | EnhanceResponse | ErrorBody, status: number, requestId: string, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "X-Request-Id": requestId,
      ...headers,
    },
  });
}

function fail(status: number, code: string, message: string, requestId: string, extra: { fields?: FieldErrors; headers?: Record<string, string> } = {}): Response {
  const error: ErrorBody["error"] = { code, message };
  if (extra.fields) error.fields = extra.fields;
  return respond({ error, requestId }, status, requestId, extra.headers);
}

/** Defence in depth on top of the JSON content-type requirement: browsers always send Origin on cross-site POSTs. */
function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

/** Reads the body but stops as soon as it exceeds the cap, so oversized uploads cost almost nothing. */
async function readLimitedBody(request: Request, maxBytes: number): Promise<string | null> {
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(merged);
}

type Guarded = { ok: true; input: PlanInput; today: string } | { ok: false; response: Response };

/** The shared front door: origin, content type, rate limit, size cap, JSON parse, allow-list validation. */
async function guardRequest(request: Request, deps: HandlerDeps, scope: Scope, requestId: string): Promise<Guarded> {
  const refuse = (response: Response): Guarded => ({ ok: false, response });
  if (!isSameOrigin(request)) return refuse(fail(403, "forbidden_origin", "Requests must come from this site.", requestId));
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return refuse(fail(415, "unsupported_media_type", "Send the request as application/json.", requestId));
  }

  const decision = await deps.limiters[scope].check(getClientId(request.headers), deps.now().getTime());
  if (!decision.allowed) {
    return refuse(fail(429, "rate_limited", "Too many requests. Please wait a moment and try again.", requestId, {
      headers: { "Retry-After": String(decision.retryAfterSeconds) },
    }));
  }

  const text = await readLimitedBody(request, MAX_BODY_BYTES);
  if (text === null) return refuse(fail(413, "payload_too_large", "That request is too large.", requestId));

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse(fail(400, "invalid_json", "The request body is not valid JSON.", requestId));
  }

  const today = todayIso(deps.now());
  const parsed = parsePlanInput(raw, today);
  if (!parsed.ok) return refuse(fail(422, "invalid_input", "Some details need fixing.", requestId, { fields: parsed.errors }));
  return { ok: true, input: parsed.value, today };
}

type Handle = (input: PlanInput, today: string, plan: Plan, requestId: string) => Promise<Response>;

/** Wraps a handler with the guards and a last-resort error boundary that never leaks internals. */
async function serve(request: Request, deps: HandlerDeps, scope: Scope, handle: Handle): Promise<Response> {
  const requestId = crypto.randomUUID();
  try {
    const guarded = await guardRequest(request, deps, scope, requestId);
    if (!guarded.ok) return guarded.response;
    // The plan is always recomputed here from validated input. A client-supplied plan is never trusted.
    return await handle(guarded.input, guarded.today, buildPlan(guarded.input, guarded.today), requestId);
  } catch (error) {
    deps.logger.error("request.unhandled", { requestId, scope, errorName: error instanceof Error ? error.name : "unknown" });
    return fail(500, "internal_error", "Something went wrong on our side. Please try again.", requestId);
  }
}

/** POST /api/plan: the deterministic plan, returned in milliseconds with no model in the path. */
export function handlePlanRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  return serve(request, deps, "plan", async (input, _today, plan, requestId) => {
    deps.logger.info("plan.created", { requestId, eventType: input.eventType, guestCount: input.guestCount });
    return respond({ plan }, 200, requestId);
  });
}

/** POST /api/enhance: optional AI personalisation. Failures degrade to a status, never to an error page. */
export function handleEnhanceRequest(request: Request, deps: HandlerDeps): Promise<Response> {
  return serve(request, deps, "enhance", async (input, _today, plan, requestId) => {
    const startedAt = deps.now().getTime();
    const ai = await deps.enhancer.enhance(input, plan);
    deps.logger.info("plan.enhanced", { requestId, ai: ai.status, durationMs: deps.now().getTime() - startedAt });
    return respond({ ai }, 200, requestId);
  });
}
