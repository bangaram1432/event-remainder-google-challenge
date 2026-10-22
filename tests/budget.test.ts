import { describe, expect, it } from "vitest";
import { allocateBudget, apportion, roundUpTwoSignificant } from "@/domain/budget";
import { CURRENCIES, EVENT_TYPES, PRIORITIES, SETTINGS, VENUE_COSTS, type Priority } from "@/domain/types";
import { makeInput } from "./helpers";

describe("apportion", () => {
  it("splits proportionally", () => expect(apportion(100, [1, 1, 2])).toEqual([25, 25, 50]));
  it("gives leftovers to the largest remainders, ties to the earliest", () => expect(apportion(10, [1, 1, 1])).toEqual([4, 3, 3]));
  it("handles zero totals and empty lists", () => {
    expect(apportion(0, [1, 2])).toEqual([0, 0]);
    expect(apportion(5, [])).toEqual([]);
  });
  it("rejects invalid input", () => {
    expect(() => apportion(1.5, [1])).toThrow(RangeError);
    expect(() => apportion(-1, [1])).toThrow(RangeError);
    expect(() => apportion(10, [0, 0])).toThrow(RangeError);
    expect(() => apportion(10, [1, -1])).toThrow(RangeError);
    expect(() => apportion(10, [1, Number.NaN])).toThrow(RangeError);
  });
});

describe("roundUpTwoSignificant", () => {
  it("rounds up to a human-friendly figure", () => {
    expect(roundUpTwoSignificant(143_210)).toBe(150_000);
    expect(roundUpTwoSignificant(1_000_000)).toBe(1_000_000);
    expect(roundUpTwoSignificant(42.2)).toBe(43);
  });
});

describe("allocateBudget", () => {
  it("always allocates exactly the whole budget, across a wide sweep of inputs", () => {
    let seed = 42;
    const next = () => (seed = (seed * 1_664_525 + 1_013_904_223) % 4_294_967_296) / 4_294_967_296;
    const pick = <T,>(list: readonly T[]): T => list[Math.floor(next() * list.length)] as T;
    for (let i = 0; i < 400; i += 1) {
      const input = makeInput({
        eventType: pick(EVENT_TYPES), currency: pick(CURRENCIES), venueCost: pick(VENUE_COSTS), setting: pick(SETTINGS),
        guestCount: 1 + Math.floor(next() * 2000), budget: 100 + Math.floor(next() * 50_000_000),
        priorities: [...new Set([pick(PRIORITIES), pick(PRIORITIES), pick(PRIORITIES)])],
      });
      const { budget } = allocateBudget(input);
      const sum = budget.lines.reduce((acc, line) => acc + line.amount, 0);
      expect(sum).toBe(input.budget);
      for (const line of budget.lines) {
        expect(Number.isInteger(line.amount)).toBe(true);
        expect(line.amount).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("always ends with the contingency reserve and reflects the event type", () => {
    const { budget } = allocateBudget(makeInput({ eventType: "birthday" }));
    expect(budget.lines.at(-1)?.categoryId).toBe("contingency");
    expect(budget.lines.some((l) => l.categoryId === "attire-styling")).toBe(false);
    expect(allocateBudget(makeInput({ eventType: "wedding" })).budget.lines.some((l) => l.categoryId === "attire-styling")).toBe(true);
  });

  it("shrinks venue spend when the venue is free or owned and hands the saving to other categories", () => {
    const share = (r: ReturnType<typeof allocateBudget>, id: string) => r.budget.lines.find((l) => l.categoryId === id)?.amount ?? 0;
    const paid = allocateBudget(makeInput({ venueCost: "paid" }));
    const free = allocateBudget(makeInput({ venueCost: "free-or-owned" }));
    expect(share(free, "venue")).toBeLessThan(share(paid, "venue") / 3);
    expect(share(free, "catering")).toBeGreaterThan(share(paid, "catering"));
  });

  it("raises the reserve for outdoor events and explains why", () => {
    const indoor = allocateBudget(makeInput({ setting: "indoor" }));
    const outdoor = allocateBudget(makeInput({ setting: "outdoor" }));
    const reserve = (r: typeof indoor) => r.budget.lines.at(-1)?.sharePercent ?? 0;
    expect(reserve(outdoor)).toBeGreaterThan(reserve(indoor));
    expect(outdoor.warnings.some((w) => w.code === "outdoor-reserve")).toBe(true);
  });

  it("moves money toward stated priorities", () => {
    const catering = (priorities: Priority[]) =>
      allocateBudget(makeInput({ priorities })).budget.lines.find((l) => l.categoryId === "catering")?.amount ?? 0;
    expect(catering(["food"])).toBeGreaterThan(catering([]));
  });

  it("flags a stretched budget with a concrete way out", () => {
    const { budget, warnings } = allocateBudget(makeInput({ guestCount: 200, budget: 200_000 }));
    expect(budget.tier).toBe("stretched");
    const warning = warnings.find((w) => w.code === "budget-stretched");
    expect(warning?.severity).toBe("warning");
    expect(warning?.message).toContain("trim the guest list");
    expect(warning?.message).toContain("raise the budget");
  });

  it("classifies comfortable and generous budgets without warnings", () => {
    expect(allocateBudget(makeInput({ guestCount: 120, budget: 400_000 })).budget.tier).toBe("balanced");
    const generous = allocateBudget(makeInput({ guestCount: 50, budget: 5_000_000 }));
    expect(generous.budget.tier).toBe("generous");
    expect(generous.warnings.some((w) => w.code === "budget-stretched")).toBe(false);
  });

  it("stays valid at the extremes (one guest, tiny and huge budgets)", () => {
    for (const [guests, budget] of [[1, 100], [2000, 100], [1, 1_000_000_000], [2000, 1_000_000_000]] as const) {
      const { budget: plan } = allocateBudget(makeInput({ guestCount: guests, budget }));
      expect(plan.lines.reduce((a, l) => a + l.amount, 0)).toBe(budget);
    }
  });

  it("explains every line in plain language", () => {
    const { budget } = allocateBudget(makeInput({ venueCost: "free-or-owned", setting: "outdoor", priorities: ["food", "decor"], guestCount: 300 }));
    const why = (id: string) => budget.lines.find((l) => l.categoryId === id)?.rationale ?? "";
    for (const line of budget.lines) expect(line.rationale.length).toBeGreaterThan(10);
    expect(why("venue")).toContain("free or owned");
    expect(why("catering")).toContain("prioritised food & drink");
    expect(why("catering")).toContain("300 guests");
    expect(why("decor")).toContain("Outdoor");
    expect(why("logistics")).toContain("weather backup");
    expect(why("contingency")).toContain("13%");
  });

  it("falls back to a neutral explanation when nothing special applies", () => {
    const { budget } = allocateBudget(makeInput({ guestCount: 80, setting: "indoor" }));
    expect(budget.lines.find((l) => l.categoryId === "entertainment")?.rationale).toBe("Typical share for this kind of event.");
  });
});
