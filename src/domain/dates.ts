/**
 * Calendar-date helpers. Dates travel as `YYYY-MM-DD` strings and all arithmetic
 * is done on UTC midnights, so results never depend on the server's time zone or DST.
 */

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
export const MS_PER_DAY = 86_400_000;

/** Returns the UTC-midnight timestamp, or null when the string is not a real calendar date. */
export function parseIsoDate(value: string): number | null {
  const match = ISO_DATE.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const ms = Date.UTC(year, month - 1, day);
  const roundTrip = new Date(ms);
  const isReal =
    roundTrip.getUTCFullYear() === year && roundTrip.getUTCMonth() === month - 1 && roundTrip.getUTCDate() === day;
  return isReal ? ms : null;
}

function requireIsoDate(value: string): number {
  const ms = parseIsoDate(value);
  if (ms === null) throw new RangeError(`Invalid ISO date: ${value}`);
  return ms;
}

export function toIsoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return toIsoDate(requireIsoDate(iso) + days * MS_PER_DAY);
}

/** Whole days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((requireIsoDate(toIso) - requireIsoDate(fromIso)) / MS_PER_DAY);
}

export function todayIso(now: Date): string {
  return now.toISOString().slice(0, 10);
}
