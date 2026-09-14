import { CircleCheck, CircleDashed, CircleX } from "lucide-react";
import { cx } from "@/lib/cx";

export interface RequirementItem {
  requirement: string;
  kind: "must" | "nice";
  met: "met" | "partial" | "missing";
  evidence?: string;
  core?: boolean;
}

const ORDER = { missing: 0, partial: 1, met: 2 } as const;

/** Must-haves first, and within them the ones that decide the verdict: missing, then partial, then met. */
export function sortRequirements(items: RequirementItem[]): RequirementItem[] {
  return [...items].sort((a, b) => Number(b.kind === "must") - Number(a.kind === "must") || ORDER[a.met] - ORDER[b.met]);
}

export function RequirementRow({ item, compact }: { item: RequirementItem; compact?: boolean }) {
  const blocking = item.met === "missing" && item.kind === "must";
  const icon =
    item.met === "met" ? (
      <CircleCheck className="size-[18px] text-apply" aria-label="Met" />
    ) : item.met === "partial" ? (
      <CircleDashed className="size-[18px] text-borderline" aria-label="Partly met" />
    ) : (
      <CircleX className={cx("size-[18px]", blocking ? "text-skip" : "text-muted")} aria-label="Missing" />
    );
  return (
    <li className={cx("flex gap-3", compact ? "py-1.5" : "py-3")}>
      <span className="mt-[1px] shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className={cx("text-[14px] leading-5", item.met === "met" ? "text-ink" : blocking ? "font-medium text-ink" : "text-ink")}>{item.requirement}</span>
          {!compact && (
            <span className={cx("text-[11px] leading-4 font-medium tracking-[0.02em] uppercase", item.kind === "must" ? "text-ink-2" : "text-muted")}>
              {item.kind === "must" ? "Required" : "Nice to have"}
            </span>
          )}
        </div>
        {item.evidence && item.met !== "missing" && <p className="mt-0.5 text-[13px] leading-5 text-muted">{item.evidence}</p>}
      </div>
    </li>
  );
}

export function RequirementList({ items, compact }: { items: RequirementItem[]; compact?: boolean }) {
  return (
    <ul className={cx(!compact && "divide-y divide-line")}>
      {sortRequirements(items).map((item) => (
        <RequirementRow key={`${item.kind}-${item.requirement}`} item={item} compact={compact} />
      ))}
    </ul>
  );
}
