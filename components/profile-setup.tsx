"use client";

import { Check, FileUp, Plus, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import type { ResumeFacts } from "@/lib/profile/resume";
import { Button, Callout, Card, FieldError, Helper, Input, Label, Textarea, cx } from "./ui/primitives";
import { api } from "./use-live";

interface Initial {
  facts: ResumeFacts | null;
  resumeFilename: string | null;
  githubUrl: string;
  linkedinUrl: string;
  portfolioUrl: string;
  preferences: string;
  hasMasterTex: boolean;
  confirmed: boolean;
}

const STEPS = ["Resume", "Links", "Master file", "Confirm"] as const;

export function ProfileSetup({ initial, next }: { initial: Initial | null; next: string }) {
  const router = useRouter();
  const [step, setStep] = useState(initial?.facts ? 3 : 0);
  const [facts, setFacts] = useState<ResumeFacts | null>(initial?.facts ?? null);
  const [filename, setFilename] = useState(initial?.resumeFilename ?? null);
  const [links, setLinks] = useState({
    githubUrl: initial?.githubUrl ?? "",
    linkedinUrl: initial?.linkedinUrl ?? "",
    portfolioUrl: initial?.portfolioUrl ?? "",
    preferences: initial?.preferences ?? "",
  });
  const [hasMasterTex, setHasMasterTex] = useState(initial?.hasMasterTex ?? false);

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <h1 className="text-[32px] leading-10 font-semibold tracking-[-0.01em] text-ink">{initial?.confirmed ? "Your profile" : "Set up your profile"}</h1>
        <p className="mt-1 text-[16px] text-ink-2">Every verdict and every draft is based on this, and nothing outside it is ever claimed for you.</p>
      </div>

      <ol className="flex flex-wrap items-center gap-2" aria-label="Steps">
        {STEPS.map((label, i) => {
          const reachable = i === 0 || Boolean(facts);
          return (
            <li key={label} className="flex items-center gap-2">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => setStep(i)}
                aria-current={step === i ? "step" : undefined}
                className={cx(
                  "flex h-8 items-center gap-2 rounded-full border pr-3 pl-1 text-[13px] font-medium disabled:cursor-not-allowed",
                  step === i ? "border-accent bg-accent-subtle text-accent" : "border-line bg-base text-ink-2",
                )}
              >
                <span className={cx("flex size-6 items-center justify-center rounded-full text-[12px]", step === i ? "bg-accent text-white" : "bg-sunken text-ink-2")}>
                  {i + 1}
                </span>
                {label}
              </button>
              {i < STEPS.length - 1 && <span className="h-px w-4 bg-line-strong" aria-hidden />}
            </li>
          );
        })}
      </ol>

      {step === 0 && (
        <ResumeStep
          filename={filename}
          onParsed={(f, name, usedAsMasterTex) => {
            setFacts(f);
            setFilename(name);
            if (usedAsMasterTex) setHasMasterTex(true);
            setStep(1);
          }}
          onSkip={facts ? () => setStep(1) : undefined}
        />
      )}
      {step === 1 && <LinksStep value={links} onChange={setLinks} onBack={() => setStep(0)} onNext={() => setStep(2)} />}
      {step === 2 && <MasterStep hasMasterTex={hasMasterTex} onUploaded={() => setHasMasterTex(true)} onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && facts && (
        <ConfirmStep
          facts={facts}
          onChange={setFacts}
          links={links}
          onBack={() => setStep(2)}
          onConfirmed={() => {
            router.push(next);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function ResumeStep({ filename, onParsed, onSkip }: { filename: string | null; onParsed: (f: ResumeFacts, name: string, tex: boolean) => void; onSkip?: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(file.name);
    setError(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await fetch("/api/profile/resume", { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Upload failed.");
      onParsed(data.facts, data.filename, data.usedAsMasterTex);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="space-y-4 bg-base">
      <div>
        <h2 className="text-[20px] leading-7 font-semibold text-ink">Upload your resume</h2>
        <p className="mt-1 text-[14px] text-ink-2">PDF, DOCX, TXT or your LaTeX .tex source. A .tex file also becomes the master file for tailored resumes.</p>
      </div>
      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onClick={() => !busy && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) void upload(file);
        }}
        className={cx(
          "flex min-h-48 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-6 text-center",
          dragging ? "border-accent bg-accent-subtle" : error ? "border-skip-line bg-skip-bg" : "border-line-strong bg-surface hover:border-accent-line",
        )}
      >
        <FileUp className={cx("size-7", dragging ? "text-accent" : "text-muted")} aria-hidden />
        {busy ? (
          <>
            <p className="text-[15px] font-medium text-ink">Reading {busy}</p>
            <p className="text-[13px] text-ink-2">Extracting your experience and projects. This takes up to a minute.</p>
          </>
        ) : (
          <>
            <p className="text-[15px] font-medium text-ink">Drop your resume here, or click to choose</p>
            {filename && <p className="text-[13px] text-ink-2">Current: {filename}</p>}
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.docx,.txt,.tex,.md"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
            e.target.value = "";
          }}
        />
      </div>
      <FieldError>{error}</FieldError>
      {onSkip && (
        <div className="flex justify-end">
          <Button variant="ghost" onClick={onSkip}>
            Keep current resume
          </Button>
        </div>
      )}
    </Card>
  );
}

type Links = { githubUrl: string; linkedinUrl: string; portfolioUrl: string; preferences: string };

function validUrl(v: string) {
  return !v.trim() || /^https?:\/\/\S+\.\S+/.test(v.trim());
}

function LinksStep({ value, onChange, onBack, onNext }: { value: Links; onChange: (v: Links) => void; onBack: () => void; onNext: () => void }) {
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const field = (key: keyof Omit<Links, "preferences">, label: string, placeholder: string) => (
    <div>
      <Label htmlFor={key} hint="optional">
        {label}
      </Label>
      <Input
        id={key}
        value={value[key]}
        placeholder={placeholder}
        onChange={(e) => onChange({ ...value, [key]: e.target.value })}
        onBlur={() => setTouched((t) => ({ ...t, [key]: true }))}
        invalid={touched[key] && !validUrl(value[key])}
      />
      {touched[key] && !validUrl(value[key]) && <FieldError>Use the full link, starting with https://</FieldError>}
    </div>
  );
  const ok = validUrl(value.githubUrl) && validUrl(value.linkedinUrl) && validUrl(value.portfolioUrl);
  return (
    <Card className="space-y-5 bg-base">
      <div>
        <h2 className="text-[20px] leading-7 font-semibold text-ink">Links and what you are looking for</h2>
        <p className="mt-1 text-[14px] text-ink-2">Links are used in outreach. Your notes are how verdicts judge location and role type.</p>
      </div>
      {field("githubUrl", "GitHub", "https://github.com/you")}
      {field("linkedinUrl", "LinkedIn", "https://www.linkedin.com/in/you")}
      {field("portfolioUrl", "Portfolio", "https://you.dev")}
      <div>
        <Label htmlFor="preferences" hint="optional">
          What you are looking for
        </Label>
        <Textarea
          id="preferences"
          value={value.preferences}
          onChange={(e) => onChange({ ...value, preferences: e.target.value })}
          placeholder="Based in Nashik. Open to relocating to Pune or Bengaluru, or remote. Looking for full-stack or AI engineering roles."
          className="min-h-28"
          maxLength={2000}
        />
        <Helper>Where you can work, whether you will relocate, and the kind of roles you want.</Helper>
      </div>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext} disabled={!ok}>
          Continue
        </Button>
      </div>
    </Card>
  );
}

function MasterStep({ hasMasterTex, onUploaded, onBack, onNext }: { hasMasterTex: boolean; onUploaded: () => void; onBack: () => void; onNext: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <Card className="space-y-5 bg-base">
      <div>
        <h2 className="text-[20px] leading-7 font-semibold text-ink">Master resume file</h2>
        <p className="mt-1 text-[14px] text-ink-2">
          Tailored resumes start from your own LaTeX file: blocks are chosen and reworded for each job, and nothing is added that is not already in it. Keep
          every project and bullet you might use in this file, even ones you usually leave out.
        </p>
      </div>
      {hasMasterTex ? (
        <Callout tone="apply" icon={<Check className="size-4" />} title="Master file saved">
          Upload again to replace it.
        </Callout>
      ) : (
        <Callout tone="neutral">No master file yet. You can skip this and add it later; verdicts, answers and outreach work without it.</Callout>
      )}
      <label className="block">
        <span className="sr-only">Upload .tex file</span>
        <input
          type="file"
          accept=".tex"
          disabled={busy}
          className="block w-full text-[14px] text-ink-2 file:mr-3 file:h-10 file:rounded-md file:border file:border-line-strong file:bg-base file:px-4 file:text-[14px] file:font-medium file:text-ink hover:file:bg-surface"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            setBusy(true);
            setError(null);
            try {
              await api("/api/profile", { method: "PUT", json: { masterTex: await file.text() } });
              onUploaded();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Upload failed.");
            } finally {
              setBusy(false);
              e.target.value = "";
            }
          }}
        />
      </label>
      <FieldError>{error}</FieldError>
      <div className="flex justify-between">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button onClick={onNext}>{hasMasterTex ? "Continue" : "Skip for now"}</Button>
      </div>
    </Card>
  );
}

function ConfirmStep({
  facts,
  onChange,
  links,
  onBack,
  onConfirmed,
}: {
  facts: ResumeFacts;
  onChange: (f: ResumeFacts) => void;
  links: Links;
  onBack: () => void;
  onConfirmed: () => void;
}) {
  const [skill, setSkill] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof ResumeFacts>(key: K, v: ResumeFacts[K]) => onChange({ ...facts, [key]: v });

  return (
    <Card className="space-y-6 bg-base">
      <div>
        <h2 className="text-[20px] leading-7 font-semibold text-ink">Check what we understood</h2>
        <p className="mt-1 text-[14px] text-ink-2">A wrong fact here skews every verdict after it. Fix anything that is off before confirming.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="f-name">Name</Label>
          <Input id="f-name" value={facts.name ?? ""} onChange={(e) => set("name", e.target.value || null)} />
        </div>
        <div>
          <Label htmlFor="f-headline">Headline</Label>
          <Input id="f-headline" value={facts.headline ?? ""} onChange={(e) => set("headline", e.target.value || null)} placeholder="Full-stack developer" />
        </div>
        <div>
          <Label htmlFor="f-location">Based in</Label>
          <Input id="f-location" value={facts.location ?? ""} onChange={(e) => set("location", e.target.value || null)} />
        </div>
        <div>
          <Label htmlFor="f-years" hint="professional software work">
            Years of experience
          </Label>
          <Input
            id="f-years"
            inputMode="decimal"
            value={String(facts.yearsOfExperience)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 50) set("yearsOfExperience", n);
            }}
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-[14px] text-ink">
        <input type="checkbox" checked={facts.isCurrentStudent} onChange={(e) => set("isCurrentStudent", e.target.checked)} className="size-4 accent-[var(--color-accent)]" />
        I am currently enrolled in a degree
      </label>

      <div>
        <Label htmlFor="f-skill">Skills</Label>
        <div className="flex flex-wrap gap-2">
          {facts.skills.map((s) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full border border-line bg-sunken py-1 pr-1.5 pl-3 text-[14px] text-ink-2">
              {s}
              <button type="button" aria-label={`Remove ${s}`} className="rounded-full p-0.5 hover:bg-line hover:text-ink" onClick={() => set("skills", facts.skills.filter((x) => x !== s))}>
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input
            id="f-skill"
            value={skill}
            onChange={(e) => setSkill(e.target.value)}
            placeholder="Add a skill you have used in real work"
            onKeyDown={(e) => {
              if (e.key === "Enter" && skill.trim()) {
                e.preventDefault();
                if (!facts.skills.includes(skill.trim())) set("skills", [...facts.skills, skill.trim()]);
                setSkill("");
              }
            }}
          />
          <Button
            variant="secondary"
            icon={<Plus className="size-4" />}
            onClick={() => {
              if (skill.trim() && !facts.skills.includes(skill.trim())) set("skills", [...facts.skills, skill.trim()]);
              setSkill("");
            }}
          >
            Add
          </Button>
        </div>
      </div>

      <EntryList
        title="Experience"
        items={facts.experience.map((e) => ({ heading: `${e.title} at ${e.company}`, sub: e.duration ?? "", body: e.summary }))}
        onBodyChange={(i, body) => set("experience", facts.experience.map((e, j) => (j === i ? { ...e, summary: body } : e)))}
        onRemove={(i) => set("experience", facts.experience.filter((_, j) => j !== i))}
      />
      <EntryList
        title="Projects"
        items={facts.projects.map((p) => ({ heading: p.name, sub: p.technologies.join(", "), body: p.description }))}
        onBodyChange={(i, body) => set("projects", facts.projects.map((p, j) => (j === i ? { ...p, description: body } : p)))}
        onRemove={(i) => set("projects", facts.projects.filter((_, j) => j !== i))}
      />

      <FieldError>{error}</FieldError>
      <div className="flex justify-between border-t border-line pt-5">
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
        <Button
          loading={busy}
          icon={<Check className="size-4" />}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await api("/api/profile", {
                method: "PUT",
                json: {
                  facts,
                  githubUrl: links.githubUrl,
                  linkedinUrl: links.linkedinUrl,
                  portfolioUrl: links.portfolioUrl,
                  preferences: links.preferences,
                  confirm: true,
                },
              });
              onConfirmed();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Could not save.");
              setBusy(false);
            }
          }}
        >
          This is right
        </Button>
      </div>
    </Card>
  );
}

function EntryList({
  title,
  items,
  onBodyChange,
  onRemove,
}: {
  title: string;
  items: Array<{ heading: string; sub: string; body: string }>;
  onBodyChange: (i: number, body: string) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div>
      <p className="mb-2 text-[14px] font-medium text-ink">{title}</p>
      {items.length === 0 ? (
        <p className="text-[14px] text-muted">None found in the resume.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item, i) => (
            <li key={`${item.heading}-${i}`} className="rounded-md border border-line bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-ink">{item.heading}</p>
                  {item.sub && <p className="text-[13px] text-muted">{item.sub}</p>}
                </div>
                <button type="button" aria-label={`Remove ${item.heading}`} className="text-muted hover:text-skip" onClick={() => onRemove(i)}>
                  <Trash2 className="size-4" />
                </button>
              </div>
              <Textarea value={item.body} onChange={(e) => onBodyChange(i, e.target.value)} className="mt-3 min-h-20 bg-base" aria-label={`${item.heading} description`} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
