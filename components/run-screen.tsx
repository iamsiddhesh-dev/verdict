"use client";

import { ArrowLeft, ArrowUpRight, Info, Lock, RotateCcw, Sparkles, UserRound } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ArtifactView } from "@/lib/pipeline/artifacts";
import type { RunView } from "@/lib/pipeline/runs";
import { WEIGHTS } from "@/lib/pipeline/weights";
import { RequirementList } from "./requirements";
import { EventLog, StageIndicator, stageStates } from "./stages";
import { ToolsSection } from "./tools-section";
import { HardStopBanner, TrustPanel } from "./trust-panel";
import { Button, Callout, Card, Textarea, cx } from "./ui/primitives";
import { api, useLiveEvents } from "./use-live";
import { ScoreRing, VerdictBadge } from "./verdict";

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
  const inProgress = run.status === "queued" || run.status === "running";
  const done = run.status === "done" && run.score && run.verdict;

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard" className="inline-flex items-center gap-1.5 rounded-sm text-[14px] text-ink-2 hover:text-ink">
          <ArrowLeft className="size-4" aria-hidden /> Your jobs
        </Link>
        <JobHeader run={run} title={title} company={company} />
      </div>

      {(inProgress || run.status === "failed" || run.status === "needs_input") && (
        <Card className="space-y-5 bg-base shadow-[var(--shadow-sm)]">
          <StageIndicator states={stageStates(run)} />
          {/* The paste card below already explains a blocked fetch; the log would repeat it. */}
          {!(run.status === "needs_input" && run.stage === "fetch") && <EventLog events={run.events} />}
          {!connected && inProgress && <p className="text-[12px] text-muted">Live updates are reconnecting. The check keeps running on the server either way.</p>}
        </Card>
      )}

      {run.status === "needs_input" && run.stage === "fetch" && run.fetched && !run.fetched.ok && <PasteFallback run={run} onDone={setRun} />}

      {run.status === "needs_input" && run.stage === "score" && (
        <Callout tone="info" icon={<UserRound className="size-5" />} title="Add your resume to get the verdict">
          The job has been read and the company checked. As soon as your profile is confirmed, this finishes on its own.
          <div className="mt-3">
            <Link href={`/profile?next=/runs/${run.id}`}>
              <Button size="sm">Add resume</Button>
            </Link>
          </div>
        </Callout>
      )}

      {run.status === "failed" && <FailedPanel run={run} onDone={setRun} />}

      {done && (
        <>
          {run.verification && run.verification.hardStops.length > 0 && <HardStopBanner quotes={run.verification.hardStops.map((h) => h.quote)} />}
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
            <div className="min-w-0 space-y-6">
              <VerdictCard run={run} onRunChange={setRun} />
              <RequirementsCard run={run} />
              <ToolsSection run={run} artifacts={artifacts} onArtifactsChange={refreshArtifacts} onRunChange={setRun} hasMasterTex={hasMasterTex} profileReady={profileReady} />
            </div>
            <aside className="space-y-6 lg:sticky lg:top-6">
              <ScoreBreakdown run={run} />
              <RoleFacts run={run} />
              {run.verification && <TrustPanel verification={run.verification} company={company} />}
            </aside>
          </div>
        </>
      )}
    </div>
  );
}

function JobHeader({ run, title, company }: { run: RunView; title: string | null; company: string | null }) {
  const job = run.job;
  const fetchedJob = run.fetched?.ok ? run.fetched.job : null;
  const meta = [job?.location ?? fetchedJob?.location, job && WORK_MODE[job.workMode], job && EMPLOYMENT[job.employmentType]].filter(Boolean) as string[];
  const link = fetchedJob?.url ?? run.inputUrl;

  if (!title && !company) {
    return (
      <div className="mt-4">
        <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink md:text-[32px] md:leading-10">Reading the job</h1>
        {run.inputUrl && <p className="mt-1 truncate text-[14px] text-muted">{run.inputUrl}</p>}
      </div>
    );
  }
  return (
    <div className="mt-4 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {company && <p className="text-[14px] font-medium text-ink-2">{company}</p>}
        <h1 className="mt-0.5 text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink md:text-[34px] md:leading-[42px]">{title ?? "Untitled role"}</h1>
        {meta.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {meta.map((m) => (
              <span key={m} className="rounded-full border border-line bg-base px-2.5 py-0.5 text-[13px] text-ink-2">
                {m}
              </span>
            ))}
          </div>
        )}
      </div>
      {link && (
        <a
          href={link}
          target="_blank"
          rel="noreferrer"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-md border border-line-strong bg-base px-3 text-[14px] font-medium text-ink hover:bg-surface md:self-auto"
        >
          {fetchedJob ? `Open on ${fetchedJob.sourceLabel.replace(/^the /, "")}` : "Open posting"}
          <ArrowUpRight className="size-4" aria-hidden />
        </a>
      )}
    </div>
  );
}

