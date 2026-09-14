// Resume upload: extract text, parse facts, save both. The profile is not
// confirmed here; the user reviews the parsed facts first, because a wrong fact
// at this step quietly skews every verdict after it.

import { profiles } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { errorResponse, json, route } from "@/lib/http";
import { detectResumeKind, extractResumeText, parseResumeText } from "@/lib/profile/resume";

export const maxDuration = 120;
const MAX_BYTES = 5_000_000;

export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) return errorResponse("Choose a resume file to upload.", 400);
  if (file.size > MAX_BYTES) return errorResponse("That file is over 5 MB. Upload a smaller PDF or the .tex source.", 400);

  const kind = detectResumeKind(file.type, file.name);
  if (!kind) return errorResponse("Upload a PDF, DOCX, TXT or TEX file.", 400);

  const bytes = new Uint8Array(await file.arrayBuffer());
  let text: string;
  try {
    text = await extractResumeText(bytes, kind);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not read that file.", 400);
  }
  if (text.split(/\s+/).length < 60) {
    return errorResponse("We found very little text in that file. If it is a scanned PDF, upload the original or the .tex source.", 400);
  }

  const facts = await parseResumeText(text);
  const db = await getDb();
  const values = {
    resumeText: text,
    resumeFilename: file.name,
    facts,
    // A new resume means the old confirmation no longer describes this profile.
    confirmedAt: null,
    // Uploading the .tex as the resume also gives us the master file for tailoring.
    ...(kind === "tex" ? { masterTex: Buffer.from(bytes).toString("utf-8") } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });

  return json({ facts, filename: file.name, usedAsMasterTex: kind === "tex" });
});
