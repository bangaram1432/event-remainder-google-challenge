/**
 * Free-text hygiene for anything that is stored, logged or sent to a model.
 * Removes invisible and bidirectional-control characters (used to smuggle text past reviewers),
 * collapses whitespace and caps length by code points so emoji are never cut in half.
 */
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;
const CONTROL = /\p{Cc}/gu;
const URL_LIKE = /\b(?:https?:\/\/|www\.)\S+/gi;
const HTML_TAG = /<\/?[a-z][^>]*>/gi;

export function sanitizeFreeText(raw: string, maxCodePoints: number): string {
  const cleaned = raw.normalize("NFKC").replace(INVISIBLE, "").replace(CONTROL, " ").replace(/\s+/g, " ").trim();
  const points = Array.from(cleaned);
  return points.length <= maxCodePoints ? cleaned : points.slice(0, maxCodePoints).join("").trimEnd();
}

/**
 * For model output shown to users (OWASP LLM Improper Output Handling): same hygiene, plus links and HTML tags are
 * dropped. The UI only ever renders plain text, so this is defence in depth rather than the primary control.
 */
export function sanitizeModelText(raw: string, maxCodePoints: number): string {
  return sanitizeFreeText(raw.replace(URL_LIKE, "").replace(HTML_TAG, ""), maxCodePoints);
}

export function codePointLength(value: string): number {
  return Array.from(value).length;
}
