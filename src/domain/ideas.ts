import { IDEA_POOL } from "./catalog";
import type { BudgetTier, Idea, PlanInput } from "./types";

const MAX_CURATED_IDEAS = 3;

/** Rule-based ideas that always work, even when the AI layer is off. Filtered by budget tier and setting. */
export function selectIdeas(input: PlanInput, tier: BudgetTier): Idea[] {
  return IDEA_POOL[input.eventType]
    .filter((idea) => idea.tiers.includes(tier))
    .filter((idea) => !idea.settings || input.setting === "either" || idea.settings.includes(input.setting))
    .slice(0, MAX_CURATED_IDEAS)
    .map(({ title, description }) => ({ title, description, source: "curated" as const }));
}
