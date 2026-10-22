import { describe, expect, it } from "vitest";
import { getClientId } from "@/security/client-id";
import { DEFAULT_MODEL, loadConfig } from "@/server/config";
import { SharedStoreRateLimiter, SlidingWindowRateLimiter } from "@/security/rate-limit";
import { TtlCache } from "@/server/ttl-cache";

describe("SlidingWindowRateLimiter", () => {
  it("allows up to the limit, then blocks with an accurate Retry-After", () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 3, windowMs: 60_000 });
    expect(limiter.check("a", 0).remaining).toBe(2);
    expect(limiter.check("a", 1_000).remaining).toBe(1);
    expect(limiter.check("a", 2_000).remaining).toBe(0);
    const blocked = limiter.check("a", 10_000);
    expect(blocked).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 50 });
  });

  it("slides: capacity returns as old hits expire", () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 2, windowMs: 1_000 });
    limiter.check("a", 0);
    limiter.check("a", 500);
    expect(limiter.check("a", 900).allowed).toBe(false);
    expect(limiter.check("a", 1_001).allowed).toBe(true);
  });

  it("tracks clients independently", () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 1_000 });
    expect(limiter.check("a", 0).allowed).toBe(true);
    expect(limiter.check("b", 0).allowed).toBe(true);
    expect(limiter.check("a", 1).allowed).toBe(false);
  });

  it("bounds memory by evicting the oldest keys", () => {
    const limiter = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000, maxKeys: 2 });
    limiter.check("a", 0);
    limiter.check("b", 1);
    limiter.check("c", 2);
    expect(limiter.check("a", 3).allowed).toBe(true);
  });
});

describe("TtlCache", () => {
  it("returns fresh entries and drops expired ones", () => {
    const cache = new TtlCache<string>(10, 1_000);
    cache.set("k", "v", 0);
    expect(cache.get("k", 999)).toBe("v");
    expect(cache.get("k", 1_000)).toBeUndefined();
    expect(cache.size).toBe(0);
  });

  it("evicts the least recently used entry", () => {
    const cache = new TtlCache<number>(2, 10_000);
    cache.set("a", 1, 0);
    cache.set("b", 2, 0);
    cache.get("a", 1);
    cache.set("c", 3, 2);
    expect(cache.get("b", 3)).toBeUndefined();
    expect(cache.get("a", 3)).toBe(1);
    expect(cache.get("c", 3)).toBe(3);
  });
});

describe("loadConfig", () => {
  it("applies safe defaults", () => {
    expect(loadConfig({})).toEqual({ geminiApiKey: null, sharedStore: null, geminiModel: DEFAULT_MODEL, aiTimeoutMs: 12_000, rateLimitPerMinute: 10 });
  });
  it("trims keys and accepts valid overrides", () => {
    const config = loadConfig({ GEMINI_API_KEY: "  key  ", GEMINI_MODEL: "gemini-4-argon", AI_TIMEOUT_MS: "5000", RATE_LIMIT_PER_MINUTE: "30" });
    expect(config).toEqual({ geminiApiKey: "key", sharedStore: null, geminiModel: "gemini-4-argon", aiTimeoutMs: 5_000, rateLimitPerMinute: 30 });
  });
  it("falls back when values are malformed or out of range", () => {
    const config = loadConfig({ GEMINI_API_KEY: "   ", GEMINI_MODEL: "../../evil model", AI_TIMEOUT_MS: "999999", RATE_LIMIT_PER_MINUTE: "abc" });
    expect(config).toEqual({ geminiApiKey: null, sharedStore: null, geminiModel: DEFAULT_MODEL, aiTimeoutMs: 12_000, rateLimitPerMinute: 10 });
  });
  it("accepts https shared-store credentials and trims trailing slashes", () => {
    const config = loadConfig({ UPSTASH_REDIS_REST_URL: " https://example.upstash.io/ ", UPSTASH_REDIS_REST_TOKEN: "t0ken" });
    expect(config.sharedStore).toEqual({ url: "https://example.upstash.io", token: "t0ken" });
  });
  const unusable: Array<[string, Record<string, string>]> = [
    ["a plain-http URL", { UPSTASH_REDIS_REST_URL: "http://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" }],
    ["a missing token", { UPSTASH_REDIS_REST_URL: "https://example.upstash.io" }],
    ["a malformed URL", { UPSTASH_REDIS_REST_URL: "not a url", UPSTASH_REDIS_REST_TOKEN: "t" }],
  ];
  it.each(unusable)("ignores shared-store settings with %s", (_label, env) => {
    expect(loadConfig(env).sharedStore).toBeNull();
  });
});

