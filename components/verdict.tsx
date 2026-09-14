import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import type { Verdict } from "@/lib/pipeline/score";
import { cx } from "@/lib/cx";

const META: Record<Verdict, { label: string; icon: typeof CheckCircle2; text: string; bg: string; line: string; ring: string }> = {
  apply: { label: "Apply", icon: CheckCircle2, text: "text-apply", bg: "bg-apply-bg", line: "border-apply-line", ring: "var(--color-apply)" },
  borderline: {
    label: "Borderline",
    icon: AlertTriangle,
    text: "text-borderline",
    bg: "bg-borderline-bg",
    line: "border-borderline-line",
    ring: "var(--color-borderline)",
  },
  skip: { label: "Skip", icon: XCircle, text: "text-skip", bg: "bg-skip-bg", line: "border-skip-line", ring: "var(--color-skip)" },
};

/** Icon, word and colour together, so the verdict never depends on colour alone. */
export function VerdictBadge({ verdict, size = "sm", score }: { verdict: Verdict; size?: "sm" | "lg"; score?: number | null }) {
  const m = META[verdict];
  const Icon = m.icon;
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-sm border font-semibold",
        m.text,
        m.bg,
        m.line,
        size === "lg" ? "gap-2 px-3 py-1.5 text-[20px] leading-7" : "gap-1 px-2 py-0.5 text-[12px] leading-4",
      )}
    >
      <Icon className={size === "lg" ? "size-5" : "size-3.5"} aria-hidden />
      {m.label}
      {score !== undefined && score !== null && size === "sm" && <span className="font-mono font-normal opacity-80">{score}</span>}
    </span>
  );
}

export function ScoreRing({ score, verdict, size = 120 }: { score: number; verdict: Verdict; size?: number }) {
  const stroke = 6;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const clamped = Math.max(0, Math.min(100, score));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Match score ${clamped} out of 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={META[verdict].ring}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${(clamped / 100) * c} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[32px] leading-10 font-medium text-ink">{clamped}</span>
        <span className="text-[12px] leading-4 font-medium tracking-[0.01em] text-muted">match</span>
      </div>
    </div>
  );
}

export function GapChip({ text, blocking }: { text: string; blocking?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[14px] leading-5",
        blocking ? "border-skip-line bg-skip-bg text-skip" : "border-line bg-sunken text-ink-2",
      )}
    >
      {blocking && <XCircle className="size-3.5 shrink-0" aria-label="Blocking" />}
      {text}
    </span>
  );
}
