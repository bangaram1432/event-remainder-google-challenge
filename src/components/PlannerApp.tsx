"use client";

import { useEffect, useRef, useState } from "react";
import type { AiProgress, AiStatus, FieldErrors, Plan, PlanInput } from "@/domain/types";
import { requestEnhancement, requestPlan } from "@/lib/api-client";
import { PlanView } from "./PlanView";
import { PlannerForm } from "./PlannerForm";

const REQUEST_TIMEOUT_MS = 35_000;

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "done"; plan: Plan; ai: AiProgress }
  | { kind: "error"; message: string; fieldErrors: FieldErrors };

/** One pre-mounted polite live region announces each stage once, instead of letting the DOM change silently. */
function statusText(state: State): string {
  if (state.kind === "loading") return "Building your plan…";
  if (state.kind !== "done") return "";
  if (state.ai.status === "pending") return "Your plan is ready. Adding personalised ideas…";
  return state.ai.status === "enhanced" ? "Personalised ideas added to your plan." : "Your plan is ready.";
}

async function fetchAiStatus(input: PlanInput, signal: AbortSignal): Promise<AiStatus> {
  const result = await requestEnhancement(input, signal);
  return result.ok ? result.data.ai : { status: "fallback", reason: "upstream-error" };
}

export function PlannerApp() {
  const [state, setState] = useState<State>({ kind: "idle" });
  const inFlight = useRef<AbortController | null>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const donePlan = state.kind === "done" ? state.plan : null;

  // Keyed on the plan object, not the whole state, so the later AI update does not steal focus again.
  useEffect(() => {
    if (donePlan) resultsHeading.current?.focus();
  }, [donePlan]);

  async function handleSubmit(input: PlanInput) {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    setState({ kind: "loading" });
    try {
      const planResult = await requestPlan(input, controller.signal);
      if (inFlight.current !== controller) return;
      if (!planResult.ok) {
        setState({ kind: "error", message: planResult.message, fieldErrors: planResult.fieldErrors });
        return;
      }
      const { plan } = planResult.data;
      setState({ kind: "done", plan, ai: { status: "pending" } });
      const ai = await fetchAiStatus(input, controller.signal);
      if (inFlight.current !== controller) return;
      setState((current) => (current.kind === "done" && current.plan === plan ? { ...current, ai } : current));
    } catch {
      if (inFlight.current !== controller) return;
      setState((current) =>
        current.kind === "done"
          ? { ...current, ai: { status: "fallback", reason: "timeout" } }
          : { kind: "error", message: "The planner took too long to respond. Please try again.", fieldErrors: {} },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  return (
    <>
      <p className="sr-only" role="status" aria-live="polite">{statusText(state)}</p>
      <section aria-labelledby="form-heading" className="card">
        <h2 id="form-heading" tabIndex={-1} ref={formHeading}>Your celebration</h2>
        <PlannerForm
          busy={state.kind === "loading"}
          fieldErrors={state.kind === "error" ? state.fieldErrors : {}}
          formError={state.kind === "error" ? state.message : null}
          onSubmit={handleSubmit}
        />
      </section>
      {state.kind === "done" && (
        <PlanView plan={state.plan} ai={state.ai} headingRef={resultsHeading} onEdit={() => formHeading.current?.focus()} />
      )}
    </>
  );
}
