// Stage 4: score the fit and decide the verdict.
//
// The model scores and explains; code decides. The verdict bands and every hard
// disqualifier are applied here, after the call, so a persuasive rationale can
// never talk its way past a missing must-have. That is the behaviour that made
// the manual process useful: most roles that were not worth applying to were
// ruled out by one missing core requirement, not by a low overall number.

import { z } from "zod";
import { generateStructured, type WaitNotice } from "@/lib/llm";
import { CACHE_TTL_MS } from "@/lib/llm/cache";
import { profileBlock, type Profile, type ResumeFacts } from "@/lib/profile";
import type { Verification } from "@/lib/verify";
import type { ReadJob } from "./read";

export type Verdict = "apply" | "borderline" | "skip";

export const APPLY_AT = 70;
export const BORDERLINE_AT = 55;

// The model does not produce the final number. It rates three things against
// fixed anchors and marks every requirement, and code combines them. A single
// free-form 0-100 from the model swung by 16 points between two runs on the same
// job and profile, which is the difference between Apply and Borderline. Anchored
// sub-ratings and a formula move far less.
const rating = (what: string, anchors: string) => z.number().min(0).max(100).describe(`${what}. Anchors: ${anchors}`);

export const scoreSchema = z.object({
  overlap: rating(
    "How closely what the candidate has actually built or done matches what this role does day to day",
    "90 = has built essentially this kind of thing; 70 = clear overlap with the main work; 50 = related but different work; 30 = little overlap; 10 = none",
  ),
  seniorityFit: rating(
    "How well the candidate's experience level matches the level the role wants",
    "100 = matches or the posting states no level; 70 = slightly below; 40 = clearly below; 10 = far below",
  ),
  locationFit: rating(
    "Whether the candidate can work where this role requires, given where they are based and their own notes",
    "100 = remote they can do, same city, or a city they said they would move to; 60 = unclear; 20 = requires a place they did not say they would move to; 0 = restricted to a country they are not in",
  ),
  requirements: z
    .array(
      z.object({
        requirement: z.string().describe("A requirement from the posting, in its wording"),
        kind: z.enum(["must", "nice"]),
        met: z.enum(["met", "partial", "missing"]),
        evidence: z.string().describe("Where the candidate's profile shows it (a project, job or skill by name). Empty string if missing."),
        core: z
          .boolean()
          .describe("true only if this is central to the job itself: the main language or framework the role works in every day, or a legal or location requirement. A single tool is not core."),
      }),
    )
    .describe("Every must-have from the posting, plus the nice-to-haves that matter"),
  leadWith: z.object({
    type: z.enum(["experience", "project"]),
    name: z.string().describe("The exact name of the job (title at company) or project from the profile"),
    why: z.string().describe("One sentence naming the concrete overlap with this role"),
  }),
  alsoMention: z.string().nullable().describe("The exact name of one more project worth citing, or null"),
  rationale: z
    .string()
    .describe(
      "Two plain sentences addressed to the candidate as 'you'. Name the specific overlap, and the main thing missing if anything. Do not name a verdict, band or score. No praise, no filler.",
    ),
  moveToApply: z
    .string()
    .nullable()
    .describe("If the fit is partial: the one concrete thing that would make it a clear fit. null otherwise."),
});

export type ScoreOutput = z.infer<typeof scoreSchema>;

export interface Blocker {
  kind: "years" | "enrollment" | "must_have" | "location" | "hard_stop" | "not_a_job";
  message: string;
}

export const WEIGHTS = { overlap: 0.5, mustCoverage: 0.3, seniority: 0.1, location: 0.1 } as const;

/** Share of must-haves met, counting partial as half. Falls back to overlap when the posting states none. */
export function mustCoverage(requirements: ScoreOutput["requirements"], fallback: number): number {
  const musts = requirements.filter((r) => r.kind === "must");
  if (!musts.length) return fallback;
  const points = musts.reduce((s, r) => s + (r.met === "met" ? 1 : r.met === "partial" ? 0.5 : 0), 0);
  return Math.round((points / musts.length) * 100);
}

