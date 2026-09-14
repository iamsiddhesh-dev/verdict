"use client";

import { Download, ExternalLink, FileCode2, FileText, MapPin, Pencil, ShieldAlert, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ResumeFacts } from "@/lib/profile/resume";
import { Button, Callout, Input, Label, cx } from "./ui/primitives";

export interface OverviewData {
  facts: ResumeFacts;
  resumeFilename: string | null;
  hasResumeFile: boolean;
  hasMasterTex: boolean;
  githubUrl: string | null;
  linkedinUrl: string | null;
  portfolioUrl: string | null;
  preferences: string | null;
  email: string | null;
}

const linkBtn = "inline-flex h-8 items-center gap-1.5 rounded-md border border-line-strong bg-base px-3 text-[13px] font-medium text-ink hover:bg-surface";

function SectionCard({ title, action, children, className }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-base shadow-[var(--shadow-sm)]", className)}>
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
        <h2 className="text-[15px] font-semibold text-ink">{title}</h2>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EditLink({ step, label = "Edit" }: { step: number; label?: string }) {
  return (
    <Link href={`/profile?edit=${step}`} className="inline-flex items-center gap-1 rounded-sm text-[13px] font-medium text-ink-2 hover:text-ink">
      <Pencil className="size-3.5" aria-hidden /> {label}
    </Link>
  );
}

export function ProfileOverview({ data }: { data: OverviewData }) {
  const f = data.facts;
  const initial = (f.name ?? "?").trim().charAt(0).toUpperCase();
  const links = [
    { label: "GitHub", url: data.githubUrl },
    { label: "LinkedIn", url: data.linkedinUrl },
    { label: "Portfolio", url: data.portfolioUrl },
  ].filter((l) => l.url);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-5 rounded-xl border border-line bg-base p-6 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center">
        <span className="flex size-16 shrink-0 items-center justify-center rounded-full bg-ink text-[26px] font-semibold text-white" aria-hidden>
          {initial}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] leading-8 font-semibold tracking-[-0.02em] text-ink">{f.name ?? "Your profile"}</h1>
          {f.headline && <p className="mt-0.5 text-[15px] text-ink-2">{f.headline}</p>}
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-muted">
            {f.location && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden /> {f.location}
              </span>
            )}
            <span>
              {f.yearsOfExperience} year{f.yearsOfExperience === 1 ? "" : "s"} of professional experience
            </span>
            {f.isCurrentStudent && <span>Currently studying</span>}
          </div>
        </div>
        <Link href="/profile?edit=3" className={cx(linkBtn, "h-9 self-start px-4 text-[14px] sm:self-center")}>
          <Pencil className="size-4" aria-hidden /> Edit profile
        </Link>
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start">
        <div className="min-w-0 space-y-6">
          <SectionCard title="Skills" action={<EditLink step={3} />}>
            {f.skills.length ? (
              <div className="flex flex-wrap gap-1.5">
                {f.skills.map((s) => (
                  <span key={s} className="rounded-full border border-line bg-surface px-2.5 py-0.5 text-[13px] text-ink-2">
                    {s}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[14px] text-muted">No skills listed.</p>
            )}
          </SectionCard>

          <SectionCard title="Experience" action={<EditLink step={3} />}>
            {f.experience.length ? (
              <ul className="space-y-5">
                {f.experience.map((e, i) => (
                  <li key={`${e.company}-${i}`} className="flex gap-3">
                    <span className="mt-1.5 size-2 shrink-0 rounded-full bg-line-strong" aria-hidden />
                    <div className="min-w-0">
                      <p className="text-[15px] font-semibold text-ink">
                        {e.title} <span className="font-normal text-ink-2">at {e.company}</span>
                      </p>
                      {(e.duration || e.location) && <p className="text-[13px] text-muted">{[e.duration, e.location].filter(Boolean).join(" · ")}</p>}
                      <p className="mt-1.5 text-[14px] leading-6 text-ink-2">{e.summary}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">None found in the resume.</p>
            )}
          </SectionCard>

          <SectionCard title="Projects" action={<EditLink step={3} />}>
            {f.projects.length ? (
              <ul className="grid gap-3 sm:grid-cols-2">
                {f.projects.map((p, i) => (
                  <li key={`${p.name}-${i}`} className="rounded-lg border border-line bg-surface p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[15px] font-semibold text-ink">{p.name}</p>
                      {p.url && (
                        <a href={p.url} target="_blank" rel="noreferrer" aria-label={`Open ${p.name}`} className="rounded-sm text-muted hover:text-ink">
                          <ExternalLink className="size-4" />
                        </a>
                      )}
                    </div>
                    <p className="mt-1 line-clamp-4 text-[13px] leading-5 text-ink-2">{p.description}</p>
                    {p.technologies.length > 0 && <p className="mt-2 font-mono text-[11px] leading-4 text-muted">{p.technologies.join(" · ")}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[14px] text-muted">None found in the resume.</p>
            )}
          </SectionCard>
        </div>

        <aside className="space-y-6">
          <SectionCard title="Files">
            <ul className="space-y-4">
              <li className="flex items-start gap-3">
                <FileText className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">Resume</p>
                  <p className="truncate text-[13px] text-muted">{data.resumeFilename ?? "Uploaded"}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {data.hasResumeFile && (
                      <a href="/api/profile/resume" className={linkBtn}>
                        <Download className="size-3.5" aria-hidden /> Download
                      </a>
                    )}
                    <Link href="/profile?edit=0" className={linkBtn}>
                      Replace
                    </Link>
                  </div>
                </div>
              </li>
              <li className="flex items-start gap-3 border-t border-line pt-4">
                <FileCode2 className="mt-0.5 size-5 shrink-0 text-ink-2" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-ink">Master .tex</p>
                  <p className="text-[13px] text-muted">{data.hasMasterTex ? "Used for tailored resumes" : "Not added. Tailored resumes use a standard template."}</p>
                  <div className="mt-2">
                    <Link href="/profile?edit=2" className={linkBtn}>
                      {data.hasMasterTex ? "Replace" : "Add .tex"}
                    </Link>
                  </div>
                </div>
              </li>
            </ul>
          </SectionCard>

          <SectionCard title="Links and preferences" action={<EditLink step={1} />}>
            {links.length > 0 ? (
              <ul className="space-y-1.5">
                {links.map((l) => (
                  <li key={l.label} className="flex items-center justify-between gap-3 text-[13px]">
                    <span className="text-muted">{l.label}</span>
                    <a href={l.url!} target="_blank" rel="noreferrer" className="truncate text-ink hover:underline">
                      {l.url!.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}
                    </a>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[13px] text-muted">No links added.</p>
            )}
            <div className="mt-4 border-t border-line pt-4">
              <p className="text-[13px] font-medium text-ink">What you are looking for</p>
              <p className="mt-1 text-[13px] leading-5 text-ink-2">{data.preferences?.trim() || "Not set. Verdicts judge location and role type from this."}</p>
            </div>
          </SectionCard>

          <AccountCard email={data.email} />
        </aside>
      </div>
    </div>
  );
}

function AccountCard({ email }: { email: string | null }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <SectionCard title="Your data">
      {email && (
        <p className="mb-4 text-[13px] text-ink-2">
          Signed in as <span className="font-medium text-ink">{email}</span>
        </p>
      )}
      <div className="space-y-2">
        <a href="/api/account" className={cx(linkBtn, "w-full justify-center")}>
          <Download className="size-3.5" aria-hidden /> Download all my data
        </a>
        {!confirming ? (
          <button type="button" onClick={() => setConfirming(true)} className={cx(linkBtn, "w-full justify-center text-skip hover:bg-skip-bg")}>
            <Trash2 className="size-3.5" aria-hidden /> Delete all my data
          </button>
        ) : (
          <div className="space-y-3 rounded-lg border border-skip-line bg-skip-bg p-4">
            <p className="flex gap-2 text-[13px] leading-5 text-ink">
              <ShieldAlert className="mt-0.5 size-4 shrink-0 text-skip" aria-hidden />
              This permanently deletes your profile, resume files, every job you checked and everything written for you. It cannot be undone.
            </p>
            <div>
              <Label htmlFor="confirm-delete">Type delete to confirm</Label>
              <Input id="confirm-delete" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            {error && <Callout tone="skip">{error}</Callout>}
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => (setConfirming(false), setTyped(""))}>
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                loading={busy}
                disabled={typed.trim().toLowerCase() !== "delete"}
                onClick={async () => {
                  setBusy(true);
                  setError(null);
                  try {
                    const res = await fetch("/api/account", { method: "DELETE" });
                    if (!res.ok) throw new Error("Could not delete. Try again.");
                    window.location.assign("/");
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Could not delete.");
                    setBusy(false);
                  }
                }}
              >
                Delete everything
              </Button>
            </div>
          </div>
        )}
      </div>
    </SectionCard>
  );
}
