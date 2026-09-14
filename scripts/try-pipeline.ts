// End-to-end check of read, verify and score without the web app.
//   npx tsx --env-file=.env scripts/try-pipeline.ts <resume.tex|pdf> <job url | @file.txt> [...]

import { readFileSync } from "node:fs";
import path from "node:path";
import { fetchJob, jobFromPaste } from "@/lib/fetch";
import { capacitySnapshot } from "@/lib/llm";
import { detectResumeKind, extractResumeText, parseResumeText } from "@/lib/profile/resume";
import { readJob } from "@/lib/pipeline/read";
import { scoreFit } from "@/lib/pipeline/score";
import { verify } from "@/lib/verify";

const [resumePath, ...jobs] = process.argv.slice(2);
if (!resumePath || !jobs.length) {
  console.error("usage: try-pipeline.ts <resume> <job url | @file.txt> [...]");
  process.exit(1);
}

const bytes = new Uint8Array(readFileSync(resumePath));
const kind = detectResumeKind("", path.basename(resumePath))!;
const text = await extractResumeText(bytes, kind);
let t = Date.now();
const facts = await parseResumeText(text);
console.log(`resume parsed in ${Date.now() - t}ms: ${facts.name}, ${facts.yearsOfExperience} yrs, ${facts.skills.length} skills, ${facts.projects.length} projects`);

const profile = {
  userId: "00000000-0000-0000-0000-000000000000",
  resumeFilename: null,
    hasResumeFile: false,
  resumeText: text,
  facts,
  githubUrl: null,
  linkedinUrl: null,
  portfolioUrl: null,
  preferences: process.env.PREFS ?? null,
  masterTex: null,
  confirmedAt: new Date(),
};

const log = (stage: string) => (n: { ms: number }) => console.log(`  [${stage}] waiting ${n.ms}ms for capacity`);

for (const input of jobs) {
  console.log(`\n=== ${input}`);
  t = Date.now();
  const fetched = input.startsWith("@") ? { ok: true as const, job: jobFromPaste(readFileSync(input.slice(1), "utf8"), null) } : await fetchJob(input);
  if (!fetched.ok) {
    console.log(`  fetch blocked: ${fetched.message}`);
    continue;
  }
  console.log(`  fetch ${Date.now() - t}ms via ${fetched.job.sourceLabel}; site ${fetched.job.companyWebsite}`);
  t = Date.now();
  const read = await readJob(fetched.job, log("read"));
  console.log(`  read ${Date.now() - t}ms: ${read.title} @ ${read.company} | ${read.location} ${read.workMode} | yrs ${read.yearsRequired} | must: ${read.mustHave.map((m) => m.requirement).join("; ")}`);
  t = Date.now();
  const v = await verify(fetched.job, read, log("verify"));
  console.log(`  verify ${Date.now() - t}ms: ${v.summary} type=${v.companyType}`);
  for (const c of v.checks) console.log(`    ${c.status.padEnd(13)} ${c.label}: ${c.detail}`);
  if (v.questionsToAsk.length) console.log(`    ask: ${v.questionsToAsk.join(" | ")}`);
  t = Date.now();
  const s = await scoreFit(profile, read, fetched.job.text, v, log("score"));
  console.log(`  score ${Date.now() - t}ms by ${s.scoredBy}: ${s.score} -> ${s.verdict.toUpperCase()}`);
  console.log(`    rationale: ${s.rationale}`);
  console.log(`    lead: ${s.leadWith.name} | ${s.leadWith.why}`);
  console.log(`    gaps: ${s.gaps.map((g) => (g.blocking ? `[BLOCK] ${g.text}` : g.text)).join("; ")}`);
}

console.log("\ncapacity:", JSON.stringify(capacitySnapshot().filter((l) => l.today.requests > 0), null, 1));
process.exit(0);
