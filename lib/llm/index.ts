// The single choke point for every model call.
//
// Callers name a TASK, never a model. The router walks that task's chain (see
// routes.ts) and, for each model, every key configured for its provider. Each
// (model, key) pair is a capacity lane (see capacity.ts), and the router only
// sends a request to a lane that has budget for it right now. When nothing does,
// it waits for the soonest lane to free up, as long as the caller's deadline
// allows, instead of firing into a guaranteed 429.

import { createHash } from "node:crypto";
import { APICallError, generateObject, NoObjectGeneratedError, type ModelMessage } from "ai";
import type { z } from "zod";
import { readCache, writeCache } from "./cache";
import { Lane, laneRegistry, NEVER, parseDurationMs } from "./capacity";
import { keyId, keysFor, modelFor, type CallerKeys, type ProviderName } from "./providers";
import { EXPECTED_OUTPUT_TOKENS, LAST_RESORT_AFTER_MS, limitsFor, TASK_ROUTES, type LlmTask, type ModelStep } from "./routes";

export type { LlmTask } from "./routes";
export type { CallerKeys, ProviderName } from "./providers";

export class CapacityError extends Error {
  constructor(
    message: string,
    readonly retryInMs: number | null,
  ) {
    super(message);
    this.name = "CapacityError";
  }
}

export interface WaitNotice {
  ms: number;
  task: LlmTask;
}

export interface StructuredParams<S extends z.ZodTypeAny> {
  task: LlmTask;
  schema: S;
  prompt?: string;
  system?: string;
  /** For image input. When given, `prompt` is ignored. */
  messages?: ModelMessage[];
  /** Cache the answer for this long, keyed on the exact prompt. Omit for prompts that change every call. */
  cacheTtlMs?: number;
  caller?: CallerKeys;
  /** Give up waiting for capacity after this many ms. Defaults to 3 minutes. */
  maxWaitMs?: number;
  onWait?: (notice: WaitNotice) => void;
  /** gpt-oss only: how hard to think before answering. Lower spends fewer tokens. */
  reasoning?: "low" | "medium" | "high";
  /** 0 for reads and judgments that should come out the same every time. */
  temperature?: number;
}

