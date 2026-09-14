// Tailor a resume for an existing run from the command line, without the UI.
//
//   npm run try:resume -- <runId>        (defaults to the most recent done run)
//
// Writes the .tex (and the PDF, when a compiler is installed) to .data/out/ and
// prints the diff, so prompt and trimming changes can be checked in seconds.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { runs } from "@/db/schema";
import { getDb } from "@/lib/db";
import type { FetchOutcome } from "@/lib/fetch";
import type { ReadJob } from "@/lib/pipeline/read";
import type { ScoreResult } from "@/lib/pipeline/score";
import { loadProfile, profileIsReady } from "@/lib/profile";
import { tailorResume } from "@/lib/resume";

const db = await getDb();
const runId = process.argv[2];
const [run] = runId
  ? await db.select().from(runs).where(eq(runs.id, runId)).limit(1)
  : await db.select().from(runs).where(eq(runs.status, "done")).orderBy(desc(runs.createdAt)).limit(1);
if (!run) throw new Error("No run found.");

const profile = await loadProfile(run.userId);
const fetched = run.fetched as FetchOutcome | null;
if (!profileIsReady(profile) || !fetched?.ok || !run.job || !run.score) throw new Error("Run is missing profile, job or score.");

const read = run.job as ReadJob;
console.log(`Run ${run.id}: ${read.title} at ${read.company} (verdict ${run.verdict}); master .tex: ${profile.masterTex ? "yes" : "no"}`);

const started = Date.now();
const result = await tailorResume({
  profile,
  read,
  score: run.score as ScoreResult,
  jobText: fetched.job.text,
  onProgress: (d) => console.log(`  [${((Date.now() - started) / 1000).toFixed(1)}s] ${d}`),
  onWait: (n) => console.log(`  waiting ${Math.ceil(n.ms / 1000)}s for capacity`),
});

const out = path.join(process.cwd(), ".data", "out");
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, `${result.filename}.tex`), result.tex);
if (result.pdfBase64) writeFileSync(path.join(out, `${result.filename}.pdf`), Buffer.from(result.pdfBase64, "base64"));

console.log(`\nModel: ${result.model} | source: ${result.source} | pages: ${result.pages ?? "not compiled"} | compile: ${JSON.stringify({ ...result.compile, log: result.compile.log?.slice(0, 300) })}`);
console.log(`Focus: ${result.focus}`);
console.log(`Keywords: ${result.keywords.join(", ")}`);
for (const e of result.entries) {
  console.log(`\n${e.included ? "+" : "-"} [${e.section}] ${e.title}`);
  for (const b of e.bullets) {
    if (b.status === "rewritten") console.log(`    ~ ${b.before}\n    > ${b.after}`);
    else console.log(`    ${b.status === "kept" ? "=" : b.status}: ${b.before.slice(0, 140)}`);
  }
}
console.log("\nSkills removed:", result.skills.filter((s) => s.removed.length).map((s) => `${s.label}: ${s.removed.join(", ")}`));
console.log("Notes:", result.notes);
console.log(`\nWrote ${out}`);
process.exit(0);
