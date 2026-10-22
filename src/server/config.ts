export const DEFAULT_MODEL = "gemini-3.8-flash";
const MODEL_PATTERN = /^[a-z0-9][a-z0-9.-]{1,63}$/;

export interface SharedStoreConfig {
  url: string;
  token: string;
}

export interface AppConfig {
  geminiApiKey: string | null;
  /** Optional Upstash Redis REST credentials for a rate limit that holds across serverless instances. */
  sharedStore: SharedStoreConfig | null;
  geminiModel: string;
  aiTimeoutMs: number;
  rateLimitPerMinute: number;
}

function intInRange(raw: string | undefined, fallback: number, min: number, max: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function readSharedStore(env: Readonly<Record<string, string | undefined>>): SharedStoreConfig | null {
  const url = env.UPSTASH_REDIS_REST_URL?.trim().replace(/\/+$/, "");
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  if (!url || !token) return null;
  try {
    return new URL(url).protocol === "https:" ? { url, token } : null;
  } catch {
    return null;
  }
}

/** Reads and validates environment variables once, at the edge of the system. Bad values fall back safely. */
export function loadConfig(env: Readonly<Record<string, string | undefined>>): AppConfig {
  const key = env.GEMINI_API_KEY?.trim();
  const model = env.GEMINI_MODEL?.trim();
  return {
    geminiApiKey: key ? key : null,
    sharedStore: readSharedStore(env),
    geminiModel: model && MODEL_PATTERN.test(model) ? model : DEFAULT_MODEL,
    aiTimeoutMs: intInRange(env.AI_TIMEOUT_MS, 12_000, 1_000, 25_000),
    rateLimitPerMinute: intInRange(env.RATE_LIMIT_PER_MINUTE, 10, 1, 600),
  };
}
