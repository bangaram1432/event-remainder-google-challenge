import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { buildIcs, escapeIcsText, foldIcsLine } from "@/domain/ics";
import { buildPlan } from "@/domain/plan";
import { TODAY, makeInput } from "./helpers";

const NOW = new Date("2026-10-21T10:15:30.123Z");
const octets = (s: string) => new TextEncoder().encode(s).length;

describe("iCalendar export", () => {
  const plan = buildPlan(makeInput({ eventDate: addDays(TODAY, 300) }), TODAY);
  const ics = buildIcs(plan, NOW);

  it("is a well-formed calendar with CRLF line endings", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(/(?<!\r)\n/.test(ics)).toBe(false);
  });

  it("contains one event per timeline item with unique UIDs and a UTC timestamp", () => {
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(plan.timeline.items.length);
    expect(ics.match(/END:VEVENT/g)).toHaveLength(plan.timeline.items.length);
    const uids = ics.match(/^UID:.+$/gm) ?? [];
    expect(new Set(uids).size).toBe(plan.timeline.items.length);
    expect(ics).toContain("DTSTAMP:20261021T101530Z");
  });

  it("uses all-day events whose end is the next day", () => {
    const first = plan.timeline.items[0]!;
    expect(ics).toContain(`DTSTART;VALUE=DATE:${first.dueDate.replaceAll("-", "")}`);
    expect(ics).toContain(`DTEND;VALUE=DATE:${addDays(first.dueDate, 1).replaceAll("-", "")}`);
  });

  it("never exceeds 75 octets per physical line", () => {
    for (const line of ics.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
  });

  it("escapes special characters and adds reminders for critical items", () => {
    const community = buildIcs(buildPlan(makeInput({ eventType: "community", eventDate: addDays(TODAY, 300) }), TODAY), NOW);
    expect(community).toContain("SUMMARY:Confirm food\\, sound and equipment suppliers");
    expect(community).toContain("BEGIN:VALARM");
    expect(escapeIcsText("a,b;c\\d\ne")).toBe("a\\,b\\;c\\\\d\\ne");
  });

  it("folds long and multi-byte lines losslessly", () => {
    const long = `SUMMARY:${"é".repeat(120)}`;
    const folded = foldIcsLine(long);
    for (const line of folded.split("\r\n")) expect(octets(line)).toBeLessThanOrEqual(75);
    expect(folded.replaceAll("\r\n ", "")).toBe(long);
    expect(foldIcsLine("short")).toBe("short");
  });
});
