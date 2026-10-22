import { sanitizeModelText } from "@/security/sanitize";
import { SPEND_CATEGORY_IDS, isOneOf, type AiEnhancement, type Idea, type SpendCategoryId } from "@/domain/types";

/**
 * JSON Schema sent to Gemini for structured output. It sticks to the portable subset
 * (type, properties, required, items, minItems, maxItems, enum, description).
 * Length limits are enforced by `parseAiEnhancement`, which never trusts the model.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string", description: "One warm sentence (under 120 characters) capturing the personalised direction." },
    themeIdeas: {
      type: "array", minItems: 2, maxItems: 4,
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Short theme or idea name." },
          description: { type: "string", description: "One or two sentences explaining how it fits this event and budget." },
        },
        required: ["title", "description"],
      },
    },
    personalTouches: {
      type: "array", minItems: 3, maxItems: 6,
      items: { type: "string", description: "A specific, low-cost personal detail tailored to the notes and priorities." },
    },
    risks: {
      type: "array", minItems: 2, maxItems: 4,
      items: {
        type: "object",
        properties: {
          risk: { type: "string", description: "What could go wrong for this specific event." },
          mitigation: { type: "string", description: "A practical way to prevent or absorb it." },
        },
        required: ["risk", "mitigation"],
      },
    },
    vendorTips: {
      type: "array", minItems: 0, maxItems: 8,
      items: {
        type: "object",
        properties: {
          categoryId: { type: "string", enum: [...SPEND_CATEGORY_IDS], description: "Budget category the tip applies to." },
          tip: { type: "string", description: "One practical negotiation or selection tip." },
        },
        required: ["categoryId", "tip"],
      },
    },
  },
  required: ["headline", "themeIdeas", "personalTouches", "risks", "vendorTips"],
} as const;

const MAX = { headline: 120, title: 60, description: 260, touch: 160, risk: 140, mitigation: 200, tip: 200 } as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
const text = (value: unknown, max: number): string => (typeof value === "string" ? sanitizeModelText(value, max) : "");
const list = (value: unknown, max: number): unknown[] => (Array.isArray(value) ? value.slice(0, max) : []);

/**
 * Validates model output defensively: wrong types are dropped, lengths capped, links stripped,
 * unknown categories ignored. Returns null when the essentials are missing so the caller can fall back.
 */
export function parseAiEnhancement(raw: unknown): AiEnhancement | null {
  if (!isRecord(raw)) return null;

  const headline = text(raw.headline, MAX.headline);
  const themeIdeas = list(raw.themeIdeas, 4).flatMap((item): Idea[] => {
    if (!isRecord(item)) return [];
    const title = text(item.title, MAX.title);
    const description = text(item.description, MAX.description);
    return title && description ? [{ title, description, source: "ai" }] : [];
  });
  const personalTouches = list(raw.personalTouches, 6).map((v) => text(v, MAX.touch)).filter(Boolean);
  const risks = list(raw.risks, 4).flatMap((item) => {
    if (!isRecord(item)) return [];
    const risk = text(item.risk, MAX.risk);
    const mitigation = text(item.mitigation, MAX.mitigation);
    return risk && mitigation ? [{ risk, mitigation }] : [];
  });
  const vendorTips = list(raw.vendorTips, 8).flatMap((item) => {
    if (!isRecord(item) || !isOneOf(SPEND_CATEGORY_IDS, item.categoryId)) return [];
    const tip = text(item.tip, MAX.tip);
    return tip ? [{ categoryId: item.categoryId as SpendCategoryId, tip }] : [];
  });

  if (!headline || themeIdeas.length === 0 || personalTouches.length === 0) return null;
  return { headline, themeIdeas, personalTouches, risks, vendorTips };
}
