import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { buildTimeline } from "@/domain/timeline";
import { EVENT_TYPES } from "@/domain/types";
import { TODAY, makeInput } from "./helpers";

const far = addDays(TODAY, 400);

describe("buildTimeline", () => {
  it("uses the full ideal lead time when there is plenty of time", () => {
    const { timeline, warnings } = buildTimeline(makeInput({ eventDate: far }), TODAY);
    expect(timeline.compressed).toBe(false);
    expect(warnings).toHaveLength(0);
    expect(timeline.items[0]?.id).toBe("set-budget");
    expect(timeline.items[0]?.dueDate).toBe(addDays(far, -270));
    expect(timeline.items.at(-1)?.phase).toBe("after");
  });

  it("is sorted by due date and has unique ids for every event type", () => {
    for (const eventType of EVENT_TYPES) {
      const { timeline } = buildTimeline(makeInput({ eventType, eventDate: far, setting: "outdoor", guestCount: 300 }), TODAY);
      const dates = timeline.items.map((i) => i.dueDate);
      expect([...dates].sort()).toEqual(dates);
      expect(new Set(timeline.items.map((i) => i.id)).size).toBe(timeline.items.length);
    }
  });

  it("compresses proportionally when time is short and never schedules work in the past", () => {
    for (const eventType of EVENT_TYPES) {
      for (const days of [0, 1, 5, 13, 30, 90, 200]) {
        const eventDate = addDays(TODAY, days);
        const { timeline, warnings } = buildTimeline(makeInput({ eventType, eventDate }), TODAY);
        for (const item of timeline.items) {
          if (item.phase === "before") expect(item.dueDate >= TODAY).toBe(true);
          if (item.phase === "event-day") expect(item.dueDate).toBe(eventDate);
        }
        if (timeline.compressed) expect(warnings).toHaveLength(1);
      }
    }
  });

  it("reports how much it compressed and what to do first", () => {
    const { timeline, warnings } = buildTimeline(makeInput({ eventDate: addDays(TODAY, 90) }), TODAY);
    expect(timeline.compressed).toBe(true);
    expect(timeline.compressionPercent).toBe(67);
    expect(warnings[0]?.code).toBe("timeline-compressed");
    expect(warnings[0]?.message).toContain("Do these first");
  });

  it("escalates to a critical rush warning inside two weeks", () => {
    const { warnings, timeline } = buildTimeline(makeInput({ eventDate: addDays(TODAY, 5) }), TODAY);
    expect(warnings[0]?.code).toBe("timeline-rush");
    expect(warnings[0]?.severity).toBe("critical");
    expect(timeline.items.some((i) => i.urgency === "now")).toBe(true);
  });

  it("handles an event happening today", () => {
    const { timeline } = buildTimeline(makeInput({ eventDate: TODAY }), TODAY);
    expect(timeline.daysAvailable).toBe(0);
    expect(timeline.items.filter((i) => i.phase === "before").every((i) => i.dueDate === TODAY)).toBe(true);
  });

  it("adapts milestones to context", () => {
    const ids = (overrides: Parameters<typeof makeInput>[0]) => buildTimeline(makeInput({ eventDate: far, ...overrides }), TODAY).timeline.items.map((i) => i.id);
    expect(ids({ setting: "indoor" })).not.toContain("weather-plan");
    expect(ids({ setting: "outdoor" })).toContain("weather-plan");
    expect(ids({ venueCost: "paid" })).toContain("book-venue");
    expect(ids({ venueCost: "free-or-owned" })).not.toContain("book-venue");
    expect(ids({ venueCost: "free-or-owned" })).toContain("confirm-venue");
    expect(ids({ guestCount: 100 })).not.toContain("crowd-plan");
    expect(ids({ guestCount: 400 })).toContain("crowd-plan");
  });
});
