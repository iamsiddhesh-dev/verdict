// Stage 3: the tailored resume.
//
//   1. Select and order the entries and bullets that matter for this job, and
//      rephrase bullets into the posting's vocabulary. One model call.
//   2. Check every rewritten bullet against the resume itself. Anything that adds
//      a tool, a number or a claim goes back as a correction; after three tries a
//      bullet that still fails keeps the person's original wording.
//   3. Compile, count pages, and trim the least relevant bullets until it fits on
//      one page. No model call per attempt: the model already ranked everything,
//      so trimming is deterministic and free.

import { z } from "zod";
import { generateStructured, type WaitNotice } from "@/lib/llm";
import type { ReadJob } from "@/lib/pipeline/read";
import type { ScoreResult } from "@/lib/pipeline/score";
import type { Profile, ResumeFacts } from "@/lib/profile";
import { checkText, inventedTerms, stripDashes, type HonestySource, type Issue } from "@/lib/writing/honesty";
import { compileTex } from "./compile";
import {
  isJakeTemplate,
  parseResumeTex,
  renderResumeTex,
  resumePlainText,
  type EntryChoice,
  type ParsedResume,
  type Selection,
  type TexEntry,
} from "./latex";
import { masterTexFromFacts } from "./template";

export type BulletStatus = "kept" | "rewritten" | "reverted" | "dropped" | "trimmed";

export interface ResumeDiffEntry {
  id: string;
  section: string;
  title: string;
  subtitle: string;
  included: boolean;
  /** Final bullets in order, then the ones left out. */
  bullets: Array<{ id: string; before: string; after: string | null; status: BulletStatus }>;
}

export interface ResumeContent {
  tex: string;
  pdfBase64: string | null;
  pages: number | null;
  compile: { ok: boolean; compiler: string | null; message: string | null; log: string | null; attempts: number };
  source: "master" | "facts";
  focus: string;
  keywords: string[];
  entries: ResumeDiffEntry[];
  skills: Array<{ label: string; kept: string[]; removed: string[] }>;
  notes: string[];
  filename: string;
  model: string;
}

const MAX_COMPILES = 6;
const MAX_WRITE_ATTEMPTS = 3;

const tailorSchema = z.object({
  entries: z
    .array(
      z.object({
        id: z.string().describe("An entry id from the resume, e.g. s2e0"),
        bullets: z
          .array(
            z.object({
              id: z.string().describe("The bullet id this text comes from, e.g. s2e0b1"),
              text: z.string().describe("The bullet, unchanged or rephrased. Plain text, no LaTeX."),
              postingTerm: z
                .string()
                .nullable()
                .describe("If you rephrased: the exact term from the posting that the new wording brings in. null if the text is unchanged."),
            }),
          )
          .describe("Bullets to keep for this entry, most relevant first"),
      }),
    )
    .describe("Entries to include, in the order they should appear within their section. Leave an entry out to drop it."),
  skills: z
    .array(z.object({ label: z.string(), items: z.array(z.string()).describe("Items copied exactly from that skills line, most relevant first") }))
    .describe("Every skills line, with the items to keep"),
  focus: z.string().describe("One plain sentence on what this version puts first for this role"),
  keywords: z.array(z.string()).describe("Terms from the posting that the resume covers, each one present in the resume"),
});

type TailorOutput = z.infer<typeof tailorSchema>;

// --- Prompt -----------------------------------------------------------------------

function resumeBlock(parsed: ParsedResume): string {
  const out: string[] = [];
  parsed.sections.forEach((s) => {
    if (!s.editable) return;
    if (s.kind === "experience" || s.kind === "projects") {
      out.push(`SECTION ${s.name} (${s.kind})`);
      for (const e of s.entries) {
        out.push(`  ENTRY ${e.id}: ${e.title}${e.subtitle ? ` | ${e.subtitle}` : ""}`);
        for (const b of e.bullets) out.push(`    ${b.id}: ${b.text}`);
      }
    } else if (s.kind === "skills") {
      out.push(`SECTION ${s.name} (skills)`);
      for (const l of s.skills) out.push(`  ${l.label}: ${l.items.map((i) => i.text).join(", ")}`);
    }
  });
  return out.join("\n");
}