export function combineScore(o: Pick<ScoreOutput, "overlap" | "seniorityFit" | "locationFit" | "requirements">): number {
  const coverage = mustCoverage(o.requirements, o.overlap);
  return Math.round(
    WEIGHTS.overlap * o.overlap + WEIGHTS.mustCoverage * coverage + WEIGHTS.seniority * o.seniorityFit + WEIGHTS.location * o.locationFit,
  );
}

export interface ScoreResult extends ScoreOutput {
  score: number;
  mustCoverage: number;
  verdict: Verdict;
  blockers: Blocker[];
  gaps: Array<{ text: string; blocking: boolean }>;
  scoredBy: string;
}

function jobBlock(read: ReadJob): string {
  const must = read.mustHave.map((m) => `  - ${m.requirement} (${m.category})`).join("\n") || "  (none stated)";
  const nice = read.niceToHave.map((n) => `  - ${n}`).join("\n") || "  (none stated)";
  return [
    `Title: ${read.title ?? "unknown"}`,
    `Company: ${read.company ?? "unknown"}`,
    `Location: ${read.location ?? "not stated"} | Work mode: ${read.workMode} | Type: ${read.employmentType}`,
    `Seniority: ${read.seniority ?? "not stated"}${read.yearsRequired !== null ? ` | Years required: ${read.yearsRequired}+` : ""}`,
    `Stack: ${read.stack.join(", ") || "not stated"}`,
    `What the role is: ${read.summary}`,
    `Must have:\n${must}`,
    `Nice to have:\n${nice}`,
  ].join("\n");
}

function scorePrompt(profileText: string, read: ReadJob, jobText: string): string {
  return `You are judging whether ONE candidate should spend time applying to ONE job. The candidate wants an honest answer: saying a role is not a fit is as useful as saying it is.

CANDIDATE
${profileText}

JOB (structured)
${jobBlock(read)}

JOB (original text, for anything the structure missed)
"""
${jobText.slice(0, 6_000)}
"""

HOW TO RATE
- overlap is the main signal: does what the candidate has actually built or done line up with what this role does every day? Topical similarity is not overlap. Use the anchors.
- Check every must-have against the profile. A skill counts as met only if the profile shows it in a project, job or skill list. Do not assume adjacent skills: React is not React Native, Node.js is not Express, Python is not Django. Mark those "partial" with the evidence, or "missing". Soft requirements (ownership, quality, communication) count as met when the profile's work shows them.
- core marks a requirement the job cannot be done without: the main language or framework used every day, or a legal or location condition. Nice-to-haves and single tools are never core.
- seniorityFit: the posting ${read.yearsRequired !== null ? `asks for ${read.yearsRequired}+ years` : "states no minimum years"}; the profile states the candidate's years.
- locationFit: judge onsite or hybrid roles against where the candidate is based and their own notes on relocation.
- Rate the same job and profile the same way every time. Use the anchors, not a feeling.

RULES
- Every name you cite (leadWith, alsoMention, evidence) must be copied from the candidate profile above. Never invent experience, projects, skills or numbers.
- Plain language. No praise, no hype words, no comparisons with other candidates.`;
}

/** Near-exact matching for names the model says it copied from the profile. */
function namesInProfile(facts: ResumeFacts): string[] {
  return [
    ...facts.projects.map((p) => p.name),
    ...facts.experience.flatMap((e) => [e.company, e.title, `${e.title} at ${e.company}`]),
  ].map((n) => n.toLowerCase());
}

