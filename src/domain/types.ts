/** Shared domain vocabulary. Pure types and constants: safe for server and client bundles. */

export const EVENT_TYPES = ["wedding", "birthday", "community"] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export const CURRENCIES = ["INR", "USD", "EUR", "GBP", "AUD", "CAD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const VENUE_COSTS = ["paid", "free-or-owned"] as const;
export type VenueCost = (typeof VENUE_COSTS)[number];

export const SETTINGS = ["indoor", "outdoor", "either"] as const;
export type Setting = (typeof SETTINGS)[number];

export const PRIORITIES = ["food", "venue", "decor", "entertainment", "photography", "guest-comfort"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const SPEND_CATEGORY_IDS = [
  "venue",
  "catering",
  "decor",
  "entertainment",
  "photo-video",
  "attire-styling",
  "stationery",
  "logistics",
  "gifts-favours",
] as const;
export type SpendCategoryId = (typeof SPEND_CATEGORY_IDS)[number];
export type CategoryId = SpendCategoryId | "contingency";

/** Hard limits shared by validation, the form and the tests. */
export const LIMITS = {
  guestMax: 2000,
  budgetMin: 100,
  budgetMax: 1_000_000_000,
  cityMax: 80,
  notesMax: 600,
  maxPriorities: 3,
  horizonDays: 1825,
} as const;

export function isOneOf<T extends readonly string[]>(list: T, value: unknown): value is T[number] {
  return typeof value === "string" && (list as readonly string[]).includes(value);
}

/** Everything the planner needs to know about the celebration. */
export interface PlanInput {
  eventType: EventType;
  /** Calendar date, YYYY-MM-DD. */
  eventDate: string;
  guestCount: number;
  /** Total budget in whole currency units. */
  budget: number;
  currency: Currency;
  city: string;
  venueCost: VenueCost;
  setting: Setting;
  priorities: Priority[];
  notes: string;
}

/** Per-field validation messages returned by the API and shown next to each input. */
export type FieldErrors = Partial<Record<keyof PlanInput, string>>;

export type Severity = "critical" | "warning" | "info";
export interface PlanWarning {
  code: string;
  severity: Severity;
  message: string;
}

export type BudgetTier = "stretched" | "balanced" | "generous";

export interface BudgetLine {
  categoryId: CategoryId;
  label: string;
  amount: number;
  sharePercent: number;
  perGuest: number;
  /** Plain-language reason for this line's size, so the split is explainable rather than a black box. */
  rationale: string;
}

export interface BudgetPlan {
  total: number;
  currency: Currency;
  lines: BudgetLine[];
  tier: BudgetTier;
  cateringPerGuest: number;
  cateringFloorPerGuest: number;
}

export type TimelinePhase = "before" | "event-day" | "after";
export type Urgency = "now" | "soon" | "scheduled";

export interface TimelineItem {
  id: string;
  title: string;
  detail: string;
  dueDate: string;
  daysFromToday: number;
  phase: TimelinePhase;
  urgency: Urgency;
  critical: boolean;
  categoryId?: SpendCategoryId;
}

export interface Timeline {
  items: TimelineItem[];
  daysAvailable: number;
  idealLeadDays: number;
  compressed: boolean;
  /** How much the ideal lead time was shortened, 0-100. */
  compressionPercent: number;
}

export interface VendorChecklist {
  categoryId: SpendCategoryId;
  label: string;
  vendorType: string;
  allocated: number;
  quotesToCollect: number;
  /** Date by which this vendor should be booked, taken from the timeline. */
  bookBy: string | null;
  questions: string[];
  contractChecks: string[];
}

export interface Idea {
  title: string;
  description: string;
  source: "curated" | "ai";
}

export interface Plan {
  input: PlanInput;
  generatedOn: string;
  summary: string;
  budget: BudgetPlan;
  timeline: Timeline;
  vendors: VendorChecklist[];
  ideas: Idea[];
  warnings: PlanWarning[];
  assumptions: string[];
}

export interface AiEnhancement {
  headline: string;
  themeIdeas: Idea[];
  personalTouches: string[];
  risks: Array<{ risk: string; mitigation: string }>;
  vendorTips: Array<{ categoryId: SpendCategoryId; tip: string }>;
}

export type FallbackReason = "timeout" | "invalid-output" | "upstream-error" | "input-flagged" | "blocked-output";
export type AiStatus =
  | { status: "enhanced"; enhancement: AiEnhancement }
  | { status: "fallback"; reason: FallbackReason }
  | { status: "disabled" };

/** What the UI knows about the AI step: it runs after the plan is already on screen. */
export type AiProgress = AiStatus | { status: "pending" };

/** POST /api/plan: the deterministic plan, returned immediately. */
export interface PlanResponse {
  plan: Plan;
}

/** POST /api/enhance: the optional AI personalisation, fetched after the plan is already on screen. */
export interface EnhanceResponse {
  ai: AiStatus;
}
