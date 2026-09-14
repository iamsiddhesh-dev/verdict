"use client";

import { AlertTriangle, Check, ChevronDown, Info, Minus, OctagonAlert } from "lucide-react";
import { useState } from "react";
import type { CompanyType } from "@/lib/verify/company";
import type { Check as CheckItem, Verification } from "@/lib/verify";
import { CopyButton, cx } from "./ui/primitives";

const TYPE_LABEL: Record<CompanyType, string> = {
  product: "Product",
  services: "Services",
  staffing: "Staffing",
  eor: "EOR",
  unknown: "Type unknown",
};

export function CompanyTypePill({ type }: { type: CompanyType }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-line bg-base px-2.5 py-0.5 text-[12px] leading-4 font-medium text-ink-2">
      {(type === "staffing" || type === "eor") && <Info className="size-3.5" aria-hidden />}
      {TYPE_LABEL[type]}
    </span>
  );
}

// "Not confirmed" is drawn as a neutral dash, never as a warning. Most real roles
// fail at least one check for ordinary reasons, and colour that reads as
// suspicion would smear real companies.
function CheckRow({ check }: { check: CheckItem }) {
  const icon =
    check.status === "confirmed" ? (
      <Check className="size-4 text-apply" aria-label="Confirmed" />
    ) : check.status === "flag" ? (
      <AlertTriangle className="size-4 text-borderline" aria-label="Worth a look" />
    ) : (
      <Minus className="size-4 text-muted" aria-label="Not confirmed" />
    );
  return (
    <li className="flex gap-3 py-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[14px] leading-5 font-medium text-ink">{check.label}</p>
        <p className="text-[14px] leading-5 text-ink-2">{check.detail}</p>
      </div>
    </li>
  );
}

export function HardStopBanner({ quotes }: { quotes: string[] }) {
  return (
    <div role="alert" className="rounded-lg border-2 border-skip bg-skip-bg p-5">
      <div className="flex items-start gap-3">
        <OctagonAlert className="mt-0.5 size-6 shrink-0 text-skip" aria-hidden />
        <div className="min-w-0">
          <p className="text-[18px] leading-7 font-semibold text-skip">This posting asks for money or documents before an offer.</p>
          <p className="mt-1 text-[14px] leading-5 text-ink">
            Real employers do not charge applicants or need bank or identity documents to consider an application. The tools below stay locked for this
            posting.
          </p>
          <ul className="mt-3 space-y-1.5">
            {quotes.map((q) => (
              <li key={q} className="rounded-sm border border-skip-line bg-base px-3 py-2 font-mono text-[13px] leading-5 text-ink-2">
                “{q}”
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TrustPanel({ verification, company }: { verification: Verification; company: string | null }) {
  const flagged = verification.checks.some((c) => c.status === "flag");
  const [open, setOpen] = useState(flagged || verification.companyType === "staffing" || verification.companyType === "eor");
  const questionsText = verification.questionsToAsk.map((q) => `- ${q}`).join("\n");

  return (
    <section className="rounded-md border border-line bg-base">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 rounded-md px-5 py-4 text-left hover:bg-surface"
      >
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="text-[16px] font-semibold text-ink">About {company ?? "the company"}</span>
          <CompanyTypePill type={verification.companyType} />
          <span className="text-[14px] text-ink-2">{verification.summary}</span>
        </div>
        <ChevronDown className={cx("size-5 shrink-0 text-muted transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="border-t border-line px-5 pt-2 pb-5">
          {verification.companyTypeNote && (
            <p className="mt-3 rounded-sm bg-info-bg px-3 py-2 text-[14px] leading-5 text-ink-2">
              <span className="font-medium text-info">{TYPE_LABEL[verification.companyType]}. </span>
              {verification.companyTypeNote}
            </p>
          )}
          {verification.companyTypeEvidence && (
            <p className="mt-3 text-[13px] text-muted">
              From their site: <span className="text-ink-2">“{verification.companyTypeEvidence}”</span>
            </p>
          )}
          <ul className="mt-2 divide-y divide-line">
            {verification.checks.map((c) => (
              <CheckRow key={c.id} check={c} />
            ))}
          </ul>
          {verification.questionsToAsk.length > 0 && (
            <div className="mt-4 rounded-sm bg-surface p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-semibold text-ink">Questions worth asking</p>
                <CopyButton text={questionsText} />
              </div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[14px] leading-5 text-ink-2">
                {verification.questionsToAsk.map((q) => (
                  <li key={q}>{q}</li>
                ))}
              </ul>
            </div>
          )}
          <p className="mt-4 text-[12px] leading-4 text-muted">
            These are the checks we could run and what they showed. They are not a judgment on whether the company or the role is genuine.
          </p>
        </div>
      )}
    </section>
  );
}
