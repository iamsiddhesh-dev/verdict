"use client";

import { ArrowLeft, ExternalLink, Info, Lock, RotateCcw, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ArtifactView } from "@/lib/pipeline/artifacts";
import type { RunView } from "@/lib/pipeline/runs";
import { EventLog, StageIndicator, stageStates } from "./stages";
import { ToolsSection } from "./tools-section";
import { HardStopBanner, TrustPanel } from "./trust-panel";
import { Button, Callout, Card, Textarea, cx } from "./ui/primitives";
import { api, useLiveEvents } from "./use-live";
import { GapChip, ScoreRing, VerdictBadge } from "./verdict";

const WORK_MODE: Record<string, string> = { onsite: "Onsite", hybrid: "Hybrid", remote: "Remote" };
const EMPLOYMENT: Record<string, string> = { full_time: "Full-time", internship: "Internship", contract: "Contract", part_time: "Part-time", freelance: "Freelance" };

export function RunScreen({ initialRun, profileReady, hasMasterTex }: { initialRun: RunView; profileReady: boolean; hasMasterTex: boolean }) {
  const [run, setRun] = useState(initialRun);
  const [artifacts, setArtifacts] = useState<ArtifactView[]>([]);

  const refresh = useCallback(async () => {
    const { run: next } = await api<{ run: RunView }>(`/api/runs/${initialRun.id}`);
    setRun(next);
  }, [initialRun.id]);

  const refreshArtifacts = useCallback(async () => {
    const { artifacts: list } = await api<{ artifacts: ArtifactView[] }>(`/api/runs/${initialRun.id}/artifacts`);
    setArtifacts(list);
  }, [initialRun.id]);

  const connected = useLiveEvents((e) => {
    if (e.runId !== initialRun.id) return;
    if (e.kind === "artifact") void refreshArtifacts();
    else void refresh();
  });

  useEffect(() => {
    if (run.status === "done") void refreshArtifacts();
  }, [run.status, refreshArtifacts]);

  // The socket is an accelerator. While it is down, poll anything still moving.
  const moving = run.status === "queued" || run.status === "running" || artifacts.some((a) => a.status === "queued" || a.status === "running");
  useEffect(() => {
    if (connected || !moving) return;
    const t = setInterval(() => {
      void refresh();
      void refreshArtifacts();
    }, 4_000);
    return () => clearInterval(t);
  }, [connected, moving, refresh, refreshArtifacts]);

  const job = run.job;
  const fetchedJob = run.fetched?.ok ? run.fetched.job : null;
  const title = job?.title ?? fetchedJob?.title ?? null;
  const company = job?.company ?? fetchedJob?.company ?? null;
  const states = stageStates(run);
  const inProgress = run.status === "queued" || run.status === "running";

  return (
    <div className="space-y-8">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 text-[14px] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> All jobs
        </Link>
        <JobHeader run={run} title={title} company={company} />
      </div>

      {(inProgress || run.status === "failed" || run.status === "needs_input") && (
        <Card className="space-y-5 bg-base">
          <StageIndicator states={states} />
          <EventLog events={run.events} />
          {!connected && inProgress && <p className="text-[12px] text-muted">Live updates reconnecting. The run continues on the server either way.</p>}
        </Card>
      )}

      {run.status === "needs_input" && run.stage === "fetch" && run.fetched && !run.fetched.ok && <PasteFallback run={run} onDone={setRun} />}

      {run.status === "needs_input" && run.stage === "score" && (
        <Callout tone="info" icon={<UserRound className="size-5" />} title="Add your resume to get a verdict">
          The job has been read and checked already. Once your profile is confirmed, this run finishes on its own.
          <div className="mt-3">
            <Link href={`/profile?next=/runs/${run.id}`}>
              <Button size="sm">Set up profile</Button>
            </Link>
          </div>
        </Callout>
      )}

      {run.status === "failed" && <FailedPanel run={run} onDone={setRun} />}

      {run.status === "done" && run.score && run.verdict && (
        <>
          {run.verification && run.verification.hardStops.length > 0 && <HardStopBanner quotes={run.verification.hardStops.map((h) => h.quote)} />}
          <VerdictSection run={run} onRunChange={setRun} />
          {run.verification && <TrustPanel verification={run.verification} company={company} />}
          <ToolsSection run={run} artifacts={artifacts} onArtifactsChange={refreshArtifacts} onRunChange={setRun} hasMasterTex={hasMasterTex} profileReady={profileReady} />
        </>
      )}
    </div>
  );
}

