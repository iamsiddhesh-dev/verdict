// Stage 2: read the posting into structure.
//
// One model call that turns free text into the fields every later stage needs:
// what the role is, where, what it requires, and what is a must versus a nice to
// have. Scoring reads this instead of the raw text, and verification uses the
// title, location and contact details from it.

import { z } from "zod";
import { generateStructured, type WaitNotice } from "@/lib/llm";
import { CACHE_TTL_MS } from "@/lib/llm/cache";
import type { FetchedJob } from "@/lib/fetch";
import { emailsIn, requiredYears, requiresActiveEnrollment } from "./rules";

export const jobReadSchema = z.object({
  title: z.string().nullable(),
  company: z.string().nullable(),
  companyWebsite: z
    .string()
    .nullable()
    .describe("The hiring company's own website ONLY if the text states it (a URL or domain). null otherwise. Never guess one."),
  location: z.string().nullable(),
  workMode: z.enum(["onsite", "hybrid", "remote", "unknown"]),
  employmentType: z.enum(["full_time", "internship", "contract", "part_time", "freelance", "unknown"]),
  seniority: z.string().nullable().describe("As stated or clearly implied by the title, e.g. 'fresher', 'junior', 'senior'. null if not stated."),
  salary: z.string().nullable().describe("Compensation exactly as written, or null"),
  summary: z.string().describe("Two plain sentences: what the team builds and what this person would do. No praise."),
  stack: z.array(z.string()).describe("Languages, frameworks and tools the posting names, as written"),
  mustHave: z
    .array(
      z.object({
        requirement: z.string().describe("Short, close to the posting's wording"),
        category: z.enum(["language", "framework", "tool", "domain", "experience", "education", "location", "other"]),
      }),
    )
    .describe("Requirements the posting states as required. If it does not separate required from preferred, include only the core ones."),
  niceToHave: z.array(z.string()).describe("Requirements marked preferred, bonus or nice to have"),
  applyEmail: z.string().nullable().describe("An email address the posting tells applicants to write to, or null"),
  contactName: z.string().nullable().describe("A named recruiter or hiring manager in the posting, or null"),
  formQuestions: z.array(z.string()).describe("Questions the posting explicitly asks applicants to answer, or []"),
  looksLikeJobPosting: z.boolean().describe("false if this text is not a job or internship posting at all"),
});

export type JobRead = z.infer<typeof jobReadSchema>;

export interface ReadJob extends JobRead {
  wordCount: number;
  yearsRequired: number | null;
  requiresEnrollment: boolean;
  emails: string[];
}

export async function readJob(job: FetchedJob, onWait?: (n: WaitNotice) => void): Promise<ReadJob> {
  // Long postings are mostly benefits and boilerplate at the end. 12k characters
  // keeps every requirement list seen in practice while staying inside the
  // smallest per-minute budget in the chain.
  const text = job.text.slice(0, 12_000);
  const known = [
    job.title && `Title (from the job board): ${job.title}`,
    job.company && `Company (from the job board): ${job.company}`,
    job.location && `Location (from the job board): ${job.location}`,
    job.employmentType && `Employment type (from the job board): ${job.employmentType}`,
    job.salary && `Salary (from the job board): ${job.salary}`,
  ]
    .filter(Boolean)
    .join("\n");

  const { object } = await generateStructured({
    task: "readJob",
    schema: jobReadSchema,
    reasoning: "low",
    temperature: 0,
    cacheTtlMs: CACHE_TTL_MS.readJob,
    onWait,
    prompt: `Read this job posting and extract its facts. Report only what the posting says. If something is not stated, use null, "unknown" or an empty list. Do not add requirements the posting does not state.
${known ? `\n${known}\n` : ""}
Posting:
"""
${text}
"""`,
  });

  return {
    ...object,
    title: object.title ?? job.title,
    company: object.company ?? job.company,
    location: object.location ?? job.location,
    salary: object.salary ?? job.salary,
    wordCount: job.text.split(/\s+/).filter(Boolean).length,
    yearsRequired: requiredYears(job.text),
    requiresEnrollment: requiresActiveEnrollment(job.text),
    emails: emailsIn(job.text),
  };
}