describe("getClientId", () => {
  it("uses the first forwarded address", () => {
    expect(getClientId(new Headers({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))).toBe("203.0.113.7");
  });
  it("ignores malformed values and falls back", () => {
    expect(getClientId(new Headers({ "x-forwarded-for": "<script>" }))).toBe("unknown");
    expect(getClientId(new Headers({ "x-real-ip": "2001:db8::1" }))).toBe("2001:db8::1");
    expect(getClientId(new Headers())).toBe("unknown");
  });
});

describe("SharedStoreRateLimiter", () => {
  const WINDOW = 60_000;
  const local = () => new SlidingWindowRateLimiter({ limit: 100, windowMs: WINDOW });
  const reply = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });
  const limiter = (fetchImpl: typeof fetch, onError?: (r: string) => void) =>
    new SharedStoreRateLimiter({ url: "https://example.upstash.io", token: "t0ken", limit: 3, windowMs: WINDOW, prefix: "plan", fallback: local(), fetchImpl, onError });

  it("counts in the shared store and never sends the raw client identifier", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify([{ result: 2 }, { result: 1 }]), { status: 200 });
    }) as unknown as typeof fetch;
    const decision = await limiter(fake).check("203.0.113.7", 10_000);
    expect(decision).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(calls[0]?.url).toBe("https://example.upstash.io/pipeline");
    expect((calls[0]?.init.headers as Record<string, string>).Authorization).toBe("Bearer t0ken");
    const commands = JSON.parse(String(calls[0]?.init.body)) as string[][];
    expect(commands[0]?.[0]).toBe("INCR");
    expect(commands[1]?.[0]).toBe("EXPIRE");
    expect(commands[0]?.[1]).toMatch(/^ratelimit:plan:0:[0-9a-f]{32}$/);
    expect(String(calls[0]?.init.body)).not.toContain("203.0.113.7");
  });

  it("blocks once the count passes the limit and says when the window ends", async () => {
    const decision = await limiter(reply([{ result: 4 }, { result: 1 }]) as unknown as typeof fetch).check("a", 30_000);
    expect(decision).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 30 });
  });

  const failures: Array<[string, typeof fetch]> = [
    ["an error status", reply({}, 500) as unknown as typeof fetch],
    ["a malformed reply", reply([{ result: "oops" }]) as unknown as typeof fetch],
    ["a network failure", (async () => { throw new TypeError("network down"); }) as unknown as typeof fetch],
  ];
  it.each(failures)("consults the in-memory fallback on %s", async (_label, fake) => {
    const errors: string[] = [];
    let fallbackCalls = 0;
    // A fallback that always denies proves the answer really came from it, not from a default "allow".
    const denying = { check: () => { fallbackCalls += 1; return { allowed: false, remaining: 0, retryAfterSeconds: 7 }; } };
    const shared = new SharedStoreRateLimiter({ url: "https://example.upstash.io", token: "t", limit: 3, windowMs: WINDOW, prefix: "plan", fallback: denying, fetchImpl: fake, onError: (r) => errors.push(r) });
    expect(await shared.check("a", 0)).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 7 });
    expect(fallbackCalls).toBe(1);
    expect(errors).toHaveLength(1);
  });
});
