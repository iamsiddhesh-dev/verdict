import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { profiles, runs } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { nudgeWorker } from "@/lib/events";
import { errorResponse, json, route } from "@/lib/http";
import { loadProfile } from "@/lib/profile";
import { resumeFactsSchema } from "@/lib/profile/resume";

export const GET = route(async () => {
  const userId = await requireUser();
  const profile = await loadProfile(userId);
  if (!profile) return json({ profile: null });
  const { resumeText: _text, masterTex, ...rest } = profile;
  return json({ profile: { ...rest, hasMasterTex: Boolean(masterTex), masterTexLength: masterTex?.length ?? 0 } });
});

const optionalUrl = z
  .string()
  .trim()
  .max(500)
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+\.\S+/.test(v), "Must be a full link starting with https://")
  .nullable()
  .optional();

const updateSchema = z.object({
  githubUrl: optionalUrl,
  linkedinUrl: optionalUrl,
  portfolioUrl: optionalUrl,
  preferences: z.string().max(2_000).nullable().optional(),
  masterTex: z.string().max(200_000).nullable().optional(),
  facts: resumeFactsSchema.optional(),
  confirm: z.boolean().optional(),
});

export const PUT = route(async (req: Request) => {
  const userId = await requireUser();
  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse(parsed.error.issues[0]?.message ?? "Some fields are not valid.", 400);
  }
  const { confirm, masterTex, ...fields } = parsed.data;
  if (masterTex && !masterTex.includes("\\begin{document}")) {
    return errorResponse("That file does not look like a LaTeX document: it has no \\begin{document}.", 400);
  }

  const existing = await loadProfile(userId);
  if (confirm && !(fields.facts ?? existing?.facts)) {
    return errorResponse("Upload a resume before confirming the profile.", 400);
  }

  const db = await getDb();
  const values = {
    ...Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined)),
    ...(masterTex !== undefined ? { masterTex } : {}),
    ...(confirm ? { confirmedAt: new Date() } : {}),
    updatedAt: new Date(),
  };
  await db
    .insert(profiles)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: profiles.userId, set: values });

  if (confirm) {
    // Runs that stopped only because there was no profile yet can finish now.
    await db
      .update(runs)
      .set({ status: "queued", leaseUntil: null, attempts: 0, updatedAt: new Date() })
      .where(and(eq(runs.userId, userId), eq(runs.status, "needs_input"), eq(runs.stage, "score"), sql`${runs.score} IS NULL`));
    nudgeWorker();
  }

  return json({ ok: true });
});
