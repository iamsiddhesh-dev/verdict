// Run rows: the queue, the progress log and the result, in one place.

import { and, desc, eq, sql } from "drizzle-orm";
import { runs } from "@/db/schema";
import { getDb, queryRows } from "@/lib/db";
import { nudgeWorker, publish } from "@/lib/events";
import type { FetchOutcome } from "@/lib/fetch";
import type { Verification } from "@/lib/verify";
import type { ReadJob } from "./read";
import type { ScoreResult, Verdict } from "./score";

export type Stage = "fetch" | "read" | "verify" | "score" | "verdict";
export const STAGES: Stage[] = ["fetch", "read", "verify", "score", "verdict"];

export interface RunEventEntry {
  at: string;
  stage: Stage;
  status: "running" | "done" | "failed" | "waiting" | "needs_input";
  detail: string;
}

export interface RunView {
  id: string;
  userId: string;
  inputUrl: string | null;
  hasInputText: boolean;
  status: "queued" | "running" | "needs_input" | "done" | "failed";
  stage: Stage | null;
  events: RunEventEntry[];
  fetched: FetchOutcome | null;
  job: ReadJob | null;
  verification: Verification | null;
  score: ScoreResult | null;
  verdict: Verdict | null;
  unlockedAt: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type RunRow = typeof runs.$inferSelect;

export function toView(r: RunRow): RunView {
  const fetchOutcome = r.fetched as FetchOutcome | null;
  // The full posting text is large and only the pipeline needs it. The client
  // gets everything else about the fetch.
  const slimFetch = fetchOutcome?.ok ? { ...fetchOutcome, job: { ...fetchOutcome.job, text: fetchOutcome.job.text.slice(0, 20_000) } } : fetchOutcome;
  return {
    id: r.id,
    userId: r.userId,
    inputUrl: r.inputUrl,
    hasInputText: Boolean(r.inputText),
    status: r.status,
    stage: (r.stage as Stage | null) ?? null,
    events: (r.events as RunEventEntry[]) ?? [],
    fetched: slimFetch,
    job: (r.job as ReadJob | null) ?? null,
    verification: (r.verification as Verification | null) ?? null,
    score: (r.score as ScoreResult | null) ?? null,
    verdict: (r.verdict as Verdict | null) ?? null,
    unlockedAt: r.unlockedAt ? new Date(r.unlockedAt).toISOString() : null,
    error: r.error,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

export async function createRun(userId: string, input: { url?: string | null; text?: string | null }): Promise<RunView> {
  const db = await getDb();
  const [row] = await db
    .insert(runs)
    .values({ userId, inputUrl: input.url ?? null, inputText: input.text ?? null, stage: "fetch" })
    .returning();
  nudgeWorker();
  return toView(row);
}

/** Ownership is part of the lookup, so another user's run is indistinguishable from a missing one. */
export async function getRunForUser(userId: string, runId: string): Promise<RunView | null> {
  if (!/^[0-9a-f-]{36}$/i.test(runId)) return null;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(runs)
    .where(and(eq(runs.id, runId), eq(runs.userId, userId)))
    .limit(1);
  return row ? toView(row) : null;
}

export async function listRuns(userId: string, limit = 100): Promise<RunView[]> {
  const db = await getDb();
  const rows = await db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.createdAt)).limit(limit);
  return rows.map(toView);
}

export async function appendEvent(run: { id: string; userId: string }, entry: Omit<RunEventEntry, "at">, patch: Partial<Record<string, unknown>> = {}) {
  const event: RunEventEntry = { at: new Date().toISOString(), ...entry };
  const db = await getDb();
  await db
    .update(runs)
    .set({
      ...(patch as Partial<RunRow>),
      stage: entry.stage,
      events: sql`${runs.events} || ${JSON.stringify([event])}::jsonb`,
      updatedAt: new Date(),
    })
    .where(eq(runs.id, run.id));
  publish({ userId: run.userId, runId: run.id, kind: "run", stage: entry.stage, status: entry.status, detail: entry.detail });
}

export async function updateRun(run: { id: string; userId: string }, patch: Partial<RunRow>) {
  const db = await getDb();
  await db
    .update(runs)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(runs.id, run.id));
  publish({ userId: run.userId, runId: run.id, kind: "run", status: patch.status });
}

/**
 * Claim one run for processing. SKIP LOCKED means two workers (or two loops in
 * one process) never claim the same row, and the lease means a run whose worker
 * died mid-stage is picked up again once the lease lapses.
 */
export async function claimRun(leaseMs: number): Promise<RunRow | null> {
  const rows = await queryRows<Record<string, unknown>>(sql`
    UPDATE runs SET
      status = 'running',
      attempts = attempts + 1,
      lease_until = now() + make_interval(secs => ${Math.round(leaseMs / 1000)}),
      updated_at = now()
    WHERE id = (
      SELECT id FROM runs
      WHERE (status = 'queued' AND (lease_until IS NULL OR lease_until < now()))
         OR (status = 'running' AND lease_until < now())
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  const id = rows[0]?.id as string | undefined;
  if (!id) return null;
  const db = await getDb();
  const [row] = await db.select().from(runs).where(eq(runs.id, id)).limit(1);
  return row ?? null;
}

export async function extendLease(runId: string, leaseMs: number) {
  await queryRows(sql`
    UPDATE runs SET lease_until = now() + make_interval(secs => ${Math.round(leaseMs / 1000)})
    WHERE id = ${runId} AND status = 'running'
  `);
}
