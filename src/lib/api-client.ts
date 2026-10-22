import type { EnhanceResponse, FieldErrors, PlanInput, PlanResponse } from "@/domain/types";

export type ApiResult<T> = { ok: true; data: T } | { ok: false; message: string; fieldErrors: FieldErrors };

const NETWORK_MESSAGE = "Could not reach the planner. Check your connection and try again.";

const isObjectWith = (key: string) => (value: unknown): boolean => typeof value === "object" && value !== null && key in value;
const isPlanResponse = (value: unknown): value is PlanResponse => isObjectWith("plan")(value);
const isEnhanceResponse = (value: unknown): value is EnhanceResponse => isObjectWith("ai")(value);

/** Typed POST helper. Aborts propagate to the caller; every other failure becomes a result the UI can show. */
async function post<T>(path: string, input: PlanInput, signal: AbortSignal, isExpected: (value: unknown) => value is T): Promise<ApiResult<T>> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
      signal,
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    return { ok: false, message: NETWORK_MESSAGE, fieldErrors: {} };
  }

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok && isExpected(payload)) return { ok: true, data: payload };

  const body = (payload ?? {}) as { error?: { message?: unknown; fields?: unknown } };
  const message = typeof body.error?.message === "string" ? body.error.message : "Something went wrong. Please try again.";
  const fields = typeof body.error?.fields === "object" && body.error.fields !== null ? (body.error.fields as FieldErrors) : {};
  return { ok: false, message, fieldErrors: fields };
}

/** Step 1: the deterministic plan, which needs no model and returns almost instantly. */
export const requestPlan = (input: PlanInput, signal: AbortSignal) => post("/api/plan", input, signal, isPlanResponse);

/** Step 2: optional AI personalisation, requested only after the plan is already visible. */
export const requestEnhancement = (input: PlanInput, signal: AbortSignal) => post("/api/enhance", input, signal, isEnhanceResponse);
