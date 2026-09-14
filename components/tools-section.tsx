"use client";

import { AlertTriangle, FileText, Lock, MessageSquareText, Plus, Send, Trash2, Unlock } from "lucide-react";
import { useState } from "react";
import type { ArtifactKind, ArtifactView } from "@/lib/pipeline/artifacts";
import type { RunView } from "@/lib/pipeline/runs";
import { ResumePanel } from "./resume-panel";
import type { Issue } from "@/lib/writing/honesty";
import type { AnswersContent, OutreachContent } from "@/lib/writing/tools";
import { Button, Callout, Card, CopyButton, Input, Label, Skeleton, Textarea, cx } from "./ui/primitives";
import { api } from "./use-live";

type Gate = "locked" | "unlockable" | "open";

function gateFor(run: RunView): { gate: Gate; reason: string } {
  if (run.verification?.hardStops.length) return { gate: "locked", reason: "Locked because the posting asks for money or documents before an offer." };
  if (run.verdict === "apply") return { gate: "open", reason: "" };
  if (run.verdict === "borderline") {
    return run.unlockedAt ? { gate: "open", reason: "" } : { gate: "unlockable", reason: "Borderline fit. Unlock if you still want to apply." };
  }
  return { gate: "locked", reason: "Unlocks when the verdict is Apply." };
}

const TOOLS: Array<{ kind: ArtifactKind; title: string; blurb: string; icon: typeof FileText }> = [
  { kind: "answers", title: "Application answers", blurb: "Why you, why them, and any questions from the form.", icon: MessageSquareText },
  { kind: "outreach", title: "Outreach", blurb: "LinkedIn note, X message and a cold email.", icon: Send },
  { kind: "resume", title: "Tailored resume", blurb: "A one-page .tex and PDF fitted to this role.", icon: FileText },
];

export function ToolsSection({
  run,
  artifacts,
  onArtifactsChange,
  onRunChange,
  hasMasterTex,
}: {
  run: RunView;
  artifacts: ArtifactView[];
  onArtifactsChange: () => Promise<void>;
  onRunChange: (r: RunView) => void;
  hasMasterTex: boolean;
  profileReady: boolean;
}) {
  const { gate, reason } = gateFor(run);
  const [selected, setSelected] = useState<ArtifactKind | null>(null);
  const [unlocking, setUnlocking] = useState(false);

  return (
    <section aria-labelledby="tools-heading" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="tools-heading" className="text-[24px] leading-8 font-semibold tracking-[-0.01em] text-ink">
          Apply
        </h2>
        {gate === "unlockable" && (
          <Button
            variant="secondary"
            size="sm"
            icon={<Unlock className="size-4" />}
            loading={unlocking}
            onClick={async () => {
              setUnlocking(true);
              try {
                const { run: next } = await api<{ run: RunView }>(`/api/runs/${run.id}/action`, { method: "POST", json: { action: "unlock" } });
                onRunChange(next);
              } finally {
                setUnlocking(false);
              }
            }}
          >
            Generate anyway
          </Button>
        )}
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const latest = artifacts.find((a) => a.kind === tool.kind);
          const open = gate === "open";
          const isSelected = selected === tool.kind;
          return (
            <button
              key={tool.kind}
              type="button"
              disabled={!open}
              aria-pressed={isSelected}
              onClick={() => setSelected(isSelected ? null : tool.kind)}
              className={cx(
                "flex h-full flex-col items-start gap-3 rounded-md border p-5 text-left transition-colors",
                open ? "bg-base hover:border-accent-line" : "cursor-not-allowed bg-surface",
                isSelected ? "border-accent ring-1 ring-accent" : "border-line",
              )}
            >
              <div className="flex w-full items-center justify-between">
                <span className={cx("flex size-9 items-center justify-center rounded-md", open ? "bg-accent-subtle text-accent" : "bg-sunken text-muted")}>
                  {open ? <Icon className="size-5" aria-hidden /> : <Lock className="size-4" aria-hidden />}
                </span>
                {latest && <StatusDot status={latest.status} />}
              </div>
              <div>
                <p className={cx("text-[16px] font-semibold", open ? "text-ink" : "text-ink-2")}>{tool.title}</p>
                <p className="mt-1 text-[14px] leading-5 text-ink-2">{tool.blurb}</p>
              </div>
              {!open && <p className="mt-auto text-[13px] leading-5 text-muted">{reason}</p>}
            </button>
          );
        })}
      </div>

      {selected === "answers" && gate === "open" && (
        <AnswersPanel run={run} artifact={artifacts.find((a) => a.kind === "answers") ?? null} onCreated={onArtifactsChange} />
      )}
      {selected === "outreach" && gate === "open" && (
        <OutreachPanel run={run} artifact={artifacts.find((a) => a.kind === "outreach") ?? null} onCreated={onArtifactsChange} />
      )}
      {selected === "resume" && gate === "open" && (
        <ResumePanel run={run} artifact={artifacts.find((a) => a.kind === "resume") ?? null} onCreated={onArtifactsChange} hasMasterTex={hasMasterTex} />
      )}
    </section>
  );
}