function tailorPrompt(parsed: ParsedResume, read: ReadJob, score: ScoreResult, jobText: string, bulletBudget: number, corrections: string[]): string {
  const must = read.mustHave.map((m) => m.requirement).join("; ") || "none stated";
  const missing = score.gaps.map((g) => g.text).join("; ");
  return `Tailor this resume for one job. You choose what to include and in what order, and you may rephrase bullets into the posting's vocabulary. You may not add anything that is not already in the resume.

JOB
Title: ${read.title ?? "unknown"}
Company: ${read.company ?? "unknown"}
What the role is: ${read.summary}
Stack: ${read.stack.join(", ") || "not stated"}
Must have: ${must}
Nice to have: ${read.niceToHave.join("; ") || "none stated"}
Posting (start):
"""
${jobText.slice(0, 2_500)}
"""

FIT
Lead with: ${score.leadWith.name || "the most relevant entry"}
Overlap: ${score.rationale}
${missing ? `Not in the resume (never add these, never hint at them): ${missing}` : ""}

RESUME (ids in front of every entry and bullet)
${resumeBlock(parsed)}

WHAT TO DO
- entries: list the entries to include, most relevant to this job first within each section. Keep experience entries unless one is unrelated to software work. Include the projects that best show what this role does; leave out ones that add nothing for it.
- bullets: for each included entry, the bullets to keep, most relevant first. Drop bullets that do not help for this role. Aim for about ${bulletBudget} bullets in total across the whole resume, and at least one per included entry.
- Rephrasing is the exception, not the default. Return a bullet's text unchanged unless the posting uses a different term for something the bullet already describes, for example the posting says "REST API" and the bullet describes building one. Then swap that term in, change as little else as possible, and put the posting's term in postingTerm.
- A rephrase must keep every detail, number and tool of the original. Do not shorten by removing details. Do not change what happened: found is not fixed, built is not maintained, exposed is not resolved.
- Never add a tool, language, framework, metric, number, team size, user count, outcome or general claim (such as "high reliability" or "scalable") that the bullet does not already contain. Never merge facts from two different entries into one bullet.
- skills: every skills line, with the items worth keeping for this role, most relevant first, copied exactly. Keep at least one item per line. Never add an item.
- Style: resume bullets, no "I", no dashes as punctuation, no hype words (passionate, cutting-edge, leveraged, spearheaded, seamless), no comparisons with anyone else.${
    corrections.length ? `\n\nFIX THESE PROBLEMS FROM YOUR PREVIOUS ATTEMPT (the ids name the bullet):\n- ${corrections.join("\n- ")}` : ""
  }`;
}

// --- Checks -----------------------------------------------------------------------

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9+#.]+/g, " ").trim();
}

/** Issues a rewrite introduces. A rule the original bullet already breaks is the author's choice, not ours to fix. */
function newIssues(before: string, after: string, source: HonestySource): Issue[] {
  const maxChars = Math.max(Math.round(before.length * 1.15), 140);
  const beforeRules = new Set(checkText(before, source).map((i) => i.rule));
  const issues = checkText(after, source, { maxChars }).filter((i) => !beforeRules.has(i.rule) || i.rule === "invented_term" || i.rule === "invented_number");

  // The reverse direction: a rephrase that loses a number or a named tool has
  // thrown away the proof the bullet existed to carry.
  const lostNumbers = [...before.replace(/,(?=\d{3})/g, "").matchAll(/\d+(?:\.\d+)?/g)]
    .map((m) => m[0])
    .filter((n) => !after.replace(/,(?=\d{3})/g, "").includes(n));
  // Terms named in the original that the rephrase no longer contains.
  const lostTerms = inventedTerms(before, { profileText: after, jobText: "" });
  if (lostNumbers.length || lostTerms.length) {
    issues.push({
      rule: "lost_detail",
      message: `the rephrase dropped ${[...lostNumbers, ...lostTerms].join(", ")} from the original. Keep every number and tool the original bullet names.`,
    });
  }
  return issues;
}

