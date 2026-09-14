// The tools behind the verdict: answers, outreach and the tailored resume.
//
// Each generation is an artifact row processed by the same worker as runs, so a
// wait for writing capacity happens in the background and survives a restart.
// Tools are generated on request only, never automatically, and only for runs
// whose verdict unlocked them.

import { and, desc, eq, sql } from "drizzle-orm";
import { artifacts, runs } from "@/db/schema";
import { getDb, queryRows } from "@/lib/db";
import { nudgeWorker, publish } from "@/lib/events";
import type { FetchOutcome } from "@/lib/fetch";
import { CapacityError } from "@/lib/llm";
import { loadProfile, profileIsReady } from "@/lib/profile";
import { tailorResume, type ResumeContent } from "@/lib/resume";
import type { Issue } from "@/lib/writing/honesty";
import { STANDARD_QUESTIONS, writeAnswers, writeOutreach, type QuestionInput } from "@/lib/writing/tools";
import type { ReadJob } from "./read";
import type { RunView } from "./runs";
import type { ScoreResult } from "./score";

export type ArtifactKind = "answers" | "outreach" | "resume";
export type ArtifactStatus = "queued" | "running" | "done" | "failed";

export interface ArtifactView {
  id: string;
  runId: string;
  kind: ArtifactKind;
  status: ArtifactStatus;
  input: unknown;
  content: unknown;
  issues: Issue[];
  model: string | null;
  progress: string | null;
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

type ArtifactRow = typeof artifacts.$inferSelect;

function toView(r: ArtifactRow): ArtifactView {
  const content = (r.content ?? null) as { value?: unknown; issues?: Issue[]; model?: string } | null;
  // The PDF is served by the download route. Lists are polled, so they do not carry it.
  let value = content?.value ?? null;
  if (r.kind === "resume" && value) {
    const { pdfBase64, ...rest } = value as ResumeContent;
    value = { ...rest, hasPdf: Boolean(pdfBase64) };
  }
  return {
    id: r.id,
    runId: r.runId,
    kind: r.kind as ArtifactKind,
    status: r.status as ArtifactStatus,
    input: r.input,
    content: value,
    issues: content?.issues ?? [],
    model: content?.model ?? null,
    progress: r.progress ?? null,
    error: r.error,
    createdAt: new Date(r.createdAt).toISOString(),
    updatedAt: new Date(r.updatedAt).toISOString(),
  };
}

/** The server-side gate. The UI shows the same rule, but this is the one that counts. */
export function toolsUnlocked(run: Pick<RunView, "verdict" | "unlockedAt" | "verification" | "status">): { ok: boolean; reason: string } {
  if (run.status !== "done" || !run.verdict) return { ok: false, reason: "The verdict is not ready yet." };
  if (run.verification?.hardStops.length) return { ok: false, reason: "This posting asks for money or documents before an offer." };
  if (run.verdict === "apply") return { ok: true, reason: "" };
  if (run.verdict === "borderline") {
    return run.unlockedAt ? { ok: true, reason: "" } : { ok: false, reason: "This is a borderline fit. Unlock the tools if you still want to apply." };
  }
  return { ok: false, reason: "The verdict is Skip, so the tools stay locked for this role." };
}

export async function listArtifacts(runId: string): Promise<ArtifactView[]> {
  const db = await getDb();
  const rows = await db.select().from(artifacts).where(eq(artifacts.runId, runId)).orderBy(desc(artifacts.createdAt));
  return rows.map(toView);
}

export async function createArtifact(run: RunView, kind: ArtifactKind, input: unknown): Promise<ArtifactView> {
  const db = await getDb();
  const [row] = await db.insert(artifacts).values({ runId: run.id, kind, input: input as object }).returning();
  publish({ userId: run.userId, runId: run.id, kind: "artifact", status: "queued" });
  nudgeWorker();
  return toView(row);
}

export async function claimArtifact(leaseSeconds: number): Promise<ArtifactRow | null> {
  // Artifacts reuse updated_at as their lease: a running row untouched for the
  // lease period belongs to a worker that died.
  const rows = await queryRows<{ id: string }>(sql`
    UPDATE artifacts SET status = 'running', updated_at = now()
    WHERE id = (
      SELECT id FROM artifacts
      WHERE status = 'queued'
         OR (status = 'running' AND updated_at < now() - make_interval(secs => ${leaseSeconds}))
      ORDER BY created_at
      FOR UPDATE SKIP LOCKED
      LIMIT 1
    )
    RETURNING id
  `);
  if (!rows[0]) return null;
  const db = await getDb();
  const [row] = await db.select().from(artifacts).where(eq(artifacts.id, rows[0].id)).limit(1);
  return row ?? null;
}

export async function processArtifact(row: ArtifactRow) {
  const db = await getDb();
  const [run] = await db.select().from(runs).where(eq(runs.id, row.runId)).limit(1);
  if (!run) return;
  const notify = (status: string, detail?: string) => publish({ userId: run.userId, runId: run.id, kind: "artifact", status, detail });
  const finish = async (patch: Partial<ArtifactRow>) => {
    await db.update(artifacts).set({ ...patch, updatedAt: new Date() }).where(eq(artifacts.id, row.id));
    notify(patch.status ?? "running");
  };

  const heartbeat = setInterval(() => {
    void db.update(artifacts).set({ updatedAt: new Date() }).where(and(eq(artifacts.id, row.id), eq(artifacts.status, "running")));
  }, 20_000);

  try {
    const profile = await loadProfile(run.userId);
    const fetched = run.fetched as FetchOutcome | null;
    if (!profileIsReady(profile) || !fetched?.ok || !run.job || !run.score) throw new Error("The run is missing its profile, job or score.");
    const read = run.job as ReadJob;
    const score = run.score as ScoreResult;
    const onWait = (n: { ms: number }) => notify("running", `Waiting about ${Math.ceil(n.ms / 1000)}s for free writing capacity.`);

    if (row.kind === "answers") {
      const input = (row.input ?? {}) as { questions?: QuestionInput[]; includeStandard?: boolean };
      const questions = [...(input.includeStandard !== false ? STANDARD_QUESTIONS : []), ...(input.questions ?? [])];
      if (!questions.length) throw new Error("There are no questions to answer.");
      const result = await writeAnswers(profile, read, score, fetched.job.text, questions, onWait);
      await finish({ status: "done", content: { value: result.value, issues: result.issues, model: result.model }, error: null });
    } else if (row.kind === "outreach") {
      const input = (row.input ?? {}) as { contactName?: string | null; contactRole?: string | null };
      const result = await writeOutreach(
        profile,
        read,
        score,
        fetched.job.text,
        { name: input.contactName?.trim() || read.contactName, role: input.contactRole?.trim() || null },
        onWait,
      );
      await finish({ status: "done", content: { value: result.value, issues: result.issues, model: result.model }, error: null });
    } else if (row.kind === "resume") {
      const onProgress = (detail: string) => {
        void db.update(artifacts).set({ progress: detail, updatedAt: new Date() }).where(eq(artifacts.id, row.id));
        notify("running", detail);
      };
      const value = await tailorResume({ profile, read, score, jobText: fetched.job.text, onProgress, onWait });
      await finish({ status: "done", content: { value, issues: [], model: value.model }, progress: null, error: null });
    } else {
      throw new Error("This tool is not available yet.");
    }
  } catch (err) {
    console.error(`[artifacts] ${row.kind} ${row.id} failed:`, err);
    const message =
      err instanceof CapacityError
        ? "The free writing models are at capacity. Try again in a few minutes."
        : err instanceof Error && /not available yet|missing its/.test(err.message)
          ? err.message
          : "Generation failed on our side. Try again.";
    await finish({ status: "failed", progress: null, error: message });
  } finally {
    clearInterval(heartbeat);
  }
}
