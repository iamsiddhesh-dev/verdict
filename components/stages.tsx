import { Check, Circle, Clock, Loader2, PauseCircle, X } from "lucide-react";
import type { RunEventEntry, RunView, Stage } from "@/lib/pipeline/runs";
import { cx } from "@/lib/cx";

const LABELS: Record<Stage, string> = { fetch: "Fetch", read: "Read", verify: "Verify", score: "Score", verdict: "Verdict" };
const ORDER: Stage[] = ["fetch", "read", "verify", "score", "verdict"];

export type StageState = "pending" | "running" | "waiting" | "done" | "failed" | "needs_input";

/** Derive each stage's state from the event log, which is the truthful record of what happened. */
export function stageStates(run: Pick<RunView, "events" | "status" | "stage">): Record<Stage, StageState> {
  const states = Object.fromEntries(ORDER.map((s) => [s, "pending"])) as Record<Stage, StageState>;
  let lastIndex = -1;
  for (const e of run.events) {
    const idx = ORDER.indexOf(e.stage);
    // A re-run after new input starts the log over from that stage.
    if (e.status === "running" && idx <= lastIndex) {
      for (const s of ORDER.slice(idx)) states[s] = "pending";
    }
    states[e.stage] = e.status;
    lastIndex = Math.max(lastIndex, idx);
  }
  if (run.status === "queued" || run.status === "running") {
    const current = ORDER.find((s) => states[s] !== "done");
    if (current && states[current] === "pending") states[current] = run.status === "queued" && run.events.length ? "waiting" : "running";
  }
  return states;
}

function Icon({ state }: { state: StageState }) {
  switch (state) {
    case "done":
      return <Check className="size-3.5 text-white" aria-hidden />;
    case "running":
      return <Loader2 className="size-3.5 animate-[spin_0.9s_linear_infinite] text-accent" aria-hidden />;
    case "waiting":
      return <Clock className="size-3.5 text-accent" aria-hidden />;
    case "failed":
      return <X className="size-3.5 text-white" aria-hidden />;
    case "needs_input":
      return <PauseCircle className="size-3.5 text-info" aria-hidden />;
    default:
      return <Circle className="size-2 fill-transparent text-line-strong" aria-hidden />;
  }
}

const STATE_WORD: Record<StageState, string> = {
  pending: "not started",
  running: "in progress",
  waiting: "waiting for capacity",
  done: "done",
  failed: "failed",
  needs_input: "needs your input",
};

export function StageIndicator({ states }: { states: Record<Stage, StageState> }) {
  return (
    <ol className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-0" aria-label="Progress">
      {ORDER.map((stage, i) => {
        const s = states[stage];
        return (
          <li key={stage} className="flex items-center sm:flex-1 sm:last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={cx(
                  "flex size-6 items-center justify-center rounded-full border",
                  s === "done" && "border-apply bg-apply",
                  s === "failed" && "border-skip bg-skip",
                  (s === "running" || s === "waiting") && "border-accent bg-accent-subtle",
                  s === "needs_input" && "border-info-line bg-info-bg",
                  s === "pending" && "border-line-strong bg-base",
                )}
              >
                <Icon state={s} />
              </span>
              <span className={cx("text-[14px]", s === "pending" ? "text-muted" : "font-medium text-ink")}>
                {LABELS[stage]}
                <span className="sr-only">, {STATE_WORD[s]}</span>
              </span>
            </div>
            {i < ORDER.length - 1 && (
              <span className={cx("mx-3 hidden h-px flex-1 sm:block", s === "done" ? "bg-apply-line" : "bg-line")} aria-hidden />
            )}
          </li>
        );
      })}
    </ol>
  );
}

export function EventLog({ events }: { events: RunEventEntry[] }) {
  const shown = events.filter((e) => e.status !== "running" || e === events[events.length - 1]).slice(-8);
  if (!shown.length) return null;
  return (
    <ul className="space-y-1.5 font-mono text-[13px] leading-5 text-ink-2" aria-live="polite">
      {shown.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex gap-3">
          <span className="w-16 shrink-0 text-muted">{LABELS[e.stage].toLowerCase()}</span>
          <span className={cx(e.status === "failed" && "text-skip", e.status === "waiting" && "text-accent")}>{e.detail}</span>
        </li>
      ))}
    </ul>
  );
}