const STOPWORDS = new Set("the and for with from into that this then than your our their its was were are has had have not but all any via per each one two using used use across over under onto so as at by of on in to a an".split(" "));

function words(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((w) => w.length > 2 && !STOPWORDS.has(w)));
}

/**
 * A rephrase has to earn its place by bringing in the posting's vocabulary. One
 * that only shortens or polishes is where facts get lost and vague claims creep
 * in, so it is discarded in favour of the person's own words.
 */
function rephraseEarnsItsPlace(before: string, after: string, postingTerm: string | null, jobText: string): boolean {
  if (!postingTerm?.trim()) return false;
  const term = norm(postingTerm);
  const job = norm(jobText);
  if (!term || !job.includes(term) || !norm(after).includes(term)) return false;
  // The term must be new to the bullet, otherwise nothing was gained.
  if (norm(before).includes(term)) return false;
  const added = [...words(after)].filter((w) => !words(before).has(w));
  return added.some((w) => term.includes(w));
}

// --- Selection --------------------------------------------------------------------

interface Plan {
  selection: Selection;
  rewrites: Map<string, string>;
  modelDropped: Set<string>;
}

function entryIndex(parsed: ParsedResume) {
  const entries = new Map<string, { sectionIndex: number; entry: TexEntry }>();
  const bullets = new Map<string, { entryId: string; text: string }>();
  parsed.sections.forEach((s, sectionIndex) => {
    for (const entry of s.entries) {
      entries.set(entry.id, { sectionIndex, entry });
      for (const b of entry.bullets) bullets.set(b.id, { entryId: entry.id, text: b.text });
    }
  });
  return { entries, bullets };
}

function planFromOutput(parsed: ParsedResume, out: TailorOutput, jobText: string): Plan {
  const { entries, bullets } = entryIndex(parsed);
  const selection: Selection = { entries: new Map(), skills: new Map() };
  const rewrites = new Map<string, string>();
  const usedEntries = new Set<string>();
  const usedBullets = new Set<string>();

  for (const choice of out.entries) {
    const found = entries.get(choice.id);
    if (!found || usedEntries.has(choice.id)) continue;
    usedEntries.add(choice.id);
    const picked: EntryChoice["bullets"] = [];
    for (const b of choice.bullets) {
      const original = bullets.get(b.id);
      // A bullet can only stay under its own entry: moving text between entries is how facts get merged.
      if (!original || original.entryId !== choice.id || usedBullets.has(b.id)) continue;
      usedBullets.add(b.id);
      const text = stripDashes(b.text.trim());
      const keep = !text || norm(text) === norm(original.text) || !rephraseEarnsItsPlace(original.text, text, b.postingTerm, jobText);
      if (!keep) rewrites.set(b.id, text);
      picked.push({ id: b.id, text: keep ? null : text });
    }
    if (!picked.length && found.entry.bullets[0]) {
      picked.push({ id: found.entry.bullets[0].id, text: null });
      usedBullets.add(found.entry.bullets[0].id);
    }
    const list = selection.entries.get(found.sectionIndex) ?? [];
    list.push({ id: choice.id, bullets: picked });
    selection.entries.set(found.sectionIndex, list);
  }

  // Every editable entry section keeps at least one entry, so a job history is
  // never silently deleted by a model that got carried away.
  parsed.sections.forEach((s, i) => {
    if (!s.editable || !s.entries.length) return;
    if (!selection.entries.get(i)?.length) {
      const first = s.entries[0];
      selection.entries.set(i, [{ id: first.id, bullets: first.bullets.slice(0, 2).map((b) => ({ id: b.id, text: null })) }]);
      first.bullets.slice(0, 2).forEach((b) => usedBullets.add(b.id));
    }
  });

  const modelDropped = new Set([...bullets.keys()].filter((id) => !usedBullets.has(id)));

  parsed.sections.forEach((s, i) => {
    if (!s.editable || s.kind !== "skills") return;
    const kept = new Map<string, string[]>();
    for (const line of s.skills) {
      const answer = out.skills.find((l) => norm(l.label) === norm(line.label));
      const byText = new Map(line.items.map((item) => [norm(item.text), item.tex]));
      const chosen = (answer?.items ?? [])
        .map((t) => byText.get(norm(t)))
        .filter((t): t is string => Boolean(t));
      kept.set(line.label, [...new Set(chosen)].length ? [...new Set(chosen)] : line.items.map((x) => x.tex));
    }
    selection.skills.set(i, kept);
  });

  return { selection, rewrites, modelDropped };
}

