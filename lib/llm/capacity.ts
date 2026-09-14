// Capacity tracking for free-tier model budgets.
//
// startHunt's router reacted to rate limits: send, get a 429, fail over. On free
// tiers that means the limit is hit constantly, every hit costs a round trip,
// and the user sees the slowdown. This tracker makes the router proactive
// instead. Each (provider, model, key) is a "lane" that knows its own budget:
//
//   - requests and tokens in the last 60 seconds, counted in memory
//   - requests and tokens today, persisted, so a restart does not reset them
//   - what the provider itself last said was remaining, from its headers
//   - a cooldown set by any 429 that still gets through
//
// Before a call, the router asks each lane how long until it could take a
// request of this size. Zero means go. Anything else means pick another lane
// or wait, and jobs run in a background queue, so a wait is invisible to the
// user except as an honest line in the run log.

import { sql } from "drizzle-orm";
import { queryRows } from "@/lib/db";
import type { ProviderName } from "./providers";
import type { Limits } from "./routes";

// Budgets are used up to this fraction. Providers count tokens slightly
// differently from any local estimate, and the last few percent is where a 429
// comes back.
const SAFETY = 0.9;
const WINDOW_MS = 60_000;

export const NEVER = Number.POSITIVE_INFINITY;

interface WindowEntry {
  at: number;
  tokens: number;
}

function utcDay(now = Date.now()): string {
  return new Date(now).toISOString().slice(0, 10);
}

function msUntilUtcMidnight(now = Date.now()): number {
  const d = new Date(now);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1) - now;
}

export class Lane {
  readonly id: string;
  limits: Limits;
  private window: WindowEntry[] = [];
  private day = "";
  private dayRequests = 0;
  private dayTokens = 0;
  private dayLoaded: Promise<void> | null = null;
  private cooldownUntil = 0;
  private headerTokens: { remaining: number; resetAt: number } | null = null;
  private headerRequests: { remaining: number; resetAt: number } | null = null;
  dead = false;

  constructor(
    readonly provider: ProviderName,
    readonly model: string,
    readonly keyId: string,
    limits: Limits,
    private readonly persist: boolean,
  ) {
    this.id = `${provider}/${model}/${keyId}`;
    this.limits = { ...limits };
  }

  /** Load today's persisted counters once per UTC day. */
  async ready(now = Date.now()): Promise<void> {
    const today = utcDay(now);
    if (this.day !== today) {
      this.day = today;
      this.dayRequests = 0;
      this.dayTokens = 0;
      this.dayLoaded = null;
    }
    if (!this.persist) return;
    if (!this.dayLoaded) {
      this.dayLoaded = (async () => {
        try {
          const rows = await queryRows<{ requests: number; tokens: number }>(sql`
            SELECT requests, tokens FROM llm_usage
            WHERE day = ${today} AND provider = ${this.provider} AND model = ${this.model} AND key_id = ${this.keyId}
          `);
          if (rows[0]) {
            this.dayRequests = Math.max(this.dayRequests, Number(rows[0].requests));
            this.dayTokens = Math.max(this.dayTokens, Number(rows[0].tokens));
          }
        } catch (err) {
          console.error(`[llm] could not load usage for ${this.id}:`, err);
        }
      })();
    }
    await this.dayLoaded;
  }

  private prune(now: number) {
    while (this.window.length && now - this.window[0].at >= WINDOW_MS) this.window.shift();
  }

