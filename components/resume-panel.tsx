"use client";

import { Download, FileCode2, Info, RefreshCw, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { ArtifactView } from "@/lib/pipeline/artifacts";
import type { RunView } from "@/lib/pipeline/runs";
import type { BulletStatus, ResumeContent, ResumeDiffEntry } from "@/lib/resume";
import { Button, Callout, Card, Skeleton, cx } from "./ui/primitives";
import { api } from "./use-live";

type ResumeView = Omit<ResumeContent, "pdfBase64"> & { hasPdf: boolean };

const linkButton =
  "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-line-strong bg-base px-3 text-[14px] font-medium text-ink transition-colors hover:bg-surface";

export function ResumePanel({
  run,
  artifact,
  onCreated,
  hasMasterTex,
}: {
  run: RunView;
  artifact: ArtifactView | null;
  onCreated: () => Promise<void>;
  hasMasterTex: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const content = artifact?.status === "done" ? (artifact.content as ResumeView) : null;
  const pending = artifact && (artifact.status === "queued" || artifact.status === "running");

  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/runs/${run.id}/artifacts`, { method: "POST", json: { kind: "resume" } });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="space-y-6 bg-base">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h3 className="text-[20px] leading-7 font-semibold text-ink">Tailored resume</h3>
          <p className="mt-1 max-w-prose text-[14px] text-ink-2">
            Chooses and reorders what is already on your resume for this role and rephrases bullets in the posting&rsquo;s words. Nothing is added that
            your resume does not already say.
          </p>
        </div>
        <Button loading={busy || Boolean(pending)} onClick={start} icon={content ? <RefreshCw className="size-4" /> : undefined}>
          {content ? "Tailor again" : "Tailor resume"}
        </Button>
      </div>

      {!hasMasterTex && !content && (
        <Callout tone="info" icon={<Info className="size-4" />}>
          You have not uploaded a .tex file, so this uses a standard one-page template built from your resume.{" "}
          <Link href="/profile" className="font-medium text-accent underline underline-offset-2">
            Upload your .tex
          </Link>{" "}
          to keep your own layout.
        </Callout>
      )}
      {error && <p className="text-[13px] text-skip">{error}</p>}

      {pending && artifact && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-[14px] text-ink-2">{artifact.progress ?? (artifact.status === "queued" ? "Queued." : "Starting.")}</p>
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      )}
      {artifact?.status === "failed" && <Callout tone="skip">{artifact.error}</Callout>}

      {content && artifact && <ResumeResult runId={run.id} artifactId={artifact.id} content={content} />}
    </Card>
  );
}

function PageBadge({ content }: { content: ResumeView }) {
  if (content.pages === null) {
    return <span className="rounded-sm border border-line bg-sunken px-2 py-0.5 text-[12px] font-medium text-ink-2">PDF not compiled</span>;
  }
  const one = content.pages <= 1;
  return (
    <span
      className={cx(
        "rounded-sm border px-2 py-0.5 font-mono text-[12px] font-medium",
        one ? "border-apply-line bg-apply-bg text-apply" : "border-borderline-line bg-borderline-bg text-borderline",
      )}
    >
      {content.pages} page{content.pages === 1 ? "" : "s"}
    </span>
  );
}

function ResumeResult({ runId, artifactId, content }: { runId: string; artifactId: string; content: ResumeView }) {
  const base = `/api/runs/${runId}/artifacts/${artifactId}/download`;
  const sections = [...new Set(content.entries.map((e) => e.section))];
  const rewritten = content.entries.flatMap((e) => e.bullets).filter((b) => b.status === "rewritten").length;

  return (
    <div className="space-y-5 border-t border-line pt-5">
      <div className="flex flex-wrap items-center gap-3">
        <PageBadge content={content} />
        <span className="text-[13px] text-muted">
          {rewritten} bullet{rewritten === 1 ? "" : "s"} rephrased
          {content.compile.attempts > 1 ? `, fitted in ${content.compile.attempts} compiles` : ""}
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          {content.hasPdf && (
            <a className={linkButton} href={`${base}?format=pdf`} download>
              <Download className="size-4" aria-hidden /> PDF
            </a>
          )}
          <a className={linkButton} href={`${base}?format=tex`} download>
            <FileCode2 className="size-4" aria-hidden /> .tex
          </a>
        </div>
      </div>

      {!content.compile.ok && content.compile.message && (
        <Callout tone={content.compile.log ? "borderline" : "neutral"} icon={<Info className="size-4" />} title={content.compile.message}>
          {content.compile.log && <pre className="mt-2 overflow-x-auto rounded-sm bg-sunken p-3 font-mono text-[12px] leading-4 whitespace-pre-wrap text-ink-2">{content.compile.log}</pre>}
        </Callout>
      )}
      {content.pages !== null && content.pages > 1 && (
        <Callout tone="borderline" title={`Still ${content.pages} pages`}>
          Trimming stopped before it fit. Shorten the longest section of your master file, or remove a project you would not lead with.
        </Callout>
      )}

      {content.notes.length > 0 && (
        <Callout tone="apply" icon={<ShieldCheck className="size-4" />} title="Honesty checks">
          <ul className="list-disc space-y-1 pl-5">
            {content.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        </Callout>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section}>
              <h4 className="mb-3 text-[12px] font-medium tracking-[0.01em] text-muted uppercase">{section}</h4>
              <div className="space-y-3">
                {content.entries
                  .filter((e) => e.section === section)
                  .map((entry) => (
                    <EntryDiff key={entry.id} entry={entry} />
                  ))}
              </div>
            </div>
          ))}
        </div>

        <aside className="space-y-5 lg:border-l lg:border-line lg:pl-6">
          <div>
            <h4 className="text-[12px] font-medium text-muted uppercase">What this version leads with</h4>
            <p className="mt-1.5 text-[14px] leading-5 text-ink">{content.focus}</p>
          </div>
          {content.keywords.length > 0 && (
            <div>
              <h4 className="text-[12px] font-medium text-muted uppercase">Posting terms covered</h4>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {content.keywords.map((k) => (
                  <span key={k} className="rounded-full border border-line bg-sunken px-2.5 py-0.5 text-[12px] text-ink-2">
                    {k}
                  </span>
                ))}
              </div>
            </div>
          )}
          {content.skills.some((s) => s.removed.length) && (
            <div>
              <h4 className="text-[12px] font-medium text-muted uppercase">Skills left off for this role</h4>
              <ul className="mt-1.5 space-y-1.5 text-[13px] leading-5 text-ink-2">
                {content.skills
                  .filter((s) => s.removed.length)
                  .map((s) => (
                    <li key={s.label}>
                      <span className="font-medium text-ink">{s.label}:</span> {s.removed.join(", ")}
                    </li>
                  ))}
              </ul>
            </div>
          )}
          <p className="text-[12px] leading-4 text-muted">
            {content.source === "master" ? "Built from your .tex file." : "Built from your parsed resume in a standard template."}
            {content.model ? ` Rephrased by ${content.model.split("/").slice(1).join("/")}.` : ""}
          </p>
        </aside>
      </div>
    </div>
  );
}

const STATUS_LABEL: Partial<Record<BulletStatus, string>> = {
  dropped: "Left out",
  trimmed: "Trimmed to fit one page",
  reverted: "Original wording kept",
};

function EntryDiff({ entry }: { entry: ResumeDiffEntry }) {
  const [open, setOpen] = useState(entry.included);
  return (
    <div className={cx("rounded-md border", entry.included ? "border-line bg-base" : "border-dashed border-line bg-surface")}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left">
        <span className="min-w-0">
          <span className={cx("block text-[14px] font-semibold", entry.included ? "text-ink" : "text-ink-2")}>{entry.title}</span>
          {entry.subtitle && <span className="block truncate text-[13px] text-muted">{entry.subtitle}</span>}
        </span>
        {!entry.included && <span className="shrink-0 rounded-sm bg-sunken px-2 py-0.5 text-[12px] text-ink-2">Not included</span>}
      </button>
      {open && (
        <ul className="space-y-2 border-t border-line px-4 py-3">
          {entry.bullets.map((b) => (
            <li key={b.id} className="text-[14px] leading-5">
              {b.status === "rewritten" ? (
                <div className="space-y-1">
                  <p className="rounded-sm bg-skip-bg px-2 py-1 text-ink-2 line-through decoration-skip/40">{b.before}</p>
                  <p className="rounded-sm bg-apply-bg px-2 py-1 text-ink">{b.after}</p>
                </div>
              ) : b.status === "dropped" || b.status === "trimmed" ? (
                <p className="text-muted">
                  <span className="line-through">{b.before}</span>
                  <span className="ml-2 text-[12px] no-underline">{STATUS_LABEL[b.status]}</span>
                </p>
              ) : (
                <p className="text-ink">
                  {b.after ?? b.before}
                  {b.status === "reverted" && <span className="ml-2 text-[12px] text-borderline">{STATUS_LABEL.reverted}</span>}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
