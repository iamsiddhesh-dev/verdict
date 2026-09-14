// Resume parsing, lifted from startHunt. Storage-agnostic: it takes bytes.
//
// Two passes: extract, then proofread the extraction against the original text.
// The second pass exists because of real failures in startHunt: a job filed as
// a project, a skill that was not in the resume, and a graduate marked as a
// current student because the model did not know today's date.

import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import { z } from "zod";
import { generateStructured } from "@/lib/llm";
import { CACHE_TTL_MS } from "@/lib/llm/cache";

export type ResumeFileKind = "pdf" | "docx" | "txt" | "tex";

export function detectResumeKind(mimeType: string, filename: string): ResumeFileKind | null {
  const name = filename.toLowerCase();
  if (mimeType === "application/pdf" || name.endsWith(".pdf")) return "pdf";
  if (name.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return "docx";
  if (name.endsWith(".tex")) return "tex";
  if (mimeType === "text/plain" || name.endsWith(".txt") || name.endsWith(".md")) return "txt";
  return null;
}

export const resumeFactsSchema = z.object({
  name: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  location: z.string().nullable(),
  headline: z
    .string()
    .nullable()
    .describe("A short role description in the resume's own words, e.g. 'Full-stack developer'. null if the resume states none."),
  seniority: z.string().nullable().describe("e.g. 'entry-level', 'junior', 'mid'; null if not inferable"),
  isCurrentStudent: z
    .boolean()
    .describe("true only if the resume states the candidate is CURRENTLY enrolled (a future graduation date, 'currently pursuing'). false if already graduated."),
  yearsOfExperience: z
    .number()
    .describe("Years of RELEVANT professional software experience. Projects and internships alone count as 0. Unrelated work does not count."),
  skills: z.array(z.string()),
  projects: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
      technologies: z.array(z.string()),
      url: z.string().nullable().describe("A link to the project exactly as written in the resume, or null"),
    }),
  ),
  experience: z.array(
    z.object({
      company: z.string(),
      title: z.string(),
      duration: z.string().nullable(),
      location: z.string().nullable(),
      summary: z.string(),
    }),
  ),
  education: z.array(
    z.object({
      institution: z.string(),
      degree: z.string(),
      graduationYear: z.string().nullable(),
    }),
  ),
  links: z.array(z.string()).describe("Every URL in the resume (GitHub, portfolio, LinkedIn), exactly as written"),
});
export type ResumeFacts = z.infer<typeof resumeFactsSchema>;

/** LaTeX source to readable text: good enough for fact extraction, not for rendering. */
export function texToText(tex: string): string {
  const body = tex.includes("\\begin{document}") ? tex.slice(tex.indexOf("\\begin{document}")) : tex;
  return body
    .split("\n")
    .filter((line) => !/^\s*%/.test(line))
    .join("\n")
    .replace(/\\href\{([^}]*)\}\{([^}]*)\}/g, "$2 ($1)")
    .replace(/\\(textbf|textit|emph|underline|small|scshape|large|Large|Huge|section\*?|subsection\*?)\s*\{/g, "{")
    .replace(/\\resumeItem\{/g, "\n- {")
    .replace(/\\(item|\\|newline|hfill|vspace\{[^}]*\}|hspace\{[^}]*\})/g, "\n")
    .replace(/\\[a-zA-Z]+\*?(\[[^\]]*\])?/g, " ")
    .replace(/[{}$]/g, " ")
    .replace(/\\&/g, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

export async function extractResumeText(bytes: Uint8Array, kind: ResumeFileKind): Promise<string> {
  let text: string;
  if (kind === "pdf") {
    const pdf = await getDocumentProxy(bytes);
    ({ text } = await extractText(pdf, { mergePages: true }));
  } else if (kind === "docx") {
    text = (await mammoth.extractRawText({ buffer: Buffer.from(bytes) })).value;
  } else if (kind === "tex") {
    text = texToText(Buffer.from(bytes).toString("utf-8"));
  } else {
    text = Buffer.from(bytes).toString("utf-8");
  }
  if (!text.trim()) {
    throw new Error(
      kind === "pdf"
        ? "This PDF has no text layer, which usually means it is a scan or an image. Upload the original PDF, a .docx, or the .tex source instead."
        : "That file has no readable text in it.",
    );
  }
  return text;
}

const today = () => new Date().toISOString().slice(0, 10);

function extractionPrompt(text: string): string {
  return `Extract structured facts from this resume's raw text. Today's date is ${today()}.
Rules:
- Report only what the text states. Never infer, guess or embellish. Absent means null or an empty array.
- yearsOfExperience counts relevant professional software work only. Projects and internships alone are 0. Freelance software work for real clients counts.
- Freelance or non-engineering work is still an experience ENTRY; it just does not inflate yearsOfExperience.
- isCurrentStudent: compare graduation dates with today (${today()}). A past graduation date means graduated (false).
- Keep project and experience descriptions close to the resume's own wording, including any numbers exactly as written.

Resume text:
"""
${text}
"""`;
}

function hardeningPrompt(text: string, facts: ResumeFacts): string {
  return `Proofread facts extracted from a resume against the original text. Today's date is ${today()}. Fix ONLY these problems and leave everything else as it is:
1. MISCLASSIFICATION: a personal or academic project filed under experience moves to projects, and a real job or internship filed under projects moves to experience. Recompute yearsOfExperience if that changes it.
2. HALLUCINATION: remove any skill, claim, number or detail that is not present in the resume text.
3. isCurrentStudent: a graduation date in the past means false.
If nothing is wrong, return the facts unchanged.

Resume text:
"""
${text}
"""

Extracted facts:
${JSON.stringify(facts, null, 2)}`;
}

export async function parseResumeText(text: string): Promise<ResumeFacts> {
  const { object: raw } = await generateStructured({
    task: "resumeExtraction",
    prompt: extractionPrompt(text),
    schema: resumeFactsSchema,
    cacheTtlMs: CACHE_TTL_MS.resumeExtraction,
    reasoning: "low",
    maxWaitMs: 60_000,
  });
  try {
    const { object } = await generateStructured({
      task: "resumeExtraction",
      prompt: hardeningPrompt(text, raw),
      schema: resumeFactsSchema,
      cacheTtlMs: CACHE_TTL_MS.resumeExtraction,
      reasoning: "low",
      maxWaitMs: 30_000,
    });
    return object;
  } catch {
    // The proofread is an improvement on an already-valid extraction. If it
    // cannot run, the unproofread facts are still usable.
    return raw;
  }
}
