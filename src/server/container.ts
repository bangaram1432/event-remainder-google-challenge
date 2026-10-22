import { createGeminiEnhancer, disabledEnhancer } from "@/ai/enhance";
import { createGeminiTransport } from "@/ai/gemini";
import type { AiEnhancement } from "@/domain/types";
import { SharedStoreRateLimiter, SlidingWindowRateLimiter, type RateLimiter } from "@/security/rate-limit";
import { loadConfig, type AppConfig } from "./config";
import { consoleLogger } from "./logger";
import type { HandlerDeps, Scope } from "./plan-handler";
import { TtlCache } from "./ttl-cache";

const CACHE_ENTRIES = 200;
const CACHE_TTL_MS = 10 * 60 * 1000;
const WINDOW_MS = 60_000;
/** Planning is nearly free, so it gets a more generous budget than the model-backed endpoint. */
const PLAN_LIMIT_MULTIPLIER = 3;

function buildLimiter(config: AppConfig, scope: Scope, limit: number): RateLimiter {
  const local = new SlidingWindowRateLimiter({ limit, windowMs: WINDOW_MS });
  if (!config.sharedStore) return local;
  return new SharedStoreRateLimiter({
    ...config.sharedStore,
    limit,
    windowMs: WINDOW_MS,
    prefix: scope,
    fallback: local,
    onError: (reason) => consoleLogger.warn("ratelimit.shared_store_unavailable", { scope, reason }),
  });
}

let singleton: HandlerDeps | undefined;

/** Composition root: the only place that wires concrete implementations together. Built once per server instance. */
export function getDeps(): HandlerDeps {
  if (singleton) return singleton;
  const config = loadConfig(process.env);
  const enhancer = config.geminiApiKey
    ? createGeminiEnhancer({
        transport: createGeminiTransport(config.geminiApiKey, config.geminiModel),
        cache: new TtlCache<AiEnhancement>(CACHE_ENTRIES, CACHE_TTL_MS),
        model: config.geminiModel,
        timeoutMs: config.aiTimeoutMs,
        now: () => Date.now(),
        logger: consoleLogger,
      })
    : disabledEnhancer;
  singleton = {
    now: () => new Date(),
    limiters: {
      plan: buildLimiter(config, "plan", config.rateLimitPerMinute * PLAN_LIMIT_MULTIPLIER),
      enhance: buildLimiter(config, "enhance", config.rateLimitPerMinute),
    },
    enhancer,
    logger: consoleLogger,
  };
  return singleton;
}
