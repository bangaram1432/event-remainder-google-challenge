/**
 * Deterministic guardrails that run outside the model (OWASP LLM01 Prompt Injection, LLM02 Sensitive Information
 * Disclosure, and the Hidden Context Exposure tripwire). Philosophy: never block the *plan*. When text looks
 * hostile or sensitive, the AI step is skipped or the text is redacted and the rule-based plan still ships.
 */
import type { PlanInput } from "@/domain/types";

const EMAIL = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const API_KEY = /\b(?:AIza[0-9A-Za-z_-]{35}|sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{36}|xox[baprs]-[A-Za-z0-9-]{10,})(?![A-Za-z0-9_-])/g;
const CARD_CANDIDATE = /\b\d(?:[ -]?\d){12,18}\b/g;
const PHONE_CANDIDATE = /(?<![\w.])\+?\d[\d\s().-]{7,}\d(?!\w)/g;

/** Luhn checksum, so ordinary long numbers (order ids, dates) are not mistaken for cards. */
function passesLuhn(digits: string): boolean {
  let sum = 0;
  let double = false;
  for (let i = digits.length - 1; i >= 0; i -= 1) {
    let digit = digits.charCodeAt(i) - 48;
    if (double) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    double = !double;
  }
  return sum % 10 === 0;
}

const digitsOf = (value: string) => value.replace(/\D/g, "");

export interface Redaction {
  text: string;
  count: number;
}

/** Replaces emails, API keys, payment-card numbers and phone numbers before text is sent to a third-party model. */
export function redactSensitive(text: string): Redaction {
  let count = 0;
  const label = (replacement: string) => () => {
    count += 1;
    return replacement;
  };
  const withoutKeys = text.replace(EMAIL, label("[email]")).replace(API_KEY, label("[key]"));
  const withoutCards = withoutKeys.replace(CARD_CANDIDATE, (match) => {
    const digits = digitsOf(match);
    if (digits.length < 13 || digits.length > 19 || !passesLuhn(digits)) return match;
    count += 1;
    return "[card]";
  });
  const redacted = withoutCards.replace(PHONE_CANDIDATE, (match) => {
    const length = digitsOf(match).length;
    if (length < 9 || length > 15) return match;
    count += 1;
    return "[phone]";
  });
  return { text: redacted, count };
}

const INJECTION_PATTERNS: readonly RegExp[] = [
  /\b(?:ignore|disregard|forget|override)\b[^.\n]{0,40}\b(?:previous|prior|above|earlier|all|any)\b[^.\n]{0,30}\b(?:instructions?|prompts?|rules?|guidelines?|directions?)\b/i,
  /\b(?:reveal|show|print|repeat|output|leak|display)\b[^.\n]{0,30}\b(?:system|initial|hidden|developer)\s+(?:prompt|instructions?)\b/i,
  /\byou\s+are\s+now\b/i,
  /\b(?:jailbreak|developer\s+mode|DAN\s+mode)\b/i,
  /<\s*\/?\s*(?:system|assistant|instructions?|prompt)\b[^>]*>/i,
  /\[\s*\/?\s*(?:system|inst)\s*\]/i,
];

/**
 * Heuristic detector for direct instruction-override attempts. It is a tripwire, not a security boundary: the real
 * defences are role separation, escaped JSON transport and schema-validated output. A hit only means "skip the AI step".
 */
export function looksLikeInjection(text: string): boolean {
  return INJECTION_PATTERNS.some((pattern) => pattern.test(text));
}

export interface GuardedInput {
  /** Copy of the input that is safe to describe to a model (free text redacted). */
  input: PlanInput;
  suspicious: boolean;
  redactions: number;
}

export function guardPlanInput(input: PlanInput): GuardedInput {
  const notes = redactSensitive(input.notes);
  const city = redactSensitive(input.city);
  return {
    input: { ...input, notes: notes.text, city: city.text },
    suspicious: looksLikeInjection(input.notes) || looksLikeInjection(input.city),
    redactions: notes.count + city.count,
  };
}

/** A per-request random marker planted in the system instruction. If it ever appears in output, the prompt leaked. */
export function createCanary(randomId: () => string = () => crypto.randomUUID()): string {
  return `CANARY_${randomId().replaceAll("-", "")}`;
}

export function leaksCanary(output: string, canary: string): boolean {
  return output.includes(canary);
}
