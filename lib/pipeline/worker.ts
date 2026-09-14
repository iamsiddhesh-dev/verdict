// The in-process worker: claims queued runs and walks them through the stages.
//
// Every stage writes its result to the run row before the next one starts, and
// a stage whose column is already filled is skipped. So a run reclaimed after a
// crash, a redeploy or a capacity wait resumes where it stopped and never pays
// for the same model call twice.

import type { runs } from "@/db/schema";
import { bus } from "@/lib/events";
import { fetchJob, jobFromPaste, type FetchOutcome } from "@/lib/fetch";
import { CapacityError, type WaitNotice } from "@/lib/llm";
import { loadProfile, profileIsReady } from "@/lib/profile";
import { verify, type Verification } from "@/lib/verify";
import { claimArtifact, processArtifact } from "./artifacts";
import { readJob, type ReadJob } from "./read";
import { appendEvent, claimRun, extendLease, updateRun, type Stage } from "./runs";
import { scoreFit } from "./score";

type RunRow = typeof runs.$inferSelect;

const LEASE_MS = 90_000;
const POLL_MS = 3_000;
const MAX_ATTEMPTS = 6;

class NeedsInput extends Error {}

function waitNotifier(run: RunRow, stage: Stage) {
  let lastAt = 0;
  return (n: WaitNotice) => {
    // One line per wait is informative; one per five-second slice is noise.
    if (Date.now() - lastAt < 20_000) return;
    lastAt = Date.now();
    void appendEvent(run, {
      stage,
      status: "waiting",
      detail: `Waiting about ${Math.max(1, Math.ceil(n.ms / 1000))}s for free model capacity. Nothing is wrong; the run continues on its own.`,
    });
  };
}

async function stageFetch(run: RunRow): Promise<FetchOutcome & { ok: true }> {
  const existing = run.fetched as FetchOutcome | null;
  if (existing?.ok) return existing;

  if (run.inputText?.trim()) {
    const job = jobFromPaste(run.inputText, run.inputUrl);
    const outcome = { ok: true as const, job };
    await appendEvent(run, { stage: "fetch", status: "done", detail: `Using the pasted description, ${job.text.split(/\s+/).length.toLocaleString("en-US")} words.` }, { fetched: outcome });
    return outcome;
  }
  if (!run.inputUrl) throw new Error("This run has neither a link nor a description.");

  await appendEvent(run, { stage: "fetch", status: "running", detail: "Reading the link." });
  const outcome = await fetchJob(run.inputUrl);
  if (!outcome.ok) {
    await appendEvent(run, { stage: "fetch", status: "needs_input", detail: outcome.message }, { fetched: outcome, status: "needs_input", leaseUntil: null });
    throw new NeedsInput();
  }
  const j = outcome.job;
  const where = j.tier === "ats" ? `Found it on ${j.sourceLabel}` : `Read it from ${j.sourceLabel}`;
  await appendEvent(
    run,
    { stage: "fetch", status: "done", detail: `${where}: ${j.title ?? "untitled role"}${j.company ? ` at ${j.company}` : ""}.` },
    { fetched: outcome },
  );
  return outcome;
}

async function stageRead(run: RunRow, fetched: FetchOutcome & { ok: true }): Promise<ReadJob> {
  if (run.job) return run.job as ReadJob;
  const words = fetched.job.text.split(/\s+/).filter(Boolean).length;
  await appendEvent(run, { stage: "read", status: "running", detail: `Reading ${words.toLocaleString("en-US")} words for requirements.` });
  const read = await readJob(fetched.job, waitNotifier(run, "read"));
  const must = read.mustHave.length;
  await appendEvent(
    run,
    {
      stage: "read",
      status: "done",
      detail: read.looksLikeJobPosting
        ? `${read.title ?? "Role"}${read.company ? ` at ${read.company}` : ""}. ${must} must-have requirement${must === 1 ? "" : "s"}.`
        : "This does not read like a job posting.",
    },
    { job: read },
  );
  return read;
}

async function stageVerify(run: RunRow, fetched: FetchOutcome & { ok: true }, read: ReadJob): Promise<Verification> {
  if (run.verification) return run.verification as Verification;
  await appendEvent(run, { stage: "verify", status: "running", detail: "Checking the company's website, domain and mail records." });
  const verification = await verify(fetched.job, read, waitNotifier(run, "verify"));
  await appendEvent(run, { stage: "verify", status: "done", detail: verification.summary }, { verification });
  return verification;
}

