import { describe, expect, it } from "vitest";
import { addDays, daysBetween, parseIsoDate, todayIso } from "@/domain/dates";
import { formatMoney } from "@/domain/format";

describe("dates", () => {
  it("accepts real calendar dates, including leap days", () => {
    expect(parseIsoDate("2028-02-29")).not.toBeNull();
    expect(parseIsoDate("2026-12-31")).not.toBeNull();
  });

  const invalid = ["2027-02-29", "2026-13-01", "2026-00-10", "2026-04-31", "26-01-01", "2026/01/01", "", "2026-1-1", "0050-01-01"];
  it.each(invalid.map((value): [string] => [value]))("rejects impossible or malformed date %s", (value) => {
    expect(parseIsoDate(value)).toBeNull();
  });

  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2027-03-01", -1)).toBe("2027-02-28");
    expect(addDays("2026-10-21", 0)).toBe("2026-10-21");
  });

  it("counts whole days in both directions, unaffected by DST", () => {
    expect(daysBetween("2026-10-21", "2026-10-22")).toBe(1);
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(daysBetween("2026-10-21", "2026-10-11")).toBe(-10);
  });

  it("derives today in UTC", () => {
    expect(todayIso(new Date("2026-10-21T23:59:59Z"))).toBe("2026-10-21");
  });

  it("throws on invalid input rather than computing nonsense", () => {
    expect(() => addDays("nope", 1)).toThrow(RangeError);
  });

  it("formats money with locale-appropriate grouping", () => {
    expect(formatMoney(1200000, "INR")).toContain("12,00,000");
    expect(formatMoney(1200000, "USD")).toContain("1,200,000");
  });
});