const VERDICT_SURFACE = {
  apply: "border-apply-line",
  borderline: "border-borderline-line",
  skip: "border-line",
} as const;

function VerdictCard({ run, onRunChange }: { run: RunView; onRunChange: (r: RunView) => void }) {
  const score = run.score!;
  const verdict = run.verdict!;
  const blocking = score.blockers.filter((b) => b.kind === "must_have" || b.kind === "years" || b.kind === "enrollment" || b.kind === "location");
  const musts = score.requirements.filter((r) => r.kind === "must");
  const mustsMet = musts.filter((r) => r.met === "met").length;
  const [busy, setBusy] = useState(false);

  return (
    <section className={cx("overflow-hidden rounded-xl border bg-base shadow-[var(--shadow-sm)]", VERDICT_SURFACE[verdict])} aria-labelledby="verdict-heading">
      <h2 id="verdict-heading" className="sr-only">
        Verdict
      </h2>
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-5 gap-y-4 p-5 sm:gap-x-7 sm:p-6 md:p-8">
        <div className="sm:row-span-2 sm:self-start">
          <span className="sm:hidden">
            <ScoreRing score={score.score} verdict={verdict} size={88} />
          </span>
          <span className="hidden sm:block">
            <ScoreRing score={score.score} verdict={verdict} />
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <VerdictBadge verdict={verdict} size="lg" />
          {musts.length > 0 && (
            <span className="text-[13px] text-muted">
              {mustsMet} of {musts.length} required met
            </span>
          )}
        </div>
        <div className="col-span-2 sm:col-span-1">
          <p className="text-[16px] leading-7 text-ink sm:text-[17px]">{score.rationale}</p>
          {verdict === "skip" && !blocking.length && <p className="mt-2 text-[14px] text-muted">Not a fit. That is an hour back.</p>}
        </div>
      </div>

      {(blocking.length > 0 || (verdict === "borderline" && score.moveToApply)) && (
        <div className="space-y-3 px-6 pb-6 md:px-8">
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
            <Callout tone="borderline" icon={<Sparkles className="size-4" />} title="What would make it a clear fit">
              {score.moveToApply}
            </Callout>
          )}
        </div>
      )}

      {score.leadWith.name && verdict !== "skip" && (
        <div className="border-t border-line bg-surface px-6 py-4 md:px-8">
          <p className="text-[12px] font-medium tracking-[0.02em] text-muted uppercase">Lead with</p>
          <p className="mt-1 text-[15px] leading-6 text-ink">
            <span className="font-semibold">{score.leadWith.name}</span>
            {score.leadWith.why && <span className="text-ink-2">. {score.leadWith.why}</span>}
          </p>
          {score.alsoMention && <p className="mt-0.5 text-[14px] text-ink-2">Also worth mentioning: {score.alsoMention}</p>}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-3 text-[12px] text-muted md:px-8">
        <span>Scored by {score.scoredBy.split("/").slice(1).join("/")}</span>
        <button
          type="button"
          disabled={busy}
          className="inline-flex items-center gap-1 rounded-sm hover:text-ink disabled:opacity-50"
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
          <RotateCcw className={cx("size-3.5", busy && "animate-[spin_0.9s_linear_infinite]")} aria-hidden /> Score again
        </button>
      </div>
    </section>
  );
}

function RequirementsCard({ run }: { run: RunView }) {
  const items = run.score!.requirements;
  const [showAll, setShowAll] = useState(false);
  if (!items.length) return null;
  const important = items.filter((r) => r.kind === "must" || r.met !== "met");
  const visible = showAll ? items : important.length ? important : items;
  const hidden = items.length - visible.length;
  return (
    <section className="rounded-xl border border-line bg-base shadow-[var(--shadow-sm)]" aria-labelledby="req-heading">
      <div className="flex items-center justify-between gap-3 border-b border-line px-6 py-4">
        <h2 id="req-heading" className="text-[16px] font-semibold text-ink">
          Requirements
        </h2>
        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-apply" aria-hidden /> Met
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-borderline" aria-hidden /> Partly
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-skip" aria-hidden /> Missing
          </span>
        </div>
      </div>
      <div className="px-6 py-1">
        <RequirementList items={visible} />
      </div>
      {hidden > 0 && (
        <button type="button" onClick={() => setShowAll(true)} className="w-full border-t border-line px-6 py-3 text-left text-[13px] font-medium text-ink-2 hover:bg-surface hover:text-ink">
          Show {hidden} more met nice-to-have{hidden === 1 ? "" : "s"}
        </button>
      )}
    </section>
  );
}

