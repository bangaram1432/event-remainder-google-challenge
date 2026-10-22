import { describe, expect, it } from "vitest";
import { disabledEnhancer, type PlanEnhancer } from "@/ai/enhance";
import { addDays } from "@/domain/dates";
import type { AiStatus, EnhanceResponse, Plan, PlanInput, PlanResponse } from "@/domain/types";
import { SlidingWindowRateLimiter } from "@/security/rate-limit";
import type { Logger } from "@/server/logger";
import { MAX_BODY_BYTES, handleEnhanceRequest, handlePlanRequest, type HandlerDeps } from "@/server/plan-handler";
import { TODAY, makeInput } from "./helpers";

const NOW = new Date(`${TODAY}T10:00:00Z`);
const body = () => ({ ...makeInput({ eventDate: addDays(TODAY, 150), notes: "Surprise for Nani, private-note-marker" }) });

type Handler = (request: Request, deps: HandlerDeps) => Promise<Response>;
const HANDLERS: Array<[string, Handler]> = [["plan", handlePlanRequest], ["enhance", handleEnhanceRequest]];

function deps(overrides: Partial<HandlerDeps> = {}, limit = 100): HandlerDeps & { logs: string[] } {
  const logs: string[] = [];
  const record = (m: string, f?: object) => void logs.push(JSON.stringify({ m, ...f }));
  const logger: Logger = { info: record, warn: record, error: record };
  const limiter = () => new SlidingWindowRateLimiter({ limit, windowMs: 60_000 });
  return { now: () => NOW, limiters: { plan: limiter(), enhance: limiter() }, enhancer: disabledEnhancer, logger, logs, ...overrides };
}

function post(payload: unknown, headers: Record<string, string> = {}, raw?: string): Request {
  return new Request("http://localhost/api/plan", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost", ...headers },
    body: raw ?? JSON.stringify(payload),
  });
}

const stubEnhancer = (result: AiStatus, seen: Array<{ input: PlanInput; plan: Plan }> = []): PlanEnhancer => ({
  enhance: async (input, plan) => { seen.push({ input, plan }); return result; },
});

describe("POST /api/plan", () => {
  it("returns the deterministic plan with safe, uncacheable headers", async () => {
    const response = await handlePlanRequest(post(body()), deps());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-request-id")).toBeTruthy();
    const data = (await response.json()) as PlanResponse;
    expect(data.plan.budget.lines.reduce((a, l) => a + l.amount, 0)).toBe(body().budget);
    expect(data.plan.generatedOn).toBe(TODAY);
  });

  it("never touches the model, so a broken AI layer cannot slow or break the plan", async () => {
    const exploding: PlanEnhancer = { enhance: async () => { throw new Error("must not be called"); } };
    const response = await handlePlanRequest(post(body()), deps({ enhancer: exploding }));
    expect(response.status).toBe(200);
  });
});

describe("POST /api/enhance", () => {
  it("reports AI status for each outcome", async () => {
    const outcomes: AiStatus[] = [{ status: "disabled" }, { status: "fallback", reason: "timeout" }, { status: "fallback", reason: "input-flagged" }];
    for (const outcome of outcomes) {
      const response = await handleEnhanceRequest(post(body()), deps({ enhancer: stubEnhancer(outcome) }));
      expect(response.status).toBe(200);
      expect(((await response.json()) as EnhanceResponse).ai).toEqual(outcome);
    }
  });

  it("recomputes the plan from validated input instead of trusting anything the client sends", async () => {
    const seen: Array<{ input: PlanInput; plan: Plan }> = [];
    const forged = { ...body(), notes: "Hello\u0000\u200B world", plan: { budget: { total: 1 } } };
    await handleEnhanceRequest(post(forged), deps({ enhancer: stubEnhancer({ status: "disabled" }, seen) }));
    expect(seen).toHaveLength(1);
    expect(seen[0]?.input.notes).toBe("Hello world");
    expect(seen[0]?.plan.budget.total).toBe(body().budget);
  });
});

describe("POST /api/enhance failures", () => {
  it("answers with a generic 500 when the enhancer throws, never the upstream message", async () => {
    const exploding: PlanEnhancer = { enhance: async () => { throw new Error("upstream token abc123 leaked"); } };
    const d = deps({ enhancer: exploding });
    const response = await handleEnhanceRequest(post(body()), d);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("abc123");
    expect(d.logs.join("\n")).not.toContain("abc123");
  });
});

describe.each(HANDLERS)("shared guards on /api/%s", (_name, handler) => {
  it("rejects non-JSON content types", async () => {
    expect((await handler(post(body(), { "content-type": "text/plain" }), deps())).status).toBe(415);
  });

  it("rejects cross-origin browser requests but allows same-origin ones", async () => {
    expect((await handler(post(body(), { origin: "https://evil.example" }), deps())).status).toBe(403);
    expect((await handler(post(body(), { origin: "not a url" }), deps())).status).toBe(403);
    expect((await handler(post(body(), { origin: "http://localhost" }), deps())).status).toBe(200);
  });

  it("rejects malformed JSON", async () => {
    const response = await handler(post(null, {}, "{not json"), deps());
    expect(response.status).toBe(400);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("invalid_json");
  });

  it("returns field-level errors for invalid input", async () => {
    const response = await handler(post({ ...body(), eventDate: addDays(TODAY, -3), guestCount: -1 }), deps());
    expect(response.status).toBe(422);
    const data = (await response.json()) as { error: { fields: Record<string, string> } };
    expect(Object.keys(data.error.fields)).toEqual(expect.arrayContaining(["eventDate", "guestCount"]));
  });

  it("caps request size while streaming", async () => {
    const response = await handler(post(null, {}, JSON.stringify({ notes: "x".repeat(MAX_BODY_BYTES + 10) })), deps());
    expect(response.status).toBe(413);
  });

  it("rate limits per client before doing any parsing work", async () => {
    const d = deps({}, 2);
    const ip = { "x-forwarded-for": "203.0.113.9" };
    expect((await handler(post(body(), ip), d)).status).toBe(200);
    expect((await handler(post(body(), ip), d)).status).toBe(200);
    const blocked = await handler(post(null, ip, "{garbage"), d);
    expect(blocked.status).toBe(429);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    expect((await handler(post(body(), { "x-forwarded-for": "203.0.113.10" }), d)).status).toBe(200);
  });

  it("hides internal errors from clients and from logs", async () => {
    const exploding: PlanEnhancer = { enhance: async () => { throw new Error("db password hunter2 leaked"); } };
    const d = deps({ enhancer: exploding, now: () => { throw new Error("clock hunter2 broke"); } });
    const response = await handler(post(body()), d);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("hunter2");
    expect(d.logs.join("\n")).not.toContain("hunter2");
  });

  it("never logs user free text", async () => {
    const d = deps();
    await handler(post(body()), d);
    expect(d.logs.length).toBeGreaterThan(0);
    expect(d.logs.join("\n")).not.toContain("private-note-marker");
    expect(d.logs.join("\n")).not.toContain("Guntur");
  });
});

describe("rate limit scopes", () => {
  it("limits the model-backed endpoint without starving plan requests", async () => {
    const d = deps();
    d.limiters.enhance = new SlidingWindowRateLimiter({ limit: 1, windowMs: 60_000 });
    expect((await handleEnhanceRequest(post(body()), d)).status).toBe(200);
    expect((await handleEnhanceRequest(post(body()), d)).status).toBe(429);
    expect((await handlePlanRequest(post(body()), d)).status).toBe(200);
  });
});
