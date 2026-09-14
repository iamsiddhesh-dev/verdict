"use client";

import { ChevronRight, Loader2, PauseCircle, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { Verdict } from "@/lib/pipeline/score";
import { PasteBox } from "./paste-box";
import { Button, Callout, cx } from "./ui/primitives";
import { api, useLiveEvents } from "./use-live";
import { VerdictBadge } from "./verdict";

export interface RunRow {
  id: string;
  status: "queued" | "running" | "needs_input" | "done" | "failed";
  stage: string | null;
  verdict: Verdict | null;
  score: number | null;
  title: string | null;
  company: string | null;
  inputUrl: string | null;
  createdAt: string;
}

type Filter = "all" | Verdict;

function when(iso: string) {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days === 0) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "numeric", month: "short" });
}

function hostOf(url: string | null) {
  if (!url) return "Pasted description";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Dashboard({ initialRuns, profileReady }: { initialRuns: RunRow[]; profileReady: boolean }) {
  const [runs, setRuns] = useState(initialRuns);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    const { runs: next } = await api<{ runs: RunRow[] }>("/api/runs");
    setRuns(next);
  }, []);
  useLiveEvents((e) => {
    if (e.kind === "run" && (e.status === "done" || e.status === "failed" || e.status === "needs_input" || e.stage === "fetch")) void refresh();
  });

  const counts = useMemo(() => {
    const c = { all: runs.length, apply: 0, borderline: 0, skip: 0 };
    for (const r of runs) if (r.verdict) c[r.verdict] += 1;
    return c;
  }, [runs]);
  const shown = filter === "all" ? runs : runs.filter((r) => r.verdict === filter);

  return (
    <div className="space-y-10">
      <section className="space-y-4">
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">Check a job</h1>
        {!profileReady && (
          <Callout tone="info" icon={<UserRound className="size-5" />} title="Add your resume first">
            Verdicts are judged against your real background. Jobs you paste now are read and checked, and scored once your profile is set up.
            <div className="mt-3">
              <Link href="/profile">
                <Button size="sm">Set up profile</Button>
              </Link>
            </div>
          </Callout>
        )}
        <PasteBox autoFocus size="lg" />
      </section>

      <section className="space-y-4" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="history-heading" className="text-[24px] leading-8 font-semibold tracking-[-0.01em] text-ink">
            Past jobs
          </h2>
          {runs.length > 0 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by verdict">
              {(["all", "apply", "borderline", "skip"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cx(
                    "h-8 rounded-full border px-3 text-[13px] font-medium capitalize",
                    filter === f ? "border-ink bg-ink text-white" : "border-line bg-base text-ink-2 hover:border-line-strong",
                  )}
                >
                  {f} <span className="font-mono opacity-70">{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="rounded-md border border-dashed border-line-strong px-6 py-10 text-center">
            <p className="text-[16px] font-medium text-ink">No jobs checked yet</p>
            <p className="mx-auto mt-1 max-w-md text-[14px] text-ink-2">
              Paste a link from a company careers page, Lever, Greenhouse, Ashby or Workable, or paste the description from anywhere else.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {shown.map((r) => (
              <li key={r.id}>
                <Link href={`/runs/${r.id}`} className="flex items-center gap-4 bg-base px-4 py-3.5 hover:bg-surface">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-ink">{r.title ?? hostOf(r.inputUrl)}</p>
                    <p className="truncate text-[13px] text-ink-2">{r.company ?? (r.title ? hostOf(r.inputUrl) : "Reading")}</p>
                  </div>
                  <RowStatus row={r} />
                  <span className="hidden w-16 text-right text-[13px] text-muted sm:block">{when(r.createdAt)}</span>
                  <ChevronRight className="size-4 shrink-0 text-muted" aria-hidden />
                </Link>
              </li>
            ))}
            {shown.length === 0 && <li className="bg-base px-4 py-6 text-center text-[14px] text-ink-2">No {filter} verdicts yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function RowStatus({ row }: { row: RunRow }) {
  if (row.status === "done" && row.verdict) return <VerdictBadge verdict={row.verdict} score={row.score} />;
  if (row.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-skip">
        <XCircle className="size-3.5" aria-hidden /> Stopped
      </span>
    );
  if (row.status === "needs_input")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-info">
        <PauseCircle className="size-3.5" aria-hidden /> {row.stage === "score" ? "Needs profile" : "Needs text"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
      <Loader2 className="size-3.5 animate-[spin_0.9s_linear_infinite]" aria-hidden /> Working
    </span>
  );
}