  /** Milliseconds until this lane could accept a request of `tokens`. NEVER if it cannot today. */
  waitMs(tokens: number, now = Date.now()): number {
    if (this.dead) return NEVER;
    if (utcDay(now) !== this.day) return 0; // a new day; ready() resets the counters

    const { rpm, tpm, rpd, tpd } = this.limits;
    if (tpm && tokens > tpm * SAFETY) return NEVER; // this request is too big for this model at all
    if (rpd && this.dayRequests >= Math.floor(rpd * SAFETY)) return NEVER;
    if (tpd && this.dayTokens + tokens > tpd * SAFETY) return NEVER;

    let wait = Math.max(0, this.cooldownUntil - now);

    if (this.headerRequests && this.headerRequests.resetAt > now && this.headerRequests.remaining < 1) {
      wait = Math.max(wait, this.headerRequests.resetAt - now);
    }
    if (this.headerTokens && this.headerTokens.resetAt > now && this.headerTokens.remaining < tokens) {
      wait = Math.max(wait, this.headerTokens.resetAt - now);
    }

    this.prune(now);
    if (rpm) {
      const cap = Math.max(1, Math.floor(rpm * SAFETY));
      if (this.window.length >= cap) {
        const freeing = this.window[this.window.length - cap];
        wait = Math.max(wait, freeing.at + WINDOW_MS - now);
      }
    }
    if (tpm) {
      const cap = tpm * SAFETY;
      let used = this.window.reduce((s, e) => s + e.tokens, 0);
      if (used + tokens > cap) {
        for (const e of this.window) {
          used -= e.tokens;
          if (used + tokens <= cap) {
            wait = Math.max(wait, e.at + WINDOW_MS - now);
            break;
          }
        }
      }
    }
    return wait;
  }

  /** Book a request before sending it, so concurrent callers cannot overbook the same budget. */
  reserve(tokens: number, now = Date.now()): WindowEntry {
    const entry = { at: now, tokens };
    this.window.push(entry);
    this.dayRequests += 1;
    this.dayTokens += tokens;
    if (this.headerRequests) this.headerRequests.remaining -= 1;
    if (this.headerTokens) this.headerTokens.remaining -= tokens;
    return entry;
  }

  /** Replace the estimate with what the provider reports it actually used. */
  settle(entry: WindowEntry, actualTokens: number | undefined) {
    if (actualTokens !== undefined && Number.isFinite(actualTokens) && actualTokens > 0) {
      this.dayTokens += actualTokens - entry.tokens;
      entry.tokens = actualTokens;
    }
    if (this.persist) void this.flush(entry.tokens);
  }

  private async flush(tokens: number) {
    try {
      await queryRows(sql`
        INSERT INTO llm_usage (day, provider, model, key_id, requests, tokens)
        VALUES (${this.day}, ${this.provider}, ${this.model}, ${this.keyId}, 1, ${tokens})
        ON CONFLICT (day, provider, model, key_id) DO UPDATE
          SET requests = llm_usage.requests + 1, tokens = llm_usage.tokens + ${tokens}
      `);
    } catch (err) {
      console.error(`[llm] could not persist usage for ${this.id}:`, err);
    }
  }

  cooldown(ms: number, now = Date.now()) {
    this.cooldownUntil = Math.max(this.cooldownUntil, now + ms);
  }

  /** The provider says today's budget is gone. Stop offering this lane until UTC midnight. */
  exhaustForToday(now = Date.now()) {
    this.cooldown(msUntilUtcMidnight(now), now);
  }

  /** Learn the real budget and what remains of it from rate-limit headers. */
  observeHeaders(headers: Record<string, string> | undefined, now = Date.now()) {
    if (!headers) return;
    const h = lowerKeys(headers);
    const snapshot = parseRateLimitHeaders(h);

    if (snapshot.limitRequestsDay) this.limits.rpd = snapshot.limitRequestsDay;
    if (snapshot.limitTokensMinute) this.limits.tpm = snapshot.limitTokensMinute;
    if (snapshot.limitRequestsMinute) this.limits.rpm = snapshot.limitRequestsMinute;

    if (snapshot.remainingTokens !== undefined) {
      this.headerTokens = {
        remaining: snapshot.remainingTokens,
        resetAt: now + (snapshot.resetTokensMs ?? WINDOW_MS),
      };
    }
    if (snapshot.remainingRequestsDay !== undefined && this.limits.rpd) {
      // The provider's own count beats ours: it includes calls from other
      // processes, other deploys and scripts sharing the same key.
      this.dayRequests = Math.max(this.dayRequests, this.limits.rpd - snapshot.remainingRequestsDay);
    }
    if (snapshot.remainingRequestsMinute !== undefined) {
      this.headerRequests = {
        remaining: snapshot.remainingRequestsMinute,
        resetAt: now + (snapshot.resetRequestsMinuteMs ?? WINDOW_MS),
      };
    }
  }

