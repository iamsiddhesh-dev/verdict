// Manual check of the fetch tiers against live postings.
//   npx tsx scripts/try-fetch.ts <url> [<url> ...]
// With no arguments it picks one live posting from a few public boards.

import { fetchJob } from "@/lib/fetch";
import { fetchJson } from "@/lib/fetch/http";

async function samples(): Promise<string[]> {
  const out: string[] = [];
  const lever = (await fetchJson("https://api.lever.co/v0/postings/palantir?limit=1&mode=json")) as Array<{ hostedUrl: string }> | null;
  if (lever?.[0]) out.push(lever[0].hostedUrl);
  const gh = (await fetchJson("https://boards-api.greenhouse.io/v1/boards/stripe/jobs")) as { jobs: Array<{ absolute_url: string; id: number }> } | null;
  if (gh?.jobs?.[0]) out.push(`https://job-boards.greenhouse.io/stripe/jobs/${gh.jobs[0].id}`);
  const ashby = (await fetchJson("https://api.ashbyhq.com/posting-api/job-board/ashby")) as { jobs: Array<{ jobUrl: string }> } | null;
  if (ashby?.jobs?.[0]) out.push(ashby.jobs[0].jobUrl);
  out.push("https://www.linkedin.com/jobs/view/123");
  out.push("https://jobs.lever.co/palantir/00000000-0000-0000-0000-000000000000");
  out.push("http://169.254.169.254/latest/meta-data");
  return out;
}

const urls = process.argv.slice(2).length ? process.argv.slice(2) : await samples();
for (const url of urls) {
  const t = Date.now();
  const r = await fetchJob(url);
  const ms = Date.now() - t;
  if (r.ok) {
    const { text, ...rest } = r.job;
    console.log(`\nOK ${ms}ms ${url}\n`, rest, `\n  words: ${text.split(/\s+/).length}\n  start: ${text.slice(0, 240).replace(/\n/g, " | ")}`);
  } else {
    console.log(`\nBLOCKED ${ms}ms ${url}\n  ${r.reason}: ${r.message}`);
  }
}
