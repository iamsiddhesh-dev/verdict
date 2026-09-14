// Answers to identical questions are reused instead of spending free-tier budget
// twice. Keyed on (task, sha256 of the exact prompt): the prompt already encodes
// every input, so two identical prompts are the same question.
//
// Only deterministic reads use this (parsing a resume, reading a job, scoring
// one profile against one job). Writing is never cached: a user who asks for a
// different draft should get one.

import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { queryRows } from "@/lib/db";

const DAY = 24 * 60 * 60 * 1000;

export const CACHE_TTL_MS = {
  resumeExtraction: 90 * DAY,
  readJob: 7 * DAY,
  companyType: 30 * DAY,
  // Short enough that a profile edit plus a re-run is not answered from a stale
  // score; the prompt changes with the profile anyway, so this mostly covers the
  // same person pasting the same link twice.
  score: 3 * DAY,
} as const;

function hash(task: string, prompt: string): string {
  return createHash("sha256").update(`${task}\n${prompt}`).digest("hex");
}

export async function readCache(task: string, prompt: string, ttlMs: number): Promise<unknown | null> {
  const cutoff = new Date(Date.now() - ttlMs).toISOString();
  try {
    const rows = await queryRows<{ result: unknown }>(sql`
      SELECT result FROM llm_cache
      WHERE task = ${task} AND prompt_hash = ${hash(task, prompt)} AND created_at > ${cutoff}
      LIMIT 1
    `);
    return rows[0]?.result ?? null;
  } catch (err) {
    console.error("[llm-cache] read failed:", err);
    return null;
  }
}

export async function writeCache(task: string, prompt: string, result: unknown): Promise<void> {
  try {
    await queryRows(sql`
      INSERT INTO llm_cache (task, prompt_hash, result)
      VALUES (${task}, ${hash(task, prompt)}, ${JSON.stringify(result)}::jsonb)
      ON CONFLICT (task, prompt_hash) DO UPDATE SET result = EXCLUDED.result, created_at = now()
    `);
  } catch (err) {
    console.error("[llm-cache] write failed:", err);
  }
}
