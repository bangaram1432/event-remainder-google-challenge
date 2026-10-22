import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { buildPlan } from "@/domain/plan";
import { EVENT_TYPES } from "@/domain/types";
import { TODAY, makeInput } from "./helpers";

describe("buildPlan", () => {
  it("produces a coherent plan for every event type", () => {
    for (const eventType of EVENT_TYPES) {
      const input = makeInput({ eventType, eventDate: addDays(TODAY, 100) });
      const plan = buildPlan(input, TODAY);
      expect(plan.budget.lines.reduce((a, l) => a + l.amount, 0)).toBe(input.budget);
      expect(plan.summary).toContain("120-guest");
      expect(plan.ideas.length).toBeGreaterThanOrEqual(1);
      expect(plan.ideas.length).toBeLessThanOrEqual(3);
      expect(plan.vendors.length).toBeGreaterThan(3);
      expect(plan.vendors.some((v) => (v.categoryId as string) === "contingency")).toBe(false);
      for (const vendor of plan.vendors) {
        if (vendor.bookBy) expect(vendor.bookBy <= input.eventDate).toBe(true);
        expect(vendor.questions.length).toBeGreaterThanOrEqual(2);
        expect(vendor.contractChecks.length).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it("is deterministic", () => {
    const input = makeInput();
    expect(JSON.stringify(buildPlan(input, TODAY))).toBe(JSON.stringify(buildPlan(input, TODAY)));
  });

  it("links vendor 'book by' dates to the critical timeline items", () => {
    const plan = buildPlan(makeInput({ eventDate: addDays(TODAY, 400) }), TODAY);
    const caterer = plan.vendors.find((v) => v.categoryId === "catering");
    const milestone = plan.timeline.items.find((i) => i.id === "book-caterer");
    expect(caterer?.bookBy).toBe(milestone?.dueDate);
  });

  it("tailors vendor questions to context", () => {
    const venueQuestions = (o: Parameters<typeof makeInput>[0]) =>
      buildPlan(makeInput(o), TODAY).vendors.find((v) => v.categoryId === "venue")?.questions.join(" ") ?? "";
    expect(venueQuestions({ setting: "outdoor" })).toContain("weather backup");
    expect(venueQuestions({ setting: "indoor" })).not.toContain("weather backup");
    expect(venueQuestions({ guestCount: 400 })).toContain("parking");
    const owned = buildPlan(makeInput({ venueCost: "free-or-owned" }), TODAY).vendors.find((v) => v.categoryId === "venue");
    expect(owned?.vendorType).toContain("free or owned");
    expect(owned?.quotesToCollect).toBe(0);
  });

  it("orders warnings by severity", () => {
    const plan = buildPlan(makeInput({ eventDate: addDays(TODAY, 5), guestCount: 200, budget: 200_000, setting: "outdoor" }), TODAY);
    const order = { critical: 0, warning: 1, info: 2 } as const;
    const ranks = plan.warnings.map((w) => order[w.severity]);
    expect([...ranks].sort()).toEqual(ranks);
    expect(plan.warnings[0]?.severity).toBe("critical");
  });

  it("picks curated ideas that suit the budget tier and setting", () => {
    const titles = (o: Parameters<typeof makeInput>[0]) => buildPlan(makeInput(o), TODAY).ideas.map((i) => i.title);
    expect(titles({ guestCount: 200, budget: 200_000 })).toContain("Two-tier guest list");
    expect(titles({ guestCount: 50, budget: 5_000_000 })).not.toContain("Two-tier guest list");
  });
});
