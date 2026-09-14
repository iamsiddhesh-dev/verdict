// Which free model does which job, and what each one's free tier allows.
//
// Every task names an ordered chain of models, best fit first. The rule for
// choosing the order is quality for that task, then how scarce the model is:
//
//   Structured reading and judgment (reading a JD, scoring a fit, classifying a
//   company) goes to gpt-oss-120b. It holds large nested schemas reliably, and
//   Groq and Cerebras each serve it with generous per-minute budgets.
//
//   Writing that a human will send under their own name (answers, outreach,
//   resume bullets) goes to Gemini first. Its prose is the most natural of the
//   free models, but its free tier is a few requests per DAY, so it is spent
//   only on writing and never burned on extraction.
//
// The limits below are conservative starting points. The capacity tracker
// replaces them with the real numbers from each provider's rate-limit headers
// after the first call, and LLM_LIMITS_JSON can override any of them without a
// code change when a provider moves its free tier again.

import type { ProviderName } from "./providers";

export type LlmTask =
  | "resumeExtraction"
  | "readJob"
  | "companyType"
  | "score"
  | "writing"
  | "tailor"
  | "vision";

export interface ModelStep {
  provider: ProviderName;
  model: string;
  /**
   * How long a caller should wait for THIS model before settling for a lower
   * step that is free right now. Only set where the quality gap is worth a short
   * wait: a better-written answer is worth 20 seconds in a background job.
   */
  preferWaitMs?: number;
  /**
   * Only use this step when nothing else in the chain can take the request within
   * a short wait. For models with a tiny daily budget (Gemini's free tier is a
   * few dozen requests a day) sitting in a chain as a fallback: without this, a
   * busy minute on Groq quietly spends the day's writing budget on extraction.
   */
  lastResort?: boolean;
}

/** How long every non-last-resort step must be unavailable before a last-resort step is used. */
export const LAST_RESORT_AFTER_MS = 45_000;

export interface Limits {
  rpm?: number;
  tpm?: number;
  rpd?: number;
  tpd?: number;
}

const GPT_OSS_120B_GROQ = "openai/gpt-oss-120b";
const GPT_OSS_20B_GROQ = "openai/gpt-oss-20b";
const GPT_OSS_120B_CEREBRAS = "gpt-oss-120b";
const GEMINI_FLASH = "gemini-flash-latest";
const GEMINI_FLASH_LITE = "gemini-flash-lite-latest";
const MISTRAL_MEDIUM = "mistral-medium-latest";
const LLAMA4_SCOUT_GROQ = "meta-llama/llama-4-scout-17b-16e-instruct";

