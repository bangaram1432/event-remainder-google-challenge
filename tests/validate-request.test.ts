import { describe, expect, it } from "vitest";
import { addDays } from "@/domain/dates";
import { parsePlanInput } from "@/server/validate-request";
import { TODAY, makeInput } from "./helpers";

const valid = () => ({ ...makeInput({ eventDate: addDays(TODAY, 120), notes: "Mehendi night" }) });
const errorsFor = (body: unknown) => {
  const result = parsePlanInput(body, TODAY);
  return result.ok ? {} : result.errors;
};

describe("parsePlanInput", () => {
  it("accepts a valid request and returns a clean copy", () => {
    const result = parsePlanInput({ ...valid(), extra: "ignored" }, TODAY);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual(valid());
      expect("extra" in result.value).toBe(false);
    }
  });

  it("rejects non-object bodies", () => {
    for (const body of [null, [], "text", 42, undefined]) expect(parsePlanInput(body, TODAY).ok).toBe(false);
  });

  it("ignores prototype-pollution attempts", () => {
    const body = JSON.parse(`{"__proto__":{"polluted":true},"constructor":{"x":1},"eventType":"wedding"}`);
    const result = parsePlanInput({ ...valid(), ...body }, TODAY);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(result.ok).toBe(true);
    if (result.ok) expect("polluted" in result.value).toBe(false);
  });

  const badFields: Array<[string, string, unknown]> = [
    ["eventType", "an unknown event type", "funeral"],
    ["eventDate", "an impossible date", "2027-02-30"],
    ["eventDate", "a past date", addDays(TODAY, -1)],
    ["eventDate", "a date beyond the horizon", addDays(TODAY, 2000)],
    ["guestCount", "zero guests", 0],
    ["guestCount", "too many guests", 2001],
    ["guestCount", "a fractional guest count", 10.5],
    ["guestCount", "a numeric string", "100"],
    ["budget", "a budget below the minimum", 99],
    ["budget", "an absurd budget", 1e12],
    ["budget", "NaN", Number.NaN],
    ["currency", "an unsupported currency", "BTC"],
    ["venueCost", "an unknown venue option", "maybe"],
    ["setting", "an unknown setting", "underwater"],
  ];
  it.each(badFields)("reports a specific message for %s: %s", (field, _label, value) => {
    expect(errorsFor({ ...valid(), [field]: value })[field as keyof ReturnType<typeof valid>]).toBeDefined();
  });

  it("explains date problems in actionable terms", () => {
    expect(errorsFor({ ...valid(), eventDate: addDays(TODAY, -1) }).eventDate).toContain(TODAY);
    expect(errorsFor({ ...valid(), eventDate: addDays(TODAY, 2000) }).eventDate).toContain("five years");
  });

  it("accepts today and the far edge of the horizon", () => {
    expect(parsePlanInput({ ...valid(), eventDate: TODAY }, TODAY).ok).toBe(true);
    expect(parsePlanInput({ ...valid(), eventDate: addDays(TODAY, 1825) }, TODAY).ok).toBe(true);
  });

  it("limits and de-duplicates priorities", () => {
    expect(errorsFor({ ...valid(), priorities: ["food", "venue", "decor", "entertainment"] }).priorities).toBeDefined();
    expect(errorsFor({ ...valid(), priorities: ["food", "teleportation"] }).priorities).toBeDefined();
    expect(errorsFor({ ...valid(), priorities: "food" }).priorities).toBeDefined();
    const result = parsePlanInput({ ...valid(), priorities: ["food", "food"] }, TODAY);
    expect(result.ok && result.value.priorities).toEqual(["food"]);
  });

  it("sanitises free text and enforces its length", () => {
    const result = parsePlanInput({ ...valid(), notes: "Hello\u0000\u200B   world", city: "  Vijayawada " }, TODAY);
    expect(result.ok && result.value.notes).toBe("Hello world");
    expect(result.ok && result.value.city).toBe("Vijayawada");
    expect(errorsFor({ ...valid(), notes: "x".repeat(601) }).notes).toBeDefined();
    expect(errorsFor({ ...valid(), city: "x".repeat(81) }).city).toBeDefined();
    expect(errorsFor({ ...valid(), notes: 123 }).notes).toBeDefined();
    expect(parsePlanInput({ ...valid(), notes: "x".repeat(600) }, TODAY).ok).toBe(true);
  });

  it("treats missing optional fields as empty", () => {
    const rest: Record<string, unknown> = { ...valid() };
    delete rest.notes;
    delete rest.city;
    delete rest.priorities;
    const result = parsePlanInput(rest, TODAY);
    expect(result.ok && result.value.notes).toBe("");
    expect(result.ok && result.value.priorities).toEqual([]);
  });

  it("reports every problem at once", () => {
    expect(Object.keys(errorsFor({}))).toEqual(expect.arrayContaining(["eventType", "eventDate", "guestCount", "budget", "currency", "venueCost", "setting"]));
  });
});
