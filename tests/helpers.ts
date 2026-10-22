import type { PlanInput } from "@/domain/types";

/** A fixed "today" keeps every date-dependent test deterministic. */
export const TODAY = "2026-10-21";

export function makeInput(overrides: Partial<PlanInput> = {}): PlanInput {
  return {
    eventType: "wedding",
    eventDate: "2027-08-21",
    guestCount: 120,
    budget: 1_200_000,
    currency: "INR",
    city: "Guntur",
    venueCost: "paid",
    setting: "indoor",
    priorities: [],
    notes: "",
    ...overrides,
  };
}
