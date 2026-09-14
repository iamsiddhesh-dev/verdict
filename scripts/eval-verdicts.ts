// Verdict eval: does the agent reach the verdict a careful human reached?
//   npm run eval:verdicts -- <resume.tex|pdf>
//
// If the verdicts are not trustworthy nothing downstream matters, so this is the
// test to run after any change to reading, scoring or the model routes. It also
// scores a few jobs twice with the cache off and reports how far the score
// moved, because a verdict that flips between runs is not a verdict.

import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchJob, jobFromPaste, type FetchedJob } from "@/lib/fetch";
import { capacitySnapshot } from "@/lib/llm";
import { readJob } from "@/lib/pipeline/read";
import { scoreFit, type ScoreResult } from "@/lib/pipeline/score";
import { detectResumeKind, extractResumeText, parseResumeText } from "@/lib/profile/resume";
import { verify } from "@/lib/verify";

interface Case {
  input: string;
  expect: Array<"apply" | "borderline" | "skip">;
  hardStop?: boolean;
  why: string;
}

const evalDir = path.join(process.cwd(), "eval");
const labels = JSON.parse(readFileSync(path.join(evalDir, "labels.json"), "utf8")) as { preferences: string; cases: Case[]; stability: string[] };

const resumePath = process.argv[2];
if (!resumePath) {
  console.error("usage: npm run eval:verdicts -- <resume file>");
  process.exit(1);
}

const text = await extractResumeText(new Uint8Array(readFileSync(resumePath)), detectResumeKind("", path.basename(resumePath))!);
const facts = await parseResumeText(text);
const profile = {
  userId: "00000000-0000-0000-0000-000000000000",
  resumeFilename: null,
    hasResumeFile: false,
  resumeText: text,
  facts,
  githubUrl: null,
  linkedinUrl: null,
  portfolioUrl: null,
  preferences: labels.preferences,
  masterTex: null,
  confirmedAt: new Date(),
};

const quiet = () => {};

async function load(input: string): Promise<FetchedJob | null> {
  if (/^https?:\/\//.test(input)) {
    const r = await fetchJob(input);
    return r.ok ? r.job : null;
  }
  return jobFromPaste(readFileSync(path.join(evalDir, input), "utf8"), null);
}

async function judge(job: FetchedJob, cache: boolean): Promise<{ score: ScoreResult; hardStops: number }> {
  const read = await readJob(job, quiet);
  const v = await verify(job, read, quiet);
  const score = await scoreFit(profile, read, job.text, v, quiet, { cache });
  return { score, hardStops: v.hardStops.length };
}

let pass = 0;
const started = Date.now();
for (const c of labels.cases) {
  const job = await load(c.input);
  if (!job) {
    console.log(`?? ${c.input}: could not fetch`);
    continue;
  }
  const t = Date.now();
  const { score, hardStops } = await judge(job, false);
  const ok = c.expect.includes(score.verdict) && (!c.hardStop || hardStops > 0);
  if (ok) pass++;
  console.log(
    `${ok ? "PASS" : "FAIL"} ${score.verdict.padEnd(10)} ${String(score.score).padStart(3)}  ${path.basename(c.input).slice(0, 44).padEnd(44)} ${Math.round((Date.now() - t) / 1000)}s`,
  );
  console.log(
    `       overlap ${score.overlap} must ${score.mustCoverage} seniority ${score.seniorityFit} location ${score.locationFit}${score.blockers.length ? ` | blockers: ${score.blockers.map((b) => b.kind).join(", ")}` : ""}`,
  );
  if (!ok) console.log(`       expected ${c.expect.join("/")}${c.hardStop ? " with hard stop" : ""}: ${c.why}\n       rationale: ${score.rationale}`);
}
console.log(`\n${pass}/${labels.cases.length} verdicts match (${Math.round((Date.now() - started) / 1000)}s)`);

console.log("\nStability (same job scored again, cache off):");
for (const input of labels.stability) {
  const job = await load(input);
  if (!job) continue;
  const a = await judge(job, false);
  const b = await judge(job, false);
  const delta = Math.abs(a.score.score - b.score.score);
  console.log(`  ${path.basename(input).slice(0, 44).padEnd(44)} ${a.score.score} vs ${b.score.score} (delta ${delta}) ${a.score.verdict === b.score.verdict ? "same verdict" : "VERDICT FLIPPED"}`);
}

console.log("\nModel usage this run:");
for (const lane of capacitySnapshot().filter((l) => l.today.requests > 0)) {
  console.log(`  ${lane.id.padEnd(48)} ${lane.today.requests} requests today${lane.cooldownMs ? `, cooling down ${Math.round(lane.cooldownMs / 1000)}s` : ""}`);
}
process.exit(pass === labels.cases.length ? 0 : 1);