function skillsReport(parsed: ParsedResume, out: TailorOutput, selection: Selection) {
  const report: ResumeContent["skills"] = [];
  const rejected: string[] = [];
  parsed.sections.forEach((s, i) => {
    if (!s.editable || s.kind !== "skills") return;
    const kept = selection.skills.get(i);
    for (const line of s.skills) {
      const keptTex = new Set(kept?.get(line.label) ?? []);
      report.push({
        label: line.label,
        kept: line.items.filter((x) => keptTex.has(x.tex)).map((x) => x.text),
        removed: line.items.filter((x) => !keptTex.has(x.tex)).map((x) => x.text),
      });
      const known = new Set(line.items.map((x) => norm(x.text)));
      const answer = out.skills.find((l) => norm(l.label) === norm(line.label));
      for (const item of answer?.items ?? []) if (!known.has(norm(item))) rejected.push(item);
    }
  });
  return { report, rejected: [...new Set(rejected)] };
}

// --- One-page fit -------------------------------------------------------------------

/** Remove the `count` least relevant bullets: last bullets of the last entries, projects before experience. */
function trim(parsed: ParsedResume, selection: Selection, count: number): string[] {
  const removed: string[] = [];
  const order = [...selection.entries.keys()].sort((a, b) => {
    const rank = (i: number) => (parsed.sections[i].kind === "projects" ? 0 : 1);
    return rank(a) - rank(b);
  });
  for (let n = 0; n < count; n++) {
    let done = false;
    for (const sectionIndex of order) {
      const list = selection.entries.get(sectionIndex)!;
      for (let e = list.length - 1; e >= 0 && !done; e--) {
        if (list[e].bullets.length > 1) {
          removed.push(list[e].bullets.pop()!.id);
          done = true;
        }
      }
      if (done) break;
    }
    if (done) continue;
    // Every entry is down to one bullet: drop the last project entry, if more than one is left.
    for (const sectionIndex of order) {
      const list = selection.entries.get(sectionIndex)!;
      if (parsed.sections[sectionIndex].kind === "projects" && list.length > 1) {
        const gone = list.pop()!;
        removed.push(...gone.bullets.map((b) => b.id), gone.id);
        done = true;
        break;
      }
    }
    if (!done) break;
  }
  return removed;
}

// --- Orchestration ----------------------------------------------------------------

