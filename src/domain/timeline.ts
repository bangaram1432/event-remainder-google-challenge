import { MILESTONES } from "./catalog";
import { addDays, daysBetween } from "./dates";
import type { PlanInput, PlanWarning, Timeline, TimelineItem, TimelinePhase, Urgency } from "./types";

const NOW_WINDOW_DAYS = 3;
const SOON_WINDOW_DAYS = 14;
const RUSH_THRESHOLD_DAYS = 14;

function phaseOf(daysBefore: number): TimelinePhase {
  if (daysBefore > 0) return "before";
  return daysBefore === 0 ? "event-day" : "after";
}

function urgencyOf(phase: TimelinePhase, daysFromToday: number): Urgency {
  if (phase !== "before") return "scheduled";
  if (daysFromToday <= NOW_WINDOW_DAYS) return "now";
  return daysFromToday <= SOON_WINDOW_DAYS ? "soon" : "scheduled";
}

export interface TimelineResult {
  timeline: Timeline;
  warnings: PlanWarning[];
}

/**
 * Builds a dated milestone plan working backwards from the event date.
 * When there is less time than the ideal lead, pre-event milestones are compressed proportionally
 * (preserving their order) and the plan says so, rather than scheduling work in the past.
 * `today` is injected so the function stays pure and testable.
 */
export function buildTimeline(input: PlanInput, today: string): TimelineResult {
  const templates = MILESTONES[input.eventType].filter((t) => !t.when || t.when(input));
  const daysAvailable = Math.max(0, daysBetween(today, input.eventDate));
  const idealLeadDays = Math.max(0, ...templates.map((t) => t.daysBefore));
  const scale = idealLeadDays > 0 ? Math.min(1, daysAvailable / idealLeadDays) : 1;

  const items: TimelineItem[] = templates
    .map((template, order) => {
      const phase = phaseOf(template.daysBefore);
      const offset = phase === "before" ? Math.round(template.daysBefore * scale) : template.daysBefore;
      const dueDate = addDays(input.eventDate, -offset);
      const daysFromToday = daysBetween(today, dueDate);
      const item: TimelineItem = {
        id: template.id,
        title: template.title,
        detail: template.detail,
        dueDate,
        daysFromToday,
        phase,
        urgency: urgencyOf(phase, daysFromToday),
        critical: template.critical === true,
      };
      if (template.categoryId) item.categoryId = template.categoryId;
      return { item, order };
    })
    .sort((a, b) => (a.item.dueDate < b.item.dueDate ? -1 : a.item.dueDate > b.item.dueDate ? 1 : a.order - b.order))
    .map(({ item }) => item);

  const compressed = scale < 1;
  const compressionPercent = Math.round((1 - scale) * 100);
  const warnings: PlanWarning[] = [];
  if (compressed) {
    const bookFirst = items.filter((i) => i.critical && i.phase === "before").slice(0, 3).map((i) => i.title.toLowerCase());
    const rush = daysAvailable < RUSH_THRESHOLD_DAYS;
    warnings.push({
      code: rush ? "timeline-rush" : "timeline-compressed",
      severity: rush ? "critical" : "warning",
      message:
        `There are ${daysAvailable} days until the event, so the usual ${idealLeadDays}-day plan was compressed by ${compressionPercent}%. ` +
        (bookFirst.length > 0 ? `Do these first: ${bookFirst.join("; ")}.` : "Start with the first items below."),
    });
  }

  return { timeline: { items, daysAvailable, idealLeadDays, compressed, compressionPercent }, warnings };
}