function Bar({ label, value, weight }: { label: string; value: number; weight: number }) {
  const v = Math.max(0, Math.min(100, Math.round(value)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 text-[13px]">
        <span className="text-ink-2">
          {label} <span className="text-muted">· {Math.round(weight * 100)}%</span>
        </span>
        <span className="font-mono text-ink tabular-nums">{v}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden>
        <div className={cx("h-full rounded-full", v >= 70 ? "bg-apply" : v >= 45 ? "bg-borderline" : "bg-skip")} style={{ width: `${v}%` }} />
      </div>
    </div>
  );
}

function ScoreBreakdown({ run }: { run: RunView }) {
  const s = run.score!;
  // Runs scored before the breakdown existed have no sub-ratings to show.
  if (![s.overlap, s.seniorityFit, s.locationFit].every((v) => typeof v === "number")) return null;
  const musts = s.requirements.filter((r) => r.kind === "must");
  const coverage =
    typeof s.mustCoverage === "number"
      ? s.mustCoverage
      : musts.length
        ? Math.round((musts.reduce((n, r) => n + (r.met === "met" ? 1 : r.met === "partial" ? 0.5 : 0), 0) / musts.length) * 100)
        : s.overlap;
  return (
    <section className="rounded-xl border border-line bg-base p-5 shadow-[var(--shadow-sm)]" aria-labelledby="breakdown-heading">
      <h2 id="breakdown-heading" className="text-[14px] font-semibold text-ink">
        How the score is made
      </h2>
      <div className="mt-4 space-y-3.5">
        <Bar label="Work overlap" value={s.overlap} weight={WEIGHTS.overlap} />
        <Bar label="Required skills" value={coverage} weight={WEIGHTS.mustCoverage} />
        <Bar label="Experience level" value={s.seniorityFit} weight={WEIGHTS.seniority} />
        <Bar label="Location" value={s.locationFit} weight={WEIGHTS.location} />
      </div>
      <p className="mt-4 text-[12px] leading-4 text-muted">Apply from 70, borderline from 55. A missing core requirement is a skip at any score.</p>
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 py-2 text-[13px]">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 text-right text-ink">{value}</dd>
    </div>
  );
}

function RoleFacts({ run }: { run: RunView }) {
  const job = run.job;
  const fetched = run.fetched?.ok ? run.fetched.job : null;
  if (!job) return null;
  return (
    <section className="rounded-xl border border-line bg-base p-5 shadow-[var(--shadow-sm)]" aria-labelledby="role-heading">
      <h2 id="role-heading" className="text-[14px] font-semibold text-ink">
        The role
      </h2>
      {job.summary && <p className="mt-2 text-[14px] leading-5 text-ink-2">{job.summary}</p>}
      <dl className="mt-3 divide-y divide-line border-t border-line">
        <Fact label="Location" value={job.location} />
        <Fact label="Work mode" value={WORK_MODE[job.workMode]} />
        <Fact label="Type" value={EMPLOYMENT[job.employmentType]} />
        <Fact label="Level" value={job.seniority} />
        <Fact label="Experience" value={job.yearsRequired !== null ? `${job.yearsRequired}+ years` : null} />
        <Fact label="Pay" value={job.salary} />
        <Fact label="Source" value={fetched?.sourceLabel ? fetched.sourceLabel.replace(/^the /, "").replace(/^\w/, (c) => c.toUpperCase()) : null} />
      </dl>
      {job.stack.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {job.stack.slice(0, 14).map((s) => (
            <span key={s} className="rounded-sm bg-sunken px-2 py-0.5 font-mono text-[12px] text-ink-2">
              {s}
            </span>
          ))}
        </div>
      )}
    </section>
  );
}

function PasteFallback({ run, onDone }: { run: RunView; onDone: (r: RunView) => void }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const outcome = run.fetched && !run.fetched.ok ? run.fetched : null;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;

  return (
    <Card className="bg-base shadow-[var(--shadow-sm)]">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-info-bg">
          <Info className="size-5 text-info" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[18px] leading-7 font-semibold text-ink">Paste the job description to continue</h2>
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
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[13px] text-muted">{words > 0 ? `${words} words. ` : ""}Everything after this works the same as with a link.</p>
          <Button type="submit" loading={busy} disabled={words < 30}>
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
    <Callout tone="skip" title="This check stopped">
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
          Try again
        </Button>
      </div>
    </Callout>
  );
}
