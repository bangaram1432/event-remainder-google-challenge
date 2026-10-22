import { createHash } from "node:crypto";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

/** Port for rate limiting. Implementations may be synchronous (in-memory) or asynchronous (shared store). */
export interface RateLimiter {
  check(key: string, nowMs: number): RateLimitDecision | Promise<RateLimitDecision>;
}

export interface SlidingWindowOptions {
  limit: number;
  windowMs: number;
  /** Upper bound on tracked keys so memory stays bounded under a distributed flood. */
  maxKeys?: number;
}

/** Sliding-window-log limiter: exact, simple, and bounded in both time and memory. Per server instance. */
export class SlidingWindowRateLimiter implements RateLimiter {
  private readonly hits = new Map<string, number[]>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(options: SlidingWindowOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  check(key: string, nowMs: number): RateLimitDecision {
    const cutoff = nowMs - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((timestamp) => timestamp > cutoff);
    if (recent.length >= this.limit) {
      this.store(key, recent);
      const oldest = recent[0] ?? nowMs;
      return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - nowMs) / 1000)) };
    }
    recent.push(nowMs);
    this.store(key, recent);
    return { allowed: true, remaining: this.limit - recent.length, retryAfterSeconds: 0 };
  }

  private store(key: string, timestamps: number[]): void {
    this.hits.delete(key);
    this.hits.set(key, timestamps);
    while (this.hits.size > this.maxKeys) {
      const oldest = this.hits.keys().next();
      if (oldest.done) break;
      this.hits.delete(oldest.value);
    }
  }
}

export interface SharedStoreOptions {
  /** Upstash Redis REST endpoint, for example https://example.upstash.io */
  url: string;
  token: string;
  limit: number;
  windowMs: number;
  /** Namespaces the counters, for example "plan" or "enhance". */
  prefix: string;
  /** Used whenever the shared store is unreachable, so an outage degrades protection instead of availability. */
  fallback: RateLimiter;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  onError?: (reason: string) => void;
}

/**
 * Fixed-window limiter backed by Upstash Redis over its REST API (no SDK, no extra dependency). Serverless
 * instances do not share memory, so this is what makes the limit hold across them. Client identifiers are
 * hashed before they leave the process. Trade-off: fixed windows allow a short burst at a window boundary.
 */
export class SharedStoreRateLimiter implements RateLimiter {
  private readonly options: SharedStoreOptions;
  private readonly fetchImpl: typeof fetch;

  constructor(options: SharedStoreOptions) {
    this.options = options;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async check(key: string, nowMs: number): Promise<RateLimitDecision> {
    const { url, token, limit, windowMs, prefix, fallback, timeoutMs = 1_500, onError } = this.options;
    const windowId = Math.floor(nowMs / windowMs);
    const hashed = createHash("sha256").update(key).digest("hex").slice(0, 32);
    const redisKey = `ratelimit:${prefix}:${windowId}:${hashed}`;
    try {
      const response = await this.fetchImpl(`${url}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify([["INCR", redisKey], ["EXPIRE", redisKey, Math.ceil(windowMs / 1000) + 1]]),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload: unknown = await response.json();
      const count = Array.isArray(payload) ? (payload[0] as { result?: unknown } | undefined)?.result : undefined;
      if (typeof count !== "number" || !Number.isInteger(count)) throw new Error("malformed response");
      if (count > limit) {
        const windowEnd = (windowId + 1) * windowMs;
        return { allowed: false, remaining: 0, retryAfterSeconds: Math.max(1, Math.ceil((windowEnd - nowMs) / 1000)) };
      }
      return { allowed: true, remaining: limit - count, retryAfterSeconds: 0 };
    } catch (error) {
      onError?.(error instanceof Error ? error.name : "unknown");
      return fallback.check(key, nowMs);
    }
  }
}
