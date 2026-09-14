// Application answers and outreach messages.

import { z } from "zod";
import type { WaitNotice } from "@/lib/llm";
import { profileBlock, type Profile, type ResumeFacts } from "@/lib/profile";
import type { ReadJob } from "@/lib/pipeline/read";
import type { ScoreResult } from "@/lib/pipeline/score";
import { correctionBlock, VOICE_RULES, writeWithChecks, type Checked } from "./generate";
import type { HonestySource } from "./honesty";

export type ReadyProfile = Profile & { facts: ResumeFacts };

export function honestySource(profile: ReadyProfile, jobText: string): HonestySource {
  return {
    profileText: [profile.resumeText ?? "", JSON.stringify(profile.facts), profile.preferences ?? "", profile.githubUrl ?? "", profile.portfolioUrl ?? ""].join("\n"),
    jobText,
  };
}

function context(profile: ReadyProfile, read: ReadJob, score: ScoreResult, jobText: string): string {
  const links = [profile.githubUrl && `GitHub: ${profile.githubUrl}`, profile.portfolioUrl && `Portfolio: ${profile.portfolioUrl}`, profile.linkedinUrl && `LinkedIn: ${profile.linkedinUrl}`]
    .filter(Boolean)
    .join("\n");
  return `CANDIDATE
${profileBlock(profile)}
${links}

JOB
Title: ${read.title ?? "unknown"}
Company: ${read.company ?? "unknown"}
Location: ${read.location ?? "not stated"} (${read.workMode})
What the role is: ${read.summary}
Posting text:
"""
${jobText.slice(0, 5_000)}
"""

FIT (from the scoring step)
Lead with: ${score.leadWith.name || "the most relevant project"}${score.leadWith.why ? `, because ${score.leadWith.why}` : ""}
${score.alsoMention ? `Also relevant: ${score.alsoMention}` : ""}
Overlap: ${score.rationale}`;
}

// --- Answers -------------------------------------------------------------------

export interface QuestionInput {
  question: string;
  maxChars?: number | null;
}

export const STANDARD_QUESTIONS: QuestionInput[] = [
  { question: "Why are you a good fit for this role?", maxChars: 700 },
  { question: "Why do you want to work at this company?", maxChars: 600 },
];

const answersSchema = z.object({
  answers: z.array(
    z.object({
      question: z.string().describe("The question, copied exactly"),
      answer: z.string(),
    }),
  ),
});

export type AnswersContent = { answers: Array<{ question: string; answer: string; maxChars: number | null }> };

export async function writeAnswers(
  profile: ReadyProfile,
  read: ReadJob,
  score: ScoreResult,
  jobText: string,
  questions: QuestionInput[],
  onWait?: (n: WaitNotice) => void,
): Promise<Checked<AnswersContent>> {
  const list = questions.map((q, i) => `${i + 1}. ${q.question}${q.maxChars ? ` (limit: ${q.maxChars} characters, stay well under it)` : ""}`).join("\n");
  const limits = new Map(questions.map((q) => [q.question, q.maxChars ?? null]));

  const result = await writeWithChecks({
    schema: answersSchema,
    source: honestySource(profile, jobText),
    onWait,
    buildPrompt: (corrections) => `Write the candidate's answers to these application questions for this job.

${context(profile, read, score, jobText)}

QUESTIONS
${list}

HOW TO ANSWER
- Answer every question in order, one answer each, and copy each question exactly.
- Ground each answer in a specific project or job from the profile: what was built, a real number if the profile has one, and why that matters for this company's work.
- "Why this company" answers use what the posting says the company builds. Do not invent news, funding, customers or products.
- Short paragraphs. No greeting, no sign-off, no restating the question.
- Where there is a character limit, stay under it.

${VOICE_RULES}${correctionBlock(corrections)}`,
    fields: (v) => v.answers.map((a, i) => ({ label: `answer ${i + 1}`, text: a.answer, maxChars: limits.get(a.question) ?? questions[i]?.maxChars ?? undefined })),
    clean: (v, fix) => ({ answers: v.answers.map((a) => ({ ...a, answer: fix(a.answer) })) }),
  });

  return {
    ...result,
    value: {
      answers: result.value.answers.map((a, i) => ({ ...a, maxChars: limits.get(a.question) ?? questions[i]?.maxChars ?? null })),
    },
  };
}

// --- Outreach --------------------------------------------------------------------

export const LINKEDIN_MAX = 300;
export const X_DM_MAX = 280;

const outreachSchema = z.object({
  linkedin: z.string().describe(`A LinkedIn connection note, ${LINKEDIN_MAX} characters or fewer`),
  xDm: z.string().describe(`A short X direct message, ${X_DM_MAX} characters or fewer, with no links`),
  email: z.object({
    subject: z.string().describe("Specific and short. Names the role or the relevant project. No clickbait."),
    body: z.string().describe("Greeting to sign-off, short paragraphs separated by blank lines"),
  }),
});

export type OutreachContent = z.infer<typeof outreachSchema>;

export async function writeOutreach(
  profile: ReadyProfile,
  read: ReadJob,
  score: ScoreResult,
  jobText: string,
  contact: { name: string | null; role: string | null },
  onWait?: (n: WaitNotice) => void,
): Promise<Checked<OutreachContent>> {
  const firstName = profile.facts.name?.trim().split(/\s+/)[0] ?? null;
  const greeting = contact.name ? `Hi ${contact.name.split(/\s+/)[0]},` : "Hi,";
  return writeWithChecks({
    schema: outreachSchema,
    source: honestySource(profile, jobText),
    onWait,
    buildPrompt: (corrections) => `Write three short outreach messages from the candidate about this job: a LinkedIn connection note, an X direct message and a cold email.

${context(profile, read, score, jobText)}

RECIPIENT
${contact.name ? `Name: ${contact.name}` : "Name unknown"}${contact.role ? `\nRole: ${contact.role}` : ""}

HOW TO WRITE THEM
- Each message: one line on what the company is building (from the posting only), one or two lines on the most relevant thing the candidate built and the overlap, then a simple ask about the role.
- LinkedIn: ${LINKEDIN_MAX} characters or fewer. Open with "${greeting}".
- X DM: ${X_DM_MAX} characters or fewer, no links, no hashtags. Open with "${greeting}".
- Email: open with "${greeting}". Three or four short paragraphs. Include a link to the relevant project or GitHub only if it appears in the CANDIDATE section. ${firstName ? `Sign off with "Thanks,\\n${firstName}".` : `Sign off with "Thanks,".`}
- Messages must be specific enough that they could not be sent to another company unchanged.

${VOICE_RULES}${correctionBlock(corrections)}`,
    fields: (v) => [
      { label: "LinkedIn note", text: v.linkedin, maxChars: LINKEDIN_MAX },
      { label: "X message", text: v.xDm, maxChars: X_DM_MAX },
      { label: "email subject", text: v.email.subject, maxChars: 90 },
      { label: "email", text: v.email.body, maxChars: 1_600 },
    ],
    clean: (v, fix) => ({ linkedin: fix(v.linkedin), xDm: fix(v.xDm), email: { subject: fix(v.email.subject), body: fix(v.email.body) } }),
  });
}