export async function scoreFit(
  profile: Profile & { facts: ResumeFacts },
  read: ReadJob,
  jobText: string,
  verification: Verification,
  onWait?: (n: WaitNotice) => void,
  opts: { cache?: boolean } = {},
): Promise<ScoreResult> {
  const blockers: Blocker[] = [];
  const facts = profile.facts;

  if (!read.looksLikeJobPosting) {
    blockers.push({ kind: "not_a_job", message: "This text does not look like a job posting." });
  }
  if (verification.hardStops.length) {
    blockers.push({ kind: "hard_stop", message: "The posting asks for money or documents before an offer." });
  }
  if (read.requiresEnrollment && !facts.isCurrentStudent) {
    blockers.push({ kind: "enrollment", message: "The role is only open to people currently enrolled in a degree." });
  }
  if (read.yearsRequired !== null && read.yearsRequired >= facts.yearsOfExperience + 3) {
    blockers.push({
      kind: "years",
      message: `Asks for ${read.yearsRequired}+ years of experience; your profile shows ${facts.yearsOfExperience}.`,
    });
  }

  const { object, provider, model } = await generateStructured({
    task: "score",
    schema: scoreSchema,
    reasoning: "medium",
    temperature: 0,
    cacheTtlMs: opts.cache === false ? undefined : CACHE_TTL_MS.score,
    onWait,
    prompt: scorePrompt(profileBlock(profile), read, jobText),
  });

  // A core must-have the model itself marked missing is a blocker, decided here
  // rather than left to the score. Only must-haves the posting actually states
  // qualify, so a requirement the model invented cannot block anything.
  const stated = read.mustHave.map((m) => m.requirement.toLowerCase());
  for (const r of object.requirements) {
    if (r.kind !== "must" || r.met !== "missing" || !r.core) continue;
    const req = r.requirement.toLowerCase();
    const isStated = stated.some((s) => s.includes(req) || req.includes(s) || overlapRatio(s, req) >= 0.6);
    if (isStated) blockers.push({ kind: "must_have", message: `Requires ${r.requirement}, which is not in your profile.` });
  }

  // If the model cites a lead that is not in the profile, drop the citation
  // rather than show the user a project they never built.
  const known = namesInProfile(facts);
  const cited = object.leadWith.name.toLowerCase();
  const leadIsReal = known.some((n) => n && (cited.includes(n) || n.includes(cited)));
  const alsoIsReal = object.alsoMention ? known.some((n) => n && object.alsoMention!.toLowerCase().includes(n)) : true;

  if (object.locationFit <= 20) {
    blockers.push({
      kind: "location",
      message: `The role is based in ${read.location ?? "a location"} you have not said you can work from.`,
    });
  }

  const coverage = mustCoverage(object.requirements, object.overlap);
  const score = combineScore(object);
  const verdict: Verdict = blockers.length ? "skip" : score >= APPLY_AT ? "apply" : score >= BORDERLINE_AT ? "borderline" : "skip";

  const gaps = [
    ...blockers.filter((b) => b.kind !== "hard_stop" && b.kind !== "not_a_job").map((b) => ({ text: b.message, blocking: true })),
    ...object.requirements
      .filter((r) => r.met !== "met")
      .filter((r) => !blockers.some((b) => b.kind === "must_have" && b.message.includes(r.requirement)))
      .sort((a, b) => Number(b.kind === "must") - Number(a.kind === "must") || Number(a.met === "partial") - Number(b.met === "partial"))
      .map((r) => ({ text: r.met === "partial" ? `${r.requirement} (partial)` : r.requirement, blocking: false })),
  ];

  return {
    ...object,
    score,
    mustCoverage: coverage,
    leadWith: leadIsReal ? object.leadWith : { ...object.leadWith, name: "", why: "" },
    alsoMention: alsoIsReal ? object.alsoMention : null,
    moveToApply: verdict === "borderline" ? object.moveToApply : null,
    verdict,
    blockers,
    gaps,
    scoredBy: `${provider}/${model}`,
  };
}

function overlapRatio(a: string, b: string): number {
  const ta = new Set(a.split(/\W+/).filter((t) => t.length > 1));
  const tb = new Set(b.split(/\W+/).filter((t) => t.length > 1));
  if (!ta.size || !tb.size) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.min(ta.size, tb.size);
}