function StatusDot({ status }: { status: ArtifactView["status"] }) {
  const label = { queued: "Queued", running: "Writing", done: "Ready", failed: "Failed" }[status];
  return (
    <span className={cx("text-[12px] font-medium", status === "done" ? "text-apply" : status === "failed" ? "text-skip" : "text-accent")}>{label}</span>
  );
}

function IssuesNote({ issues }: { issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <Callout tone="borderline" icon={<AlertTriangle className="size-4" />} title="Check these before sending">
      <p>The draft still broke these rules after three attempts, so it is shown with the problems rather than hidden:</p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map((i) => (
          <li key={i.message}>{i.message}</li>
        ))}
      </ul>
    </Callout>
  );
}

function Pending({ artifact }: { artifact: ArtifactView }) {
  return (
    <div className="space-y-3" aria-live="polite">
      <p className="text-[14px] text-ink-2">
        {artifact.progress ?? (artifact.status === "queued" ? "Queued." : "Writing and checking the draft. This can take a minute on the free models.")}
      </p>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
    </div>
  );
}

function useCreate(runId: string, onCreated: () => Promise<void>) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const create = async (body: unknown) => {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/runs/${runId}/artifacts`, { method: "POST", json: body });
      await onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start.");
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, create };
}

function AnswersPanel({ run, artifact, onCreated }: { run: RunView; artifact: ArtifactView | null; onCreated: () => Promise<void> }) {
  const fromPosting = run.job?.formQuestions ?? [];
  const [includeStandard, setIncludeStandard] = useState(true);
  const [questions, setQuestions] = useState<Array<{ question: string; maxChars: string }>>(fromPosting.map((q) => ({ question: q, maxChars: "" })));
  const [draft, setDraft] = useState("");
  const [draftLimit, setDraftLimit] = useState("");
  const { busy, error, create } = useCreate(run.id, onCreated);
  const content = artifact?.status === "done" ? (artifact.content as AnswersContent) : null;
  const pending = artifact && (artifact.status === "queued" || artifact.status === "running");

  const addQuestion = () => {
    if (draft.trim().length < 3) return;
    setQuestions((q) => [...q, { question: draft.trim(), maxChars: draftLimit }]);
    setDraft("");
    setDraftLimit("");
  };

  return (
    <Card className="space-y-6 bg-base">
      <div>
        <h3 className="text-[20px] leading-7 font-semibold text-ink">Application answers</h3>
        <p className="mt-1 text-[14px] text-ink-2">Paste questions from the application form. Answers use only what is in your profile.</p>
      </div>

      <div className="space-y-3">
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={includeStandard} onChange={(e) => setIncludeStandard(e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
          Include &ldquo;Why are you a good fit&rdquo; and &ldquo;Why this company&rdquo;
        </label>

        {questions.length > 0 && (
          <ul className="space-y-2">
            {questions.map((q, i) => (
              <li key={`${q.question}-${i}`} className="flex items-start gap-3 rounded-sm border border-line bg-surface px-3 py-2 text-[14px]">
                <span className="min-w-0 flex-1 text-ink">
                  {q.question}
                  {q.maxChars && <span className="ml-2 font-mono text-[12px] text-muted">max {q.maxChars}</span>}
                </span>
                <button type="button" aria-label="Remove question" className="text-muted hover:text-skip" onClick={() => setQuestions((all) => all.filter((_, j) => j !== i))}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <div className="flex-1">
            <Label htmlFor="new-question">Add a question from the form</Label>
            <Input
              id="new-question"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addQuestion();
                }
              }}
              placeholder="What interests you about working with us?"
            />
          </div>
          <div className="sm:w-32">
            <Label htmlFor="new-limit" hint="optional">
              Char limit
            </Label>
            <Input id="new-limit" inputMode="numeric" value={draftLimit} onChange={(e) => setDraftLimit(e.target.value.replace(/\D/g, ""))} placeholder="500" />
          </div>
          <Button type="button" variant="secondary" className="sm:mt-6.5" icon={<Plus className="size-4" />} onClick={addQuestion}>
            Add
          </Button>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button
          loading={busy || Boolean(pending)}
          disabled={!includeStandard && questions.length === 0}
          onClick={() =>
            create({
              kind: "answers",
              includeStandard,
              questions: questions.map((q) => ({ question: q.question, maxChars: q.maxChars ? Number(q.maxChars) : null })),
            })
          }
        >
          {content ? "Write again" : "Write answers"}
        </Button>
        {error && <p className="text-[13px] text-skip">{error}</p>}
      </div>

      {pending && artifact && <Pending artifact={artifact} />}
      {artifact?.status === "failed" && <Callout tone="skip">{artifact.error}</Callout>}

      {content && (
        <div className="space-y-4 border-t border-line pt-5">
          <IssuesNote issues={artifact!.issues} />
          {content.answers.map((a) => (
            <EditableAnswer key={`${artifact!.id}-${a.question}`} question={a.question} answer={a.answer} maxChars={a.maxChars} />
          ))}
          <p className="text-[12px] text-muted">Written by {artifact!.model?.split("/").slice(1).join("/")}. Edits here are not saved; copy when ready.</p>
        </div>
      )}
    </Card>
  );
}

function EditableAnswer({ question, answer, maxChars }: { question: string; answer: string; maxChars: number | null }) {
  const [text, setText] = useState(answer);
  const over = maxChars !== null && text.length > maxChars;
  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-[14px] leading-5 font-medium text-ink">{question}</p>
        <CopyButton text={text} />
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-32" aria-label={question} invalid={over} />
      <p className={cx("mt-1 text-right font-mono text-[12px]", over ? "text-skip" : "text-muted")}>
        {text.length}
        {maxChars ? ` / ${maxChars}` : ""} characters
      </p>
    </div>
  );
}

function OutreachPanel({ run, artifact, onCreated }: { run: RunView; artifact: ArtifactView | null; onCreated: () => Promise<void> }) {
  const [contactName, setContactName] = useState(run.job?.contactName ?? "");
  const [contactRole, setContactRole] = useState("");
  const [tab, setTab] = useState<"linkedin" | "x" | "email">("linkedin");
  const { busy, error, create } = useCreate(run.id, onCreated);
  const content = artifact?.status === "done" ? (artifact.content as OutreachContent) : null;
  const pending = artifact && (artifact.status === "queued" || artifact.status === "running");

  return (
    <Card className="space-y-6 bg-base">
      <div>
        <h3 className="text-[20px] leading-7 font-semibold text-ink">Outreach</h3>
        <p className="mt-1 text-[14px] text-ink-2">Messages work best addressed to a named person, such as the founder or the hiring manager.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor="contact-name" hint="optional">
            Their name
          </Label>
          <Input id="contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder="Priya Sharma" />
        </div>
        <div>
          <Label htmlFor="contact-role" hint="optional">
            Their role
          </Label>
          <Input id="contact-role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Founder, CTO" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button loading={busy || Boolean(pending)} onClick={() => create({ kind: "outreach", contactName: contactName || null, contactRole: contactRole || null })}>
          {content ? "Write again" : "Write messages"}
        </Button>
        {error && <p className="text-[13px] text-skip">{error}</p>}
      </div>

      {pending && artifact && <Pending artifact={artifact} />}
      {artifact?.status === "failed" && <Callout tone="skip">{artifact.error}</Callout>}

      {content && (
        <div className="space-y-4 border-t border-line pt-5">
          <IssuesNote issues={artifact!.issues} />
          <div role="tablist" className="inline-flex rounded-md border border-line bg-surface p-1">
            {(
              [
                ["linkedin", "LinkedIn"],
                ["x", "X"],
                ["email", "Email"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cx("h-8 rounded-sm px-3 text-[14px] font-medium", tab === key ? "bg-base text-ink shadow-[var(--shadow-sm)]" : "text-ink-2 hover:text-ink")}
              >
                {label}
              </button>
            ))}
          </div>
          {tab === "linkedin" && <Message key={`${artifact!.id}-li`} text={content.linkedin} limit={300} />}
          {tab === "x" && <Message key={`${artifact!.id}-x`} text={content.xDm} limit={280} />}
          {tab === "email" && (
            <div className="space-y-3">
              <Message key={`${artifact!.id}-subject`} label="Subject" text={content.email.subject} rows="min-h-10" />
              <Message key={`${artifact!.id}-body`} label="Body" text={content.email.body} rows="min-h-64" />
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function Message({ text: initial, limit, label, rows }: { text: string; limit?: number; label?: string; rows?: string }) {
  const [text, setText] = useState(initial);
  const over = limit !== undefined && text.length > limit;
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="text-[14px] font-medium text-ink">{label ?? "Message"}</p>
        <CopyButton text={text} />
      </div>
      <Textarea value={text} onChange={(e) => setText(e.target.value)} className={rows ?? "min-h-32"} invalid={over} aria-label={label ?? "Message"} />
      {limit !== undefined && (
        <p className={cx("mt-1 text-right font-mono text-[12px]", over ? "text-skip" : "text-muted")}>
          {text.length} / {limit}
        </p>
      )}
    </div>
  );
}