async function stageScore(run: RunRow, fetched: FetchOutcome & { ok: true }, read: ReadJob, verification: Verification) {
  if (run.score) return;
  const profile = await loadProfile(run.userId);
  if (!profileIsReady(profile)) {
    await appendEvent(
      run,
      { stage: "score", status: "needs_input", detail: "Add your resume to get a verdict. The job has been read and checked already." },
      { status: "needs_input", leaseUntil: null },
    );
    throw new NeedsInput();
  }
  await appendEvent(run, { stage: "score", status: "running", detail: "Scoring the role against your profile." });
  const score = await scoreFit(profile, read, fetched.job.text, verification, waitNotifier(run, "score"));
  await appendEvent(run, { stage: "score", status: "done", detail: `Scored ${score.score} of 100.` }, { score });

  const label = { apply: "Apply", borderline: "Borderline", skip: "Skip" }[score.verdict];
  await appendEvent(
    run,
    { stage: "verdict", status: "done", detail: score.blockers.length ? `${label}: ${score.blockers[0].message}` : `${label}.` },
    { verdict: score.verdict, status: "done", leaseUntil: null, error: null },
  );
}

export async function processRun(run: RunRow) {
  const heartbeat = setInterval(() => void extendLease(run.id, LEASE_MS).catch(() => {}), LEASE_MS / 3);
  let currentStage: Stage = (run.stage as Stage) ?? "fetch";
  try {
    currentStage = "fetch";
    const fetched = await stageFetch(run);
    currentStage = "read";
    const read = await stageRead(run, fetched);
    currentStage = "verify";
    const verification = await stageVerify(run, fetched, read);
    currentStage = "score";
    await stageScore(run, fetched, read, verification);
  } catch (err) {
    if (err instanceof NeedsInput) return;
    if (err instanceof CapacityError && run.attempts < MAX_ATTEMPTS) {
      const retryIn = Math.min(Math.max(err.retryInMs ?? 60_000, 15_000), 10 * 60_000);
      await appendEvent(
        run,
        {
          stage: currentStage,
          status: "waiting",
          detail: `The free models are at capacity right now. Trying again in about ${Math.ceil(retryIn / 1000)}s.`,
        },
        { status: "queued", leaseUntil: new Date(Date.now() + retryIn) },
      );
      return;
    }
    console.error(`[worker] run ${run.id} failed at ${currentStage}:`, err);
    const message =
      err instanceof CapacityError
        ? "The free models stayed at capacity for too long. Retry in a few minutes."
        : "Something went wrong on our side at this step. Retrying usually works.";
    await appendEvent(run, { stage: currentStage, status: "failed", detail: message }, { status: "failed", error: message, leaseUntil: null });
  } finally {
    clearInterval(heartbeat);
  }
}

/** Put a run that stopped for input, or failed, back on the queue. */
export async function requeue(run: { id: string; userId: string }, patch: Partial<RunRow> = {}) {
  await updateRun(run, { ...patch, status: "queued", leaseUntil: null, attempts: 0, error: null });
  bus().emit("work-available");
}

const g = globalThis as typeof globalThis & { __jobAgentWorker?: boolean };

export function startWorker(concurrency = Number(process.env.WORKER_CONCURRENCY ?? 3)) {
  if (g.__jobAgentWorker) return;
  g.__jobAgentWorker = true;

  let active = 0;
  let wake: (() => void) | null = null;
  bus().on("work-available", () => wake?.());

  const loop = async () => {
    while (true) {
      if (active >= concurrency) {
        await new Promise<void>((r) => (wake = r));
        continue;
      }
      let job: Promise<void> | null = null;
      try {
        const run = await claimRun(LEASE_MS);
        if (run) job = processRun(run);
        else {
          const artifact = await claimArtifact(LEASE_MS / 1000);
          if (artifact) job = processArtifact(artifact);
        }
      } catch (err) {
        console.error("[worker] claim failed:", err);
      }
      if (!job) {
        await new Promise<void>((r) => {
          wake = r;
          setTimeout(r, POLL_MS);
        });
        continue;
      }
      active += 1;
      void job.finally(() => {
        active -= 1;
        wake?.();
      });
    }
  };
  void loop();
  console.log(`[worker] started, concurrency ${concurrency}`);
}
