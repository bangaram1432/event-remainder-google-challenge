export type LogFields = Readonly<Record<string, string | number | boolean | null>>;

export interface Logger {
  info(message: string, fields?: LogFields): void;
  warn(message: string, fields?: LogFields): void;
  error(message: string, fields?: LogFields): void;
}

/**
 * Structured JSON logs (Cloud Logging compatible `severity` field).
 * Callers must never pass user-supplied free text (notes, city) as a field.
 */
export const consoleLogger: Logger = {
  info: (message, fields) => console.info(JSON.stringify({ severity: "INFO", message, ...fields })),
  warn: (message, fields) => console.warn(JSON.stringify({ severity: "WARNING", message, ...fields })),
  error: (message, fields) => console.error(JSON.stringify({ severity: "ERROR", message, ...fields })),
};

export const silentLogger: Logger = { info: () => undefined, warn: () => undefined, error: () => undefined };