function fileName(facts: ResumeFacts, read: ReadJob): string {
  const part = (s: string | null | undefined) => (s ?? "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return [part(facts.name) || "Resume", part(read.company)].filter(Boolean).join("-");
}

export async function tailorResume(params: {
  profile: Profile & { facts: ResumeFacts };
  read: ReadJob;
  score: ScoreResult;
  jobText: string;
  onProgress?: (detail: string) => void;
  onWait?: (n: WaitNotice) => void;
}): Promise<ResumeContent> {
  const { profile, read, score, jobText } = params;
  const progress = params.onProgress ?? (() => {});
  const notes: string[] = [];

  let source: ResumeContent["source"] = "master";
  let masterTex = profile.masterTex?.trim() ? profile.masterTex : null;
  if (masterTex && !isJakeTemplate(masterTex)) {
    notes.push("Your .tex uses a layout this tool cannot edit safely, so this version uses a standard one-page template built from your resume. Your own file was not changed.");
    masterTex = null;
  }
  if (!masterTex) {
    source = "facts";
    masterTex = masterTexFromFacts(profile.facts, [profile.githubUrl, profile.portfolioUrl, profile.linkedinUrl]);
  }

  let parsed = parseResumeTex(masterTex);
  if (!parsed.sections.some((s) => s.editable && s.entries.length)) {
    if (source === "master") notes.push("Could not find editable Experience or Projects sections in your .tex, so this version is built from your parsed resume instead.");
    source = "facts";
    parsed = parseResumeTex(masterTexFromFacts(profile.facts, [profile.githubUrl, profile.portfolioUrl, profile.linkedinUrl]));
  }

  const resumeText = resumePlainText(parsed);
  const honesty: HonestySource = { profileText: `${resumeText}\n${profile.resumeText ?? ""}`, jobText: "" };
  const { bullets: bulletIndex, entries: entryById } = entryIndex(parsed);
  const bulletBudget = Math.min(bulletIndex.size, 16);

  // 1 + 2: write, check, correct.
  progress("Choosing and rephrasing bullets for this role.");
  let corrections: string[] = [];
  let output: TailorOutput | null = null;
  let plan: Plan | null = null;
  let failing = new Map<string, Issue[]>();
  let model = "";

  for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
    const result = await generateStructured({
      task: "tailor",
      schema: tailorSchema,
      reasoning: "low",
      prompt: tailorPrompt(parsed, read, score, jobText, bulletBudget, corrections),
      onWait: params.onWait,
      maxWaitMs: 240_000,
    });
    model = `${result.provider}/${result.model}`;
    output = result.object;
    plan = planFromOutput(parsed, output, jobText);
    failing = new Map();
    for (const [id, text] of plan.rewrites) {
      const issues = newIssues(bulletIndex.get(id)!.text, text, honesty);
      if (issues.length) failing.set(id, issues);
    }
    if (!failing.size) break;
    corrections = [...failing].flatMap(([id, issues]) => issues.map((i) => `${id}: ${i.message}`));
    if (attempt < MAX_WRITE_ATTEMPTS) progress(`Correcting ${failing.size} bullet${failing.size === 1 ? "" : "s"} that added something not in your resume (attempt ${attempt + 1} of ${MAX_WRITE_ATTEMPTS}).`);
  }

  // Bullets that still fail keep the person's own words.
  for (const [id, issues] of failing) {
    plan!.rewrites.delete(id);
    for (const list of plan!.selection.entries.values()) for (const e of list) for (const b of e.bullets) if (b.id === id) b.text = null;
    const entry = entryById.get(bulletIndex.get(id)!.entryId)!.entry;
    const invented = issues.find((i) => i.rule === "invented_term" || i.rule === "invented_number");
    notes.push(
      invented
        ? `Kept your original wording for a bullet under ${entry.title}: the rewrite added something that is not in your resume.`
        : `Kept your original wording for a bullet under ${entry.title}.`,
    );
  }

  const { report: skills, rejected } = skillsReport(parsed, output!, plan!.selection);
  if (rejected.length) notes.push(`Left out ${rejected.join(", ")} from your skills: ${rejected.length === 1 ? "it is" : "they are"} not in your resume.`);

  // 3: compile and fit.
  const trimmed = new Set<string>();
  let tex = "";
  let compileState: ResumeContent["compile"] = { ok: false, compiler: null, message: null, log: null, attempts: 0 };
  let pdf: Buffer | null = null;
  let pages: number | null = null;

  for (let attempt = 1; attempt <= MAX_COMPILES; attempt++) {
    tex = renderResumeTex(parsed, plan!.selection);
    progress(attempt === 1 ? "Compiling the PDF." : `Fitting to one page, attempt ${attempt} of ${MAX_COMPILES}.`);
    let result = await compileTex(tex);

    // A compile error on the first pass could come from a rewrite. Retry with the
    // original wording before reporting a problem with the template itself.
    if (!result.ok && result.reason === "error" && attempt === 1 && plan!.rewrites.size) {
      const originalsOnly: Selection = {
        entries: new Map([...plan!.selection.entries].map(([k, list]) => [k, list.map((e) => ({ id: e.id, bullets: e.bullets.map((b) => ({ id: b.id, text: null })) }))])),
        skills: plan!.selection.skills,
      };
      const retry = await compileTex(renderResumeTex(parsed, originalsOnly));
      if (retry.ok) {
        plan!.selection = originalsOnly;
        plan!.rewrites.clear();
        notes.push("A rephrased bullet stopped the PDF from compiling, so this version uses your original wording throughout.");
        tex = renderResumeTex(parsed, originalsOnly);
        result = retry;
      }
    }

    compileState = {
      ok: result.ok,
      compiler: result.ok ? result.compiler : null,
      message: result.ok ? null : result.message,
      log: !result.ok && result.log ? result.log : null,
      attempts: attempt,
    };
    if (!result.ok) break;
    pdf = result.pdf;
    pages = result.pages;
    if (result.pages <= 1) break;

    const removed = trim(parsed, plan!.selection, result.pages >= 3 ? 4 : 2);
    if (!removed.length) {
      notes.push("It still runs past one page with every entry at one bullet. Shorten a section in your master file to fit.");
      break;
    }
    removed.forEach((id) => trimmed.add(id));
  }

  // Diff for the review screen.
  const finalBullets = new Map<string, string | null>();
  const includedEntries = new Set<string>();
  const entryOrder: string[] = [];
  for (const list of plan!.selection.entries.values()) {
    for (const e of list) {
      includedEntries.add(e.id);
      entryOrder.push(e.id);
      for (const b of e.bullets) finalBullets.set(b.id, b.text);
    }
  }
  const entries: ResumeDiffEntry[] = [];
  parsed.sections.forEach((s) => {
    if (!s.editable || !s.entries.length) return;
    const ordered = [...s.entries].sort((a, b) => {
      const ia = entryOrder.indexOf(a.id);
      const ib = entryOrder.indexOf(b.id);
      return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
    });
    for (const entry of ordered) {
      const selected = [...plan!.selection.entries.values()].flat().find((e) => e.id === entry.id);
      const keptIds = selected?.bullets.map((b) => b.id) ?? [];
      const bullets = [
        ...keptIds.map((id) => {
          const original = entry.bullets.find((b) => b.id === id)!;
          const after = finalBullets.get(id) ?? null;
          const wasReverted = failing.has(id);
          return { id, before: original.text, after: after ?? original.text, status: (wasReverted ? "reverted" : after ? "rewritten" : "kept") as BulletStatus };
        }),
        ...entry.bullets
          .filter((b) => !keptIds.includes(b.id))
          .map((b) => ({ id: b.id, before: b.text, after: null, status: (trimmed.has(b.id) ? "trimmed" : "dropped") as BulletStatus })),
      ];
      entries.push({ id: entry.id, section: s.name, title: entry.title, subtitle: entry.subtitle, included: includedEntries.has(entry.id), bullets });
    }
  });

  const plainResume = norm(resumeText);
  const keywords = [...new Set(output!.keywords.map((k) => k.trim()).filter((k) => k && plainResume.includes(norm(k))))].slice(0, 20);

  return {
    tex,
    pdfBase64: pdf ? pdf.toString("base64") : null,
    pages,
    compile: compileState,
    source,
    focus: stripDashes(output!.focus),
    keywords,
    entries,
    skills,
    notes,
    filename: fileName(profile.facts, read),
    model,
  };
}