export interface StructuredResult<T> {
  object: T;
  provider: ProviderName | "cache";
  model: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// The longest single sleep between capacity checks. Waking up periodically lets a
// lane freed by a provider header, or a cooldown ending early, be picked up.
const MAX_SLEEP_SLICE_MS = 5_000;
const MAX_ATTEMPTS = 10;

function estimateTokens(params: { prompt?: string; system?: string; messages?: ModelMessage[] }, task: LlmTask): number {
  let chars = (params.prompt?.length ?? 0) + (params.system?.length ?? 0);
  let images = 0;
  for (const m of params.messages ?? []) {
    if (typeof m.content === "string") chars += m.content.length;
    else
      for (const part of m.content as Array<{ type: string; text?: string }>) {
        if (part.type === "text") chars += part.text?.length ?? 0;
        else images += 1;
      }
  }
  // ~3.2 characters per token is deliberately pessimistic for English; under-
  // estimating is what produces a 429 on the last request of a minute.
  return Math.ceil(chars / 3.2) + images * 1_300 + EXPECTED_OUTPUT_TOKENS[task];
}

interface Candidate {
  step: ModelStep;
  stepIndex: number;
  lane: Lane;
  apiKey: string;
}

function candidatesFor(task: LlmTask, caller?: CallerKeys): Candidate[] {
  const registry = laneRegistry();
  const out: Candidate[] = [];
  TASK_ROUTES[task].forEach((step, stepIndex) => {
    for (const apiKey of keysFor(step.provider, caller)) {
      const kid = keyId(step.provider, apiKey);
      const id = `${step.provider}/${step.model}/${kid}`;
      let lane = registry.get(id);
      if (!lane) {
        // A caller's own key is not written to the shared usage table: their
        // budget is theirs, and the table exists to protect the shared pool.
        const isShared = !caller?.[step.provider];
        lane = new Lane(step.provider, step.model, kid, limitsFor(step.provider, step.model), isShared);
        registry.set(id, lane);
      }
      out.push({ step, stepIndex, lane, apiKey });
    }
  });
  return out;
}

/**
 * Choose what to send next, or how long to wait.
 *
 * The first candidate in quality order that is free now is the default. But if a
 * better step that asked for patience (preferWaitMs) will be free soon enough,
 * waiting for it wins: in a background job, twenty seconds for noticeably better
 * writing is a good trade.
 */
function choose(cands: Candidate[], tokens: number, excludedSteps: Set<number>) {
  const now = Date.now();
  const all = cands
    .filter((c) => !excludedSteps.has(c.stepIndex))
    .map((c) => ({ c, wait: c.lane.waitMs(tokens, now) }))
    .filter((x) => x.wait !== NEVER);

  if (all.length === 0) return { kind: "none" as const };

  // Last-resort steps stay out of the running while any regular step can take
  // the request within LAST_RESORT_AFTER_MS.
  const regularSoon = all.some((x) => !x.c.step.lastResort && x.wait <= LAST_RESORT_AFTER_MS);
  const scored = regularSoon ? all.filter((x) => !x.c.step.lastResort) : all;

  const readyNow = scored.find((x) => x.wait === 0);
  if (readyNow) {
    const patience = scored
      .filter((x) => x.c.stepIndex < readyNow.c.stepIndex && x.c.step.preferWaitMs && x.wait <= x.c.step.preferWaitMs)
      .sort((a, b) => a.wait - b.wait)[0];
    if (patience) return { kind: "wait" as const, ms: patience.wait };
    return { kind: "send" as const, cand: readyNow.c };
  }
  const soonest = scored.reduce((a, b) => (b.wait < a.wait ? b : a));
  return { kind: "wait" as const, ms: soonest.wait };
}

function headersOf(err: unknown): Record<string, string> | undefined {
  if (APICallError.isInstance(err)) return err.responseHeaders;
  return undefined;
}

function statusOf(err: unknown): number | undefined {
  if (APICallError.isInstance(err)) return err.statusCode;
  return (err as { statusCode?: number })?.statusCode;
}

function messageOf(err: unknown): string {
  if (APICallError.isInstance(err)) return `${err.message} ${err.responseBody ?? ""}`;
  return err instanceof Error ? err.message : String(err);
}

export function looksLikeRateLimit(err: unknown): boolean {
  const status = statusOf(err);
  if (status === 429 || status === 402) return true;
  return /\b429\b|quota|rate.?limit|RESOURCE_EXHAUSTED|too many requests|payment required/i.test(messageOf(err));
}

export function looksLikeServerTrouble(err: unknown): boolean {
  const status = statusOf(err);
  if (typeof status === "number" && status >= 500) return true;
  return /high demand|overload|at capacity|temporarily unavailable|service unavailable|bad gateway|gateway timeout|try again later|fetch failed|ECONNRESET|ETIMEDOUT/i.test(
    messageOf(err),
  );
}

/**
 * A daily cap, or a 402. Providers return 402 when a free key's quota tier is
 * used up (Cerebras: "Payment required to access this resource"). Nobody is
 * billed; the key simply has nothing left, and retrying it every 20 seconds
 * only delays the fallback.
 */
function looksDailyExhausted(err: unknown): boolean {
  // A limit header of 0 means the account has no access to this model at all
  // (Mistral answers "limit-req-minute=0" until its free plan is activated).
  // Retrying every 20 seconds cannot succeed.
  const zeroLimit = Object.entries(headersOf(err) ?? {}).some(([h, v]) => /^x-ratelimit-limit/i.test(h) && String(v).trim() === "0");
  return zeroLimit || statusOf(err) === 402 || /per.?day|daily|requests per day|RPD|PerDay|payment required/i.test(messageOf(err));
}

function isKeyRejected(err: unknown): boolean {
  const status = statusOf(err);
  return status === 401 || status === 403 || /invalid api key|unauthorized|permission denied/i.test(messageOf(err));
}

/** The model could not hold the schema, or cannot take this request at all. Another model may. */
function isModelMismatch(err: unknown): boolean {
  if (NoObjectGeneratedError.isInstance(err)) return true;
  const status = statusOf(err);
  if (status === 413 || status === 404) return true;
  return /failed to validate json|failed_generation|does not support|request too large|context.?length|maximum context|model.*not.*found|decommissioned/i.test(
    messageOf(err),
  );
}

/** "Please retry in 24.02s", Gemini's retryDelay "24s", or a retry-after header. */
function retryAfterMs(err: unknown): number | undefined {
  const h = headersOf(err);
  const header = h?.["retry-after"] ?? h?.["Retry-After"];
  if (header) {
    const ms = parseDurationMs(header);
    if (ms !== undefined) return ms;
  }
  const msg = messageOf(err);
  const m = msg.match(/(?:retry|try again) in\s*([\dhms.]+)/i) ?? msg.match(/"retryDelay"\s*:\s*"([\d.]+s)"/i);
  return m ? parseDurationMs(m[1]) : undefined;
}

export async function generateStructured<S extends z.ZodTypeAny>(
  params: StructuredParams<S>,
): Promise<StructuredResult<z.infer<S>>> {
  const cacheKeyText = params.cacheTtlMs
    ? `${params.system ?? ""}\n---\n${params.prompt ?? JSON.stringify(params.messages)}`
    : null;
  if (cacheKeyText && params.cacheTtlMs) {
    const cached = await readCache(params.task, cacheKeyText, params.cacheTtlMs);
    if (cached) {
      const parsed = params.schema.safeParse(cached);
      if (parsed.success) return { object: parsed.data, provider: "cache", model: "cache" };
    }
  }

  const cands = candidatesFor(params.task, params.caller);
  if (cands.length === 0) {
    throw new CapacityError(
      `No API key is configured for any model the "${params.task}" task can use. Add a free GEMINI_API_KEY, GROQ_API_KEY or CEREBRAS_API_KEY.`,
      null,
    );
  }
  await Promise.all(cands.map((c) => c.lane.ready()));

  const tokens = estimateTokens(params, params.task);
  const deadline = Date.now() + (params.maxWaitMs ?? 180_000);
  const excludedSteps = new Set<number>();
  let lastErr: unknown;
  let attempts = 0;
  let announcedWait = false;

  while (attempts < MAX_ATTEMPTS) {
    const choice = choose(cands, tokens, excludedSteps);

    if (choice.kind === "none") {
      const reason = lastErr ? ` Last error: ${messageOf(lastErr).slice(0, 200)}` : "";
      throw new CapacityError(
        `Every free model for "${params.task}" has used today's budget or cannot take this request.${reason}`,
        null,
      );
    }

    if (choice.kind === "wait") {
      const remaining = deadline - Date.now();
      if (choice.ms > remaining) {
        throw new CapacityError(
          `Free model capacity for "${params.task}" frees up in about ${Math.ceil(choice.ms / 1000)}s, which is past this job's wait limit.`,
          choice.ms,
        );
      }
      if (!announcedWait || choice.ms > MAX_SLEEP_SLICE_MS) {
        params.onWait?.({ ms: choice.ms, task: params.task });
        announcedWait = true;
      }
      await sleep(Math.min(choice.ms, MAX_SLEEP_SLICE_MS) + 50);
      continue;
    }

    const { cand } = choice;
    attempts += 1;
    const reservation = cand.lane.reserve(tokens);
    const reasoningOptions = params.reasoning
      ? {
          groq: { reasoningEffort: params.reasoning },
          openaiCompatible: { reasoningEffort: params.reasoning },
          [cand.step.provider]: { reasoningEffort: params.reasoning },
        }
      : undefined;

    try {
      const base = {
        model: modelFor(cand.step.provider, cand.apiKey, cand.step.model),
        schema: params.schema,
        system: params.system,
        temperature: params.temperature,
        // The SDK's own retries sleep blindly on a 429. This router decides
        // where the next attempt goes, so the SDK must not retry behind it.
        maxRetries: 0,
        providerOptions: cand.step.provider === "google" ? undefined : reasoningOptions,
      };
      const result = params.messages
        ? await generateObject({ ...base, messages: params.messages })
        : await generateObject({ ...base, prompt: params.prompt ?? "" });

      cand.lane.observeHeaders(result.response?.headers as Record<string, string> | undefined);
      const used = (result.usage?.inputTokens ?? 0) + (result.usage?.outputTokens ?? 0);
      cand.lane.settle(reservation, used || undefined);

      if (cacheKeyText) await writeCache(params.task, cacheKeyText, result.object);
      return { object: result.object as z.infer<S>, provider: cand.step.provider, model: cand.step.model };
    } catch (err) {
      lastErr = err;
      cand.lane.observeHeaders(headersOf(err));
      cand.lane.settle(reservation, undefined);

      if (isKeyRejected(err) && !looksLikeRateLimit(err)) {
        cand.lane.dead = true;
        console.error(`[llm] ${cand.lane.id} rejected its key; removing it from rotation.`);
        continue;
      }
      if (looksLikeRateLimit(err)) {
        if (looksDailyExhausted(err)) cand.lane.exhaustForToday();
        else cand.lane.cooldown(retryAfterMs(err) ?? 20_000);
        console.warn(`[llm] ${cand.lane.id} rate limited: ${messageOf(err).slice(0, 160)}`);
        continue;
      }
      if (looksLikeServerTrouble(err)) {
        cand.lane.cooldown(15_000);
        console.warn(`[llm] ${cand.lane.id} is overloaded, cooling down 15s: ${messageOf(err).slice(0, 120)}`);
        continue;
      }
      if (isModelMismatch(err)) {
        excludedSteps.add(cand.stepIndex);
        console.warn(`[llm] ${cand.lane.id} could not handle "${params.task}": ${messageOf(err).slice(0, 160)}`);
        continue;
      }
      throw err;
    }
  }
  // Every attempt was a busy or rate-limited provider: that is a capacity
  // problem with an honest message and a retry, not a crash with Google's text.
  if (lastErr && (looksLikeRateLimit(lastErr) || looksLikeServerTrouble(lastErr))) {
    const soonest = Math.min(...cands.map((c) => c.lane.waitMs(tokens)).filter((w) => w !== NEVER), 60_000);
    throw new CapacityError(`The free models for "${params.task}" are busy right now.`, Number.isFinite(soonest) ? Math.max(soonest, 15_000) : 60_000);
  }
  throw lastErr ?? new Error(`"${params.task}" failed after ${MAX_ATTEMPTS} attempts`);
}

/** For a status panel and for debugging: every lane's budget as the tracker sees it. */
export function capacitySnapshot() {
  return [...laneRegistry().values()].map((l) => l.snapshot());
}

export function promptHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