function JobHeader({ run, title, company }: { run: RunView; title: string | null; company: string | null }) {
  const job = run.job;
  const fetchedJob = run.fetched?.ok ? run.fetched.job : null;
  const meta = [
    job?.location ?? fetchedJob?.location,
    job && WORK_MODE[job.workMode],
    job && EMPLOYMENT[job.employmentType],
    job?.salary ?? fetchedJob?.salary,
  ].filter(Boolean) as string[];
  const link = fetchedJob?.url ?? run.inputUrl;

  if (!title && !company) {
    return (
      <div className="mt-4">
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Reading the job</h1>
        {run.inputUrl && <p className="mt-1 truncate text-[14px] text-muted">{run.inputUrl}</p>}
      </div>
    );
  }
  return (
    <div className="mt-4">
      <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.01em] text-ink md:text-[32px] md:leading-10">{title ?? "Untitled role"}</h1>
      <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 text-[14px] text-ink-2">
        {company && <span className="font-medium text-ink">{company}</span>}
        {meta.map((m) => (
          <span key={m} className="flex items-center gap-3">
            <span className="text-line-strong" aria-hidden>
              ·
            </span>
            {m}
          </span>
        ))}
        {fetchedJob && (
          <span className="rounded-sm border border-line bg-surface px-2 py-0.5 text-[12px] leading-4 font-medium text-ink-2">via {fetchedJob.sourceLabel}</span>
        )}
        {link && (
          <a href={link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
            Original posting <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </div>
    </div>
  );
}

function PasteFallback({ run, onDone }: { run: RunView; onDone: (r: RunView) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const outcome = run.fetched && !run.fetched.ok ? run.fetched : null;

  return (
    <Card className="bg-base">
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 size-5 shrink-0 text-info" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] leading-7 font-semibold text-ink">Paste the job description</h2>
          <p className="mt-1 text-[14px] leading-5 text-ink-2">{outcome?.message}</p>
        </div>
      </div>
      <form
        className="mt-5 space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(null);
          try {
            const { run: next } = await api<{ run: RunView }>(`/api/runs/${run.id}/action`, { method: "POST", json: { action: "paste", text } });
            onDone(next);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Could not continue.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Paste the full posting: title, company, responsibilities and requirements."
          className="min-h-56"
          aria-label="Job description"
          invalid={Boolean(error)}
        />
        {error && <p className="text-[13px] text-skip">{error}</p>}
        <div className="flex items-center justify-between gap-3">
          <p className="text-[13px] text-muted">Everything after this works the same as with a link.</p>
          <Button type="submit" loading={busy} disabled={text.trim().split(/\s+/).length < 30}>
            Continue
          </Button>
        </div>
      </form>
    </Card>
  );
}

function FailedPanel({ run, onDone }: { run: RunView; onDone: (r: RunView) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Callout tone="skip" title="This run stopped">
      {run.error ?? "Something went wrong."}
      <div className="mt-3">
        <Button
          size="sm"
          variant="secondary"
          icon={<RotateCcw className="size-4" />}
          loading={busy}
          onClick={async () => {
            setBusy(true);
            try {
              const { run: next } = await api<{ run: RunView }>(`/api/runs/${run.id}/action`, { method: "POST", json: { action: "retry" } });
              onDone(next);
            } finally {
              setBusy(false);
            }
          }}
        >
          Retry
        </Button>
      </div>
    </Callout>
  );
}

function VerdictSection({ run, onRunChange }: { run: RunView; onRunChange: (r: RunView) => void }) {
  const score = run.score!;
  const verdict = run.verdict!;
  const blocking = score.blockers.filter((b) => b.kind === "must_have" || b.kind === "years" || b.kind === "enrollment");
  const otherGaps = score.gaps.filter((g) => !g.blocking);
  const [busy, setBusy] = useState(false);

  return (
    <section
      className={cx(
        "rounded-lg border p-6 md:p-8",
        verdict === "apply" && "border-apply-line",
        verdict === "borderline" && "border-borderline-line",
        verdict === "skip" && "border-line",
      )}
      aria-labelledby="verdict-heading"
    >
      <h2 id="verdict-heading" className="sr-only">
        Verdict
      </h2>
      <div className="flex flex-col gap-6 md:flex-row md:items-start md:gap-8">
        <ScoreRing score={score.score} verdict={verdict} />
        <div className="min-w-0 flex-1 space-y-4">
          <VerdictBadge verdict={verdict} size="lg" />
          <p className="text-[18px] leading-7 text-ink">{score.rationale}</p>

          {blocking.length > 0 && (
            <Callout tone="skip" icon={<Lock className="size-4" />} title={blocking.length === 1 ? "One requirement rules this out" : "These requirements rule this out"}>
              <ul className="space-y-1">
                {blocking.map((b) => (
                  <li key={b.message}>{b.message}</li>
                ))}
              </ul>
            </Callout>
          )}

          {verdict === "borderline" && score.moveToApply && (
            <p className="text-[14px] leading-5 text-ink-2">
              <span className="font-medium text-ink">What would make it a clear fit: </span>
              {score.moveToApply}
            </p>
          )}
        </div>
      </div>

      {otherGaps.length > 0 && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[12px] leading-4 font-medium tracking-[0.01em] text-muted uppercase">Gaps</h3>
          <div className="mt-3 flex flex-wrap gap-2">
            {otherGaps.map((g) => (
              <GapChip key={g.text} text={g.text} />
            ))}
          </div>
        </div>
      )}

      {score.leadWith.name && verdict !== "skip" && (
        <div className="mt-6 border-t border-line pt-5">
          <h3 className="text-[12px] leading-4 font-medium tracking-[0.01em] text-muted uppercase">Lead with</h3>
          <p className="mt-2 text-[16px] leading-6 text-ink">
            <span className="font-semibold">{score.leadWith.name}</span>
            {score.leadWith.why && <span className="text-ink-2">. {score.leadWith.why}</span>}
          </p>
          {score.alsoMention && <p className="mt-1 text-[14px] text-ink-2">Also worth mentioning: {score.alsoMention}</p>}
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[12px] text-muted">
        <span>Scored by {score.scoredBy.split("/").slice(1).join("/")}</span>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 hover:text-ink disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            try {
              const { run: next } = await api<{ run: RunView }>(`/api/runs/${run.id}/action`, { method: "POST", json: { action: "rescore" } });
              onRunChange(next);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RotateCcw className="size-3.5" aria-hidden /> Score again
        </button>
      </div>
    </section>
  );
}
