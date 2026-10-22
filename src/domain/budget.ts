import {
  BASE_WEIGHTS, CATEGORY_LABELS, CATERING_FLOOR_MULTIPLIER, CATERING_FLOOR_PER_GUEST, GUEST_SENSITIVITY,
  OUTDOOR_RESERVE_BONUS, PRIORITY_LABELS, PRIORITY_TARGETS, RESERVE_PERCENT, TIER_THRESHOLDS,
} from "./catalog";
import { formatMoney } from "./format";
import type { BudgetLine, BudgetPlan, BudgetTier, CategoryId, PlanInput, PlanWarning } from "./types";

const PRIORITY_BOOST = 1.35;
const FREE_VENUE_FACTOR = 0.15;
const OUTDOOR_FACTORS: Readonly<Partial<Record<CategoryId, number>>> = { decor: 0.85, logistics: 1.35 };
const REFERENCE_GUESTS = 80;
const MIN_NOTICEABLE_GUEST_SHIFT = 0.03;
const DEFAULT_RATIONALE = "Typical share for this kind of event.";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Splits `total` into integer parts proportional to `weights` using the largest-remainder method,
 * so the parts always add up to exactly `total` (no floating-point drift, no missing rupee).
 */
export function apportion(total: number, weights: readonly number[]): number[] {
  if (!Number.isInteger(total) || total < 0) throw new RangeError("total must be a non-negative integer");
  if (weights.length === 0) return [];
  const sum = weights.reduce((acc, w) => acc + w, 0);
  if (!(sum > 0) || weights.some((w) => !Number.isFinite(w) || w < 0)) {
    throw new RangeError("weights must be finite, non-negative and sum to more than zero");
  }
  const exact = weights.map((w) => (total * w) / sum);
  const parts = exact.map(Math.floor);
  let remainder = total - parts.reduce((acc, p) => acc + p, 0);
  const byFraction = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const { index } of byFraction) {
    if (remainder <= 0) break;
    parts[index] = (parts[index] ?? 0) + 1;
    remainder -= 1;
  }
  return parts;
}

interface WeightedCategory {
  id: CategoryId;
  weight: number;
  reasons: string[];
}

function guestReason(shift: number, guestFactor: number, guests: number): string | null {
  if (Math.abs(shift) < MIN_NOTICEABLE_GUEST_SHIFT) return null;
  if (shift > 0) {
    return guestFactor > 0 ? `Scaled up for ${guests} guests.` : `Weighted up for an intimate guest list of ${guests}.`;
  }
  return guestFactor > 0 ? `Eased back to fund food and logistics for ${guests} guests.` : `Scaled down for a smaller guest list of ${guests}.`;
}

function effectiveWeights(input: PlanInput): WeightedCategory[] {
  const guestFactor = clamp(Math.log2(input.guestCount / REFERENCE_GUESTS), -1.5, 2);
  const prioritisedBy = new Map<CategoryId, string[]>();
  for (const priority of input.priorities) {
    for (const id of PRIORITY_TARGETS[priority]) {
      prioritisedBy.set(id, [...(prioritisedBy.get(id) ?? []), PRIORITY_LABELS[priority]]);
    }
  }
  return BASE_WEIGHTS[input.eventType].map(([id, base]) => {
    const reasons: string[] = [];
    const guestShift = (GUEST_SENSITIVITY[id] ?? 0) * guestFactor;
    const guest = guestReason(guestShift, guestFactor, input.guestCount);
    if (guest) reasons.push(guest);
    let weight = base * (1 + guestShift);
    if (id === "venue" && input.venueCost === "free-or-owned") {
      weight *= FREE_VENUE_FACTOR;
      reasons.push("The venue is free or owned, so only deposits, cleaning and permits are budgeted.");
    }
    if (input.setting === "outdoor" && OUTDOOR_FACTORS[id] !== undefined) {
      weight *= OUTDOOR_FACTORS[id] ?? 1;
      reasons.push(id === "decor" ? "Outdoor spaces need less built décor." : "Outdoor events need tents, power and weather backup.");
    }
    const labels = prioritisedBy.get(id);
    if (labels) {
      weight *= PRIORITY_BOOST;
      reasons.push(`Boosted because you prioritised ${labels.join(" and ")}.`);
    }
    return { id, weight, reasons };
  });
}

