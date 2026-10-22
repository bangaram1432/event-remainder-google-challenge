import { GoogleGenAI } from "@google/genai";
import type { GeminiTransport } from "./enhance";
import { GEMINI_RESPONSE_SCHEMA } from "./schema";

/**
 * Structural port onto the Interactions API (the recommended Gemini API surface). Describing only the calls
 * we make decouples the rest of the code from SDK type churn between major versions.
 */
interface InteractionsClient {
  interactions: {
    create(request: {
      model: string;
      input: string;
      system_instruction: string;
      response_format: { type: "text"; mime_type: "application/json"; schema: unknown };
      generation_config: { thinking_level: "low" | "medium" | "high"; max_output_tokens: number };
      store: boolean;
    }): Promise<{ output_text?: string | null }>;
  };
}

/** Hard ceiling on spend per call (OWASP LLM Unbounded Consumption). The schema keeps real output near 1k tokens. */
const MAX_OUTPUT_TOKENS = 4_096;

export function createGeminiTransport(apiKey: string, model: string): GeminiTransport {
  const client = new GoogleGenAI({ apiKey }) as unknown as InteractionsClient;
  return async ({ systemInstruction, input }) => {
    const interaction = await client.interactions.create({
      model,
      input,
      system_instruction: systemInstruction,
      response_format: { type: "text", mime_type: "application/json", schema: GEMINI_RESPONSE_SCHEMA },
      // Google discourages `temperature` on Gemini 3.x; effort and length are controlled explicitly instead.
      generation_config: { thinking_level: "low", max_output_tokens: MAX_OUTPUT_TOKENS },
      store: false, // privacy: do not retain user notes on Google's side
    });
    return interaction.output_text ?? "";
  };
}
