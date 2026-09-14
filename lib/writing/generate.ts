// The write, check, correct loop shared by every writing tool.
//
// Generate, run the honesty checks, and send any failures back as a list of
// problems to fix. Up to three attempts. If problems remain, the result says so
// and lists them: the UI shows the text with its problems rather than hiding
// either.

import type { z } from "zod";
import { generateStructured, type WaitNotice } from "@/lib/llm";
import { checkText, stripDashes, type HonestySource, type Issue } from "./honesty";

export const VOICE_RULES = `VOICE (these are firm rules; the text is pasted and sent without editing)
- Write as the candidate, in plain first person. Sound like a person writing a short note, not a cover letter template.
- Describe only the candidate's own work and how it connects to what this company does. Never compare them with other candidates, other engineers or the industry.
- No bold or sweeping claims, no enthusiasm words (passionate, excited, thrilled), no filler. Let concrete things they built and real numbers carry the weight.
- Do not mention gaps or weaknesses. Leaving a gap out is fine. Claiming or implying a skill, tool or experience the profile does not show is never fine.
- Every skill, tool, project, employer and number you mention must appear in the CANDIDATE section. Company facts may only come from the JOB section.
- Do not use dashes as punctuation (no em dashes, en dashes or spaced hyphens). Use commas and full stops.
- No placeholders in brackets. If a detail is unknown, write the sentence without it.`;

export interface Checked<T> {
  value: T;
  issues: Issue[];
  attempts: number;
  model: string;
}

export async function writeWithChecks<S extends z.ZodTypeAny>(params: {
  schema: S;
  buildPrompt: (corrections: string[]) => string;
  /** Pull every text field out of the result, with a label and optional length limit, for checking. */
  fields: (value: z.infer<S>) => Array<{ label: string; text: string; maxChars?: number }>;
  /** Apply mechanical fixes (dash stripping) to every text field. */
  clean: (value: z.infer<S>, fix: (s: string) => string) => z.infer<S>;
  source: HonestySource;
  onWait?: (n: WaitNotice) => void;
}): Promise<Checked<z.infer<S>>> {
  let corrections: string[] = [];
  let last: Checked<z.infer<S>> | null = null;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const { object, provider, model } = await generateStructured({
      task: "writing",
      schema: params.schema,
      prompt: params.buildPrompt(corrections),
      onWait: params.onWait,
      maxWaitMs: 240_000,
    });
    const value = params.clean(object, stripDashes);
    const issues = params.fields(value).flatMap((f) => checkText(f.text, params.source, { label: f.label, maxChars: f.maxChars }));
    last = { value, issues, attempts: attempt, model: `${provider}/${model}` };
    if (issues.length === 0) return last;
    corrections = issues.map((i) => i.message);
  }
  return last!;
}

export function correctionBlock(corrections: string[]): string {
  return corrections.length ? `\n\nFIX THESE PROBLEMS FROM YOUR PREVIOUS ATTEMPT:\n- ${corrections.join("\n- ")}` : "";
}