// Cerebras sits below Groq in every chain. Its free key started answering 402
// "Payment required" in the middle of a normal day (seen 2026-09-14), so it is a
// fallback that may or may not be there, not a lane to lead with. The router
// parks a 402 lane until UTC midnight, so leaving it in the chain costs one
// failed request a day at most.
export const TASK_ROUTES: Record<LlmTask, ModelStep[]> = {
  resumeExtraction: [
    { provider: "groq", model: GPT_OSS_120B_GROQ, preferWaitMs: 15_000 },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
    { provider: "google", model: GEMINI_FLASH, lastResort: true },
  ],
  readJob: [
    { provider: "groq", model: GPT_OSS_120B_GROQ },
    { provider: "groq", model: GPT_OSS_20B_GROQ },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
  ],
  // A five-way label over a page of company copy. The small model is enough and
  // keeps the 120b budgets free for scoring.
  companyType: [
    { provider: "groq", model: GPT_OSS_20B_GROQ },
    { provider: "groq", model: GPT_OSS_120B_GROQ },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
  ],
  score: [
    { provider: "groq", model: GPT_OSS_120B_GROQ, preferWaitMs: 15_000 },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
    { provider: "google", model: GEMINI_FLASH, lastResort: true },
  ],
  writing: [
    { provider: "google", model: GEMINI_FLASH, preferWaitMs: 20_000 },
    { provider: "mistral", model: MISTRAL_MEDIUM, preferWaitMs: 10_000 },
    { provider: "google", model: GEMINI_FLASH_LITE },
    { provider: "groq", model: GPT_OSS_120B_GROQ },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
  ],
  // Rephrasing resume bullets is writing, but the answer is a large structured
  // selection over the whole resume, so the 120b models that hold big schemas
  // come straight after Gemini instead of after the smaller writing models.
  // Flash-Lite has its own daily budget and is far less often overloaded than
  // Flash, so a Flash 503 ("high demand") falls to another Gemini before leaving
  // Google. Both Groq models fit here because the tailoring prompt is sized to
  // stay under Groq's 8,000 tokens per minute.
  tailor: [
    { provider: "google", model: GEMINI_FLASH, preferWaitMs: 20_000 },
    { provider: "google", model: GEMINI_FLASH_LITE },
    { provider: "groq", model: GPT_OSS_120B_GROQ, preferWaitMs: 15_000 },
    { provider: "mistral", model: MISTRAL_MEDIUM },
    { provider: "groq", model: GPT_OSS_20B_GROQ },
    { provider: "cerebras", model: GPT_OSS_120B_CEREBRAS },
  ],
  vision: [
    { provider: "google", model: GEMINI_FLASH, preferWaitMs: 20_000 },
    { provider: "google", model: GEMINI_FLASH_LITE },
    { provider: "groq", model: LLAMA4_SCOUT_GROQ },
  ],
};

// Starting points only; see the header comment. startHunt measured Groq's
// budgets as per MODEL rather than per key, so each model gets its own lane.
const DEFAULT_LIMITS: Record<string, Limits> = {
  [`groq/${GPT_OSS_120B_GROQ}`]: { rpm: 30, tpm: 8_000, rpd: 1_000 },
  [`groq/${GPT_OSS_20B_GROQ}`]: { rpm: 30, tpm: 8_000, rpd: 1_000 },
  [`groq/${LLAMA4_SCOUT_GROQ}`]: { rpm: 30, tpm: 30_000, rpd: 1_000 },
  [`cerebras/${GPT_OSS_120B_CEREBRAS}`]: { rpm: 5, tpm: 30_000, rpd: 2_400 },
  [`google/${GEMINI_FLASH}`]: { rpm: 5, tpm: 250_000, rpd: 20 },
  [`google/${GEMINI_FLASH_LITE}`]: { rpm: 10, tpm: 250_000, rpd: 20 },
  [`mistral/${MISTRAL_MEDIUM}`]: { rpm: 50, tpm: 500_000 },
};

const FALLBACK_LIMITS: Limits = { rpm: 10, tpm: 30_000, rpd: 200 };

let overrides: Record<string, Limits> | null = null;

function envOverrides(): Record<string, Limits> {
  if (overrides) return overrides;
  overrides = {};
  const raw = process.env.LLM_LIMITS_JSON;
  if (raw) {
    try {
      overrides = JSON.parse(raw) as Record<string, Limits>;
    } catch {
      console.error("[llm] LLM_LIMITS_JSON is not valid JSON; ignoring it.");
    }
  }
  return overrides;
}

export function limitsFor(provider: ProviderName, model: string): Limits {
  const id = `${provider}/${model}`;
  return { ...(DEFAULT_LIMITS[id] ?? FALLBACK_LIMITS), ...(envOverrides()[id] ?? {}) };
}

/**
 * Tokens the model is expected to produce, used to reserve per-minute budget
 * before a call. gpt-oss reasons before it answers, and those reasoning tokens
 * count against the provider's budget like any other.
 */
export const EXPECTED_OUTPUT_TOKENS: Record<LlmTask, number> = {
  resumeExtraction: 2_500,
  readJob: 1_500,
  companyType: 400,
  score: 2_000,
  writing: 1_800,
  // ~14 bullets of JSON plus low-effort reasoning. Measured replies run 1,100 to 1,800.
  tailor: 2_400,
  vision: 1_500,
};
