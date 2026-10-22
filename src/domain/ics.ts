import { addDays } from "./dates";
import type { Plan } from "./types";

const CRLF = "\r\n";
const MAX_LINE_OCTETS = 75;

/** RFC 5545 §3.3.11 text escaping. */
export function escapeIcsText(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** Folds a content line at 75 octets (never splitting a UTF-8 character), per RFC 5545 §3.1. */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const physical: string[] = [];
  let current = "";
  let octets = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (octets + size > MAX_LINE_OCTETS) {
      physical.push(current);
      current = " ";
      octets = 1;
    }
    current += char;
    octets += size;
  }
  physical.push(current);
  return physical.join(CRLF);
}

function stamp(now: Date): string {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const dateValue = (iso: string) => iso.replaceAll("-", "");

/** Exports the timeline as an iCalendar file that imports into Google Calendar, Apple Calendar and Outlook. */
export function buildIcs(plan: Plan, now: Date): string {
  const { eventType, eventDate } = plan.input;
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Celebration Event Planner//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeIcsText(`${eventType} plan for ${eventDate}`)}`,
  ];
  for (const item of plan.timeline.items) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${item.id}-${eventDate}@celebration-event-planner`,
      `DTSTAMP:${stamp(now)}`,
      `DTSTART;VALUE=DATE:${dateValue(item.dueDate)}`,
      `DTEND;VALUE=DATE:${dateValue(addDays(item.dueDate, 1))}`,
      `SUMMARY:${escapeIcsText(item.title)}`,
      `DESCRIPTION:${escapeIcsText(item.detail)}`,
      "TRANSP:TRANSPARENT",
    );
    if (item.critical) {
      lines.push("BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${escapeIcsText(item.title)}`, "TRIGGER:-P1D", "END:VALARM");
    }
    lines.push("END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return lines.map(foldIcsLine).join(CRLF) + CRLF;
}
