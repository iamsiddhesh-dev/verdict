"use client";

import { ArrowRight, ChevronRight, Loader2, PauseCircle, Sparkles, UserRound, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import type { Verdict } from "@/lib/pipeline/score";
import { PasteBox } from "./paste-box";
import { cx } from "./ui/primitives";
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
  if (days === 1) return "Yesterday";
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

function Monogram({ name }: { name: string | null }) {
  const letter = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <span className="flex size-10 shrink-0 items-center justify-center rounded-md border border-line bg-surface text-[15px] font-semibold text-ink-2" aria-hidden>
      {letter}
    </span>
  );
}

export function Dashboard({ initialRuns, profileReady, firstName }: { initialRuns: RunRow[]; profileReady: boolean; firstName: string | null }) {
  const [runs, setRuns] = useState(initialRuns);
  const [filter, setFilter] = useState<Filter>("all");

  const refresh = useCallback(async () => {
    const { runs: next } = await api<{ runs: RunRow[] }>("/api/runs");
    setRuns(next);
  }, []);
  useLiveEvents((e) => {
    if (e.kind === "run" && (e.status === "done" || e.status === "failed" || e.status === "needs_input" || e.stage === "fetch" || e.stage === "read")) void refresh();
  });

  const counts = useMemo(() => {
    const c = { all: runs.length, apply: 0, borderline: 0, skip: 0 };
    for (const r of runs) if (r.verdict) c[r.verdict] += 1;
    return c;
  }, [runs]);
  const shown = filter === "all" ? runs : runs.filter((r) => r.verdict === filter);

  return (
    <div className="space-y-10">
      <section className="space-y-5">
        <div>
          <h1 className="text-[28px] leading-9 font-semibold tracking-[-0.02em] text-ink md:text-[32px] md:leading-10">
            {firstName ? `Hi ${firstName}, what are you applying to?` : "What are you applying to?"}
          </h1>
          <p className="mt-1 text-[15px] text-ink-2">Paste a job link or the full description. The verdict usually takes about a minute.</p>
        </div>

        {!profileReady && (
          <Link
            href="/profile"
            className="group flex items-center gap-4 rounded-lg border border-line bg-base p-4 shadow-[var(--shadow-sm)] transition-colors hover:border-line-strong"
          >
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ink text-white">
              <UserRound className="size-5" aria-hidden />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold text-ink">Start with your resume</span>
              <span className="block text-[14px] text-ink-2">Verdicts are judged against it. Jobs you paste before that are read and checked, then scored once it is in.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden />
          </Link>
        )}

        <PasteBox autoFocus size="lg" />
      </section>

      <section className="space-y-4" aria-labelledby="history-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="history-heading" className="text-[18px] leading-7 font-semibold text-ink">
            Your jobs
          </h2>
          {runs.length > 0 && (
            <div className="inline-flex rounded-md border border-line bg-base p-0.5" role="group" aria-label="Filter by verdict">
              {(["all", "apply", "borderline", "skip"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  aria-pressed={filter === f}
                  onClick={() => setFilter(f)}
                  className={cx(
                    "h-8 rounded-[5px] px-3 text-[13px] font-medium capitalize transition-colors",
                    filter === f ? "bg-ink text-white" : "text-ink-2 hover:text-ink",
                  )}
                >
                  {f} <span className={cx("ml-0.5 font-mono text-[12px]", filter === f ? "text-white/70" : "text-muted")}>{counts[f]}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {runs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-strong bg-base px-6 py-12 text-center">
            <span className="mx-auto flex size-10 items-center justify-center rounded-full bg-sunken">
              <Sparkles className="size-5 text-ink-2" aria-hidden />
            </span>
            <p className="mt-4 text-[16px] font-semibold text-ink">No jobs checked yet</p>
            <p className="mx-auto mt-1 max-w-md text-[14px] leading-5 text-ink-2">
              Links from Lever, Greenhouse, Ashby, Workable and most careers pages are read directly. For LinkedIn or X, paste the text of the post.
            </p>
          </div>
        ) : (
          <ul className="overflow-hidden rounded-lg border border-line bg-base shadow-[var(--shadow-sm)]">
            {shown.map((r, i) => (
              <li key={r.id} className={cx(i > 0 && "border-t border-line")}>
                <Link href={`/runs/${r.id}`} className="group flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-surface sm:gap-4">
                  <Monogram name={r.company ?? r.title} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] leading-5 font-medium text-ink">{r.title ?? hostOf(r.inputUrl)}</p>
                    <p className="mt-0.5 truncate text-[13px] leading-5 text-muted">
                      {[r.company, r.title ? hostOf(r.inputUrl) : null].filter(Boolean).join(" · ") || "Reading the posting"}
                    </p>
                  </div>
                  <RowStatus row={r} />
                  {/* Server and browser format times with different locale data; the browser's wins. */}
                  <span className="hidden w-20 text-right text-[13px] text-muted sm:block" suppressHydrationWarning>
                    {when(r.createdAt)}
                  </span>
                  <ChevronRight className="size-4 shrink-0 text-line-strong transition-colors group-hover:text-ink-2" aria-hidden />
                </Link>
              </li>
            ))}
            {shown.length === 0 && <li className="px-4 py-8 text-center text-[14px] text-ink-2">No {filter} verdicts yet.</li>}
          </ul>
        )}
      </section>
    </div>
  );
}

function RowStatus({ row }: { row: RunRow }) {
  if (row.status === "done" && row.verdict) {
    return (
      <span className="flex items-center gap-2.5">
        <span className="hidden font-mono text-[14px] text-ink-2 tabular-nums sm:inline">{row.score}</span>
        <VerdictBadge verdict={row.verdict} />
      </span>
    );
  }
  if (row.status === "failed")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-skip">
        <XCircle className="size-3.5" aria-hidden /> Stopped
      </span>
    );
  if (row.status === "needs_input")
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-medium text-info">
        <PauseCircle className="size-3.5" aria-hidden /> {row.stage === "score" ? "Needs resume" : "Needs text"}
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-accent">
      <Loader2 className="size-3.5 animate-[spin_0.9s_linear_infinite]" aria-hidden /> Checking
    </span>
  );
}
