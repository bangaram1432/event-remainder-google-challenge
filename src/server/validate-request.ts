import { daysBetween, parseIsoDate } from "@/domain/dates";
import {
  CURRENCIES, EVENT_TYPES, LIMITS, PRIORITIES, SETTINGS, VENUE_COSTS, isOneOf,
  type FieldErrors, type PlanInput, type Priority,
} from "@/domain/types";
import { codePointLength, sanitizeFreeText } from "@/security/sanitize";

export type { FieldErrors };
export type ParseResult = { ok: true; value: PlanInput } | { ok: false; errors: FieldErrors };

/** One field's outcome: a cleaned value, or a message the user can act on. */
type Parsed<T> = { value: T } | { error: string };

const own = (source: Record<string, unknown>, key: string): unknown => (Object.hasOwn(source, key) ? source[key] : undefined);

function parseEnum<T extends readonly string[]>(list: T, raw: unknown, message: string): Parsed<T[number]> {
  return isOneOf(list, raw) ? { value: raw } : { error: message };
}

function parseInteger(raw: unknown, min: number, max: number, message: string): Parsed<number> {
  return typeof raw === "number" && Number.isSafeInteger(raw) && raw >= min && raw <= max ? { value: raw } : { error: message };
}

function parseEventDate(raw: unknown, today: string): Parsed<string> {
  if (typeof raw !== "string" || parseIsoDate(raw) === null) return { error: "Enter a valid date." };
  const daysAway = daysBetween(today, raw);
  if (daysAway < 0) return { error: `Choose ${today} or a later date.` };
  if (daysAway > LIMITS.horizonDays) return { error: "Choose a date within the next five years." };
  return { value: raw };
}

function parsePriorities(raw: unknown): Parsed<Priority[]> {
  if (!Array.isArray(raw) || !raw.every((item) => isOneOf(PRIORITIES, item))) return { error: "Choose priorities from the list." };
  const unique = [...new Set(raw as Priority[])];
  return unique.length > LIMITS.maxPriorities ? { error: `Choose at most ${LIMITS.maxPriorities} priorities.` } : { value: unique };
}

function parseOptionalText(raw: unknown, max: number, label: string): Parsed<string> {
  if (raw === undefined || raw === null) return { value: "" };
  if (typeof raw !== "string") return { error: `${label} must be text.` };
  const text = sanitizeFreeText(raw, max + 1);
  return codePointLength(text) > max ? { error: `Keep ${label.toLowerCase()} under ${max} characters.` } : { value: text };
}

type FieldResults = { [K in keyof PlanInput]: Parsed<PlanInput[K]> };

/**
 * Allow-list validation of an untrusted request body. A fresh object is built field by field, so unknown
 * keys (including `__proto__`) can never reach the planner. `today` is injected to keep this pure.
 */
export function parsePlanInput(raw: unknown, today: string): ParseResult {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, errors: { eventType: "Send the event details as a JSON object." } };
  }
  const body = raw as Record<string, unknown>;
  const results: FieldResults = {
    eventType: parseEnum(EVENT_TYPES, own(body, "eventType"), "Choose a wedding, birthday or community event."),
    eventDate: parseEventDate(own(body, "eventDate"), today),
    guestCount: parseInteger(own(body, "guestCount"), 1, LIMITS.guestMax, `Enter a whole number of guests from 1 to ${LIMITS.guestMax}.`),
    budget: parseInteger(own(body, "budget"), LIMITS.budgetMin, LIMITS.budgetMax, `Enter a whole-number budget from ${LIMITS.budgetMin} to ${LIMITS.budgetMax.toLocaleString("en-US")}.`),
    currency: parseEnum(CURRENCIES, own(body, "currency"), "Choose a supported currency."),
    city: parseOptionalText(own(body, "city"), LIMITS.cityMax, "City"),
    venueCost: parseEnum(VENUE_COSTS, own(body, "venueCost"), "Say whether you pay for the venue."),
    setting: parseEnum(SETTINGS, own(body, "setting"), "Choose indoor, outdoor or either."),
    priorities: parsePriorities(own(body, "priorities") ?? []),
    notes: parseOptionalText(own(body, "notes"), LIMITS.notesMax, "Notes"),
  };

  const errors: FieldErrors = {};
  const values: Record<string, unknown> = {};
  for (const [field, result] of Object.entries(results) as Array<[keyof PlanInput, Parsed<unknown>]>) {
    if ("error" in result) errors[field] = result.error;
    else values[field] = result.value;
  }
  // Safe cast: with no errors recorded, every field above contributed a validated value.
  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, value: values as unknown as PlanInput };
}