function makeLine(categoryId: CategoryId, amount: number, input: PlanInput, rationale: string): BudgetLine {
  return {
    categoryId,
    label: CATEGORY_LABELS[categoryId],
    amount,
    sharePercent: Math.round((amount / input.budget) * 1000) / 10,
    perGuest: Math.round(amount / input.guestCount),
    rationale,
  };
}

/** Rounds up to two significant figures so suggestions read like a human wrote them (1,43,210 -> 1,50,000). */
export function roundUpTwoSignificant(value: number): number {
  if (value < 100) return Math.ceil(value);
  const magnitude = 10 ** (Math.floor(Math.log10(value)) - 1);
  return Math.ceil(value / magnitude) * magnitude;
}

function tierFor(ratio: number): BudgetTier {
  if (ratio < TIER_THRESHOLDS.stretchedBelow) return "stretched";
  return ratio >= TIER_THRESHOLDS.generousFrom ? "generous" : "balanced";
}

export interface BudgetResult {
  budget: BudgetPlan;
  warnings: PlanWarning[];
}

/** Deterministic budget engine: context in, an exact, explainable allocation out. */
export function allocateBudget(input: PlanInput): BudgetResult {
  const outdoor = input.setting === "outdoor";
  const reservePercent = RESERVE_PERCENT[input.eventType] + (outdoor ? OUTDOOR_RESERVE_BONUS : 0);
  const reserve = Math.round((input.budget * reservePercent) / 100);
  const weighted = effectiveWeights(input);
  const amounts = apportion(input.budget - reserve, weighted.map((w) => w.weight));

  const lines = weighted.map((w, index) =>
    makeLine(w.id, amounts[index] ?? 0, input, w.reasons.join(" ") || DEFAULT_RATIONALE),
  );
  const reserveReason = `Held back for surprises: ${reservePercent}% of the budget${outdoor ? ", raised because outdoor events need weather backup" : ""}.`;
  lines.push(makeLine("contingency", reserve, input, reserveReason));

  const cateringAmount = lines.find((line) => line.categoryId === "catering")?.amount ?? 0;
  const cateringPerGuest = Math.round(cateringAmount / input.guestCount);
  const floor = Math.round(CATERING_FLOOR_PER_GUEST[input.currency] * CATERING_FLOOR_MULTIPLIER[input.eventType]);
  const tier = tierFor(cateringPerGuest / floor);
  const money = (amount: number) => formatMoney(amount, input.currency);

  const warnings: PlanWarning[] = [];
  if (tier === "stretched") {
    const affordableGuests = Math.max(1, Math.floor(cateringAmount / floor));
    const cateringShare = cateringAmount / input.budget;
    const neededTotal = cateringShare > 0 ? roundUpTwoSignificant((floor * input.guestCount) / cateringShare) : input.budget;
    warnings.push({
      code: "budget-stretched",
      severity: "warning",
      message:
        `Food works out to about ${money(cateringPerGuest)} per guest, below the roughly ${money(floor)} most caterers need. ` +
        `Either trim the guest list to about ${affordableGuests} or raise the budget by around ${money(Math.max(0, neededTotal - input.budget))}.`,
    });
  }
  if (input.venueCost === "free-or-owned") {
    warnings.push({ code: "venue-free", severity: "info", message: "Venue spend is kept small (cleaning, deposits, permits) because the space is free or owned. The saving is shared across the other categories." });
  }
  if (outdoor) {
    warnings.push({ code: "outdoor-reserve", severity: "info", message: `The contingency reserve is ${reservePercent}% because outdoor events need weather backup such as tents or a fallback space.` });
  }

  return {
    budget: { total: input.budget, currency: input.currency, lines, tier, cateringPerGuest, cateringFloorPerGuest: floor },
    warnings,
  };
}
