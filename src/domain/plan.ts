import { allocateBudget } from "./budget";
import { buildVendorChecklists } from "./checklist";
import { formatMoney } from "./format";
import { selectIdeas } from "./ideas";
import { buildTimeline } from "./timeline";
import type { Plan, PlanInput, PlanWarning, Severity } from "./types";

const SEVERITY_ORDER: Readonly<Record<Severity, number>> = { critical: 0, warning: 1, info: 2 };

export const ASSUMPTIONS: readonly string[] = [
  "Budget shares start from typical ratios for each event type, then adjust for guest count, venue cost, indoor or outdoor setting and your priorities. The ratios live in src/domain/catalog.ts.",
  "Per-guest food floors are illustrative planning figures, not quotes. Always collect the number of vendor quotes shown in each checklist.",
  "Timelines count calendar days in UTC and assume a first-time organiser; they compress when there is less time than usual.",
  "Free-text notes and the city are used only to personalise ideas. They are never stored.",
];

const EVENT_NOUN = { wedding: "wedding", birthday: "birthday party", community: "community event" } as const;

function buildSummary(input: PlanInput, perGuest: number, daysAvailable: number, compressed: boolean): string {
  const money = (n: number) => formatMoney(n, input.currency);
  const days = daysAvailable === 1 ? "1 day" : `${daysAvailable} days`;
  return (
    `A ${input.guestCount}-guest ${EVENT_NOUN[input.eventType]} on ${input.eventDate} with a ${money(input.budget)} budget ` +
    `(${money(perGuest)} per guest). ${days} to go${compressed ? ", so the schedule is compressed" : ""}.`
  );
}

/** Pure, deterministic baseline plan. No network, no clock: `today` is passed in. */
export function buildPlan(input: PlanInput, today: string): Plan {
  const { budget, warnings: budgetWarnings } = allocateBudget(input);
  const { timeline, warnings: timelineWarnings } = buildTimeline(input, today);
  const warnings: PlanWarning[] = [...budgetWarnings, ...timelineWarnings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
  return {
    input,
    generatedOn: today,
    summary: buildSummary(input, Math.round(input.budget / input.guestCount), timeline.daysAvailable, timeline.compressed),
    budget,
    timeline,
    vendors: buildVendorChecklists(input, budget, timeline.items),
    ideas: selectIdeas(input, budget.tier),
    warnings,
    assumptions: [...ASSUMPTIONS],
  };
}