  snapshot() {
    this.prune(Date.now());
    return {
      id: this.id,
      limits: this.limits,
      lastMinute: {
        requests: this.window.length,
        tokens: this.window.reduce((s, e) => s + e.tokens, 0),
      },
      today: { requests: this.dayRequests, tokens: this.dayTokens },
      cooldownMs: Math.max(0, this.cooldownUntil - Date.now()),
      dead: this.dead,
    };
  }
}

function lowerKeys(h: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(h)) out[k.toLowerCase()] = String(v);
  return out;
}

interface RateLimitSnapshot {
  limitRequestsDay?: number;
  limitRequestsMinute?: number;
  limitTokensMinute?: number;
  remainingRequestsDay?: number;
  remainingRequestsMinute?: number;
  remainingTokens?: number;
  resetTokensMs?: number;
  resetRequestsMinuteMs?: number;
}

/**
 * Groq names its headers by resource only (x-ratelimit-remaining-tokens is per
 * minute, -requests is per day). Cerebras suffixes them with the window
 * (x-ratelimit-remaining-tokens-minute, -requests-day). Both are handled.
 */
export function parseRateLimitHeaders(h: Record<string, string>): RateLimitSnapshot {
  const num = (k: string) => {
    const v = h[k];
    if (v === undefined) return undefined;
    const n = Number(v);
    return Number.isFinite(n) ? n : undefined;
  };
  const dur = (k: string) => (h[k] === undefined ? undefined : parseDurationMs(h[k]));

  const groqStyle = h["x-ratelimit-remaining-tokens"] !== undefined || h["x-ratelimit-limit-requests"] !== undefined;
  if (groqStyle) {
    return {
      limitRequestsDay: num("x-ratelimit-limit-requests"),
      limitTokensMinute: num("x-ratelimit-limit-tokens"),
      remainingRequestsDay: num("x-ratelimit-remaining-requests"),
      remainingTokens: num("x-ratelimit-remaining-tokens"),
      resetTokensMs: dur("x-ratelimit-reset-tokens"),
    };
  }
  return {
    limitRequestsDay: num("x-ratelimit-limit-requests-day"),
    limitRequestsMinute: num("x-ratelimit-limit-requests-minute"),
    limitTokensMinute: num("x-ratelimit-limit-tokens-minute"),
    remainingRequestsDay: num("x-ratelimit-remaining-requests-day"),
    remainingRequestsMinute: num("x-ratelimit-remaining-requests-minute"),
    remainingTokens: num("x-ratelimit-remaining-tokens-minute"),
    resetTokensMs: dur("x-ratelimit-reset-tokens-minute"),
    resetRequestsMinuteMs: dur("x-ratelimit-reset-requests-minute"),
  };
}

/** "7.66s", "2m59.56s", "1h2m", "450ms", or a bare number of seconds. */
export function parseDurationMs(raw: string): number | undefined {
  const s = raw.trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  const re = /(\d+(?:\.\d+)?)(ms|h|m|s)/g;
  let total = 0;
  let matched = false;
  for (const m of s.matchAll(re)) {
    matched = true;
    const n = Number(m[1]);
    total += m[2] === "h" ? n * 3_600_000 : m[2] === "m" ? n * 60_000 : m[2] === "s" ? n * 1000 : n;
  }
  return matched ? Math.round(total) : undefined;
}

const g = globalThis as typeof globalThis & { __jobAgentLanes?: Map<string, Lane> };

export function laneRegistry(): Map<string, Lane> {
  if (!g.__jobAgentLanes) g.__jobAgentLanes = new Map();
  return g.__jobAgentLanes;
}
