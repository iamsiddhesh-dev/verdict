// The account's data, all of it: download a copy, or delete everything.

import { desc, eq, inArray, sql } from "drizzle-orm";
import { artifacts, profiles, runs, users } from "@/db/schema";
import { currentUser, requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { json, route } from "@/lib/http";
import { authConfigured } from "@/lib/supabase/config";
import { createSupabaseServer } from "@/lib/supabase/server";

/** GET: everything stored for this account, as one JSON file. */
export const GET = route(async () => {
  const userId = await requireUser();
  const user = await currentUser();
  const db = await getDb();

  const [profile] = await db
    .select({
      resumeFilename: profiles.resumeFilename,
      resumeText: profiles.resumeText,
      facts: profiles.facts,
      githubUrl: profiles.githubUrl,
      linkedinUrl: profiles.linkedinUrl,
      portfolioUrl: profiles.portfolioUrl,
      preferences: profiles.preferences,
      masterTex: profiles.masterTex,
      confirmedAt: profiles.confirmedAt,
      updatedAt: profiles.updatedAt,
    })
    .from(profiles)
    .where(eq(profiles.userId, userId))
    .limit(1);

  const runRows = await db.select().from(runs).where(eq(runs.userId, userId)).orderBy(desc(runs.createdAt));
  const artifactRows = runRows.length
    ? await db
        .select()
        .from(artifacts)
        .where(inArray(artifacts.runId, runRows.map((r) => r.id)))
        .orderBy(desc(artifacts.createdAt))
    : [];

  const body = {
    exportedAt: new Date().toISOString(),
    account: { email: user?.email ?? null, name: user?.name ?? null },
    profile: profile ?? null,
    runs: runRows.map(({ userId: _u, leaseUntil: _l, attempts: _a, ...r }) => ({
      ...r,
      artifacts: artifactRows
        .filter((a) => a.runId === r.id)
        .map(({ runId: _r, availableAt: _v, attempts: _t, ...a }) => {
          // PDFs are large and rebuilt from the .tex; the .tex itself is included.
          const content = a.content as { value?: { pdfBase64?: string } } | null;
          if (content?.value?.pdfBase64) content.value = { ...content.value, pdfBase64: undefined };
          return a;
        }),
    })),
  };

  return new Response(JSON.stringify(body, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="verdict-data-${new Date().toISOString().slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
});

/** DELETE: remove the profile, every run and every generated draft, then sign out. */
export const DELETE = route(async () => {
  const userId = await requireUser();
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Runs cascade to their artifacts, profiles cascade from the user row.
    await tx.delete(runs).where(eq(runs.userId, userId));
    await tx.delete(profiles).where(eq(profiles.userId, userId));
    await tx.execute(sql`DELETE FROM usage_counters WHERE user_id = ${userId}::uuid`);
    await tx.delete(users).where(eq(users.id, userId));
  });
  if (authConfigured()) {
    const supabase = await createSupabaseServer();
    await supabase.auth.signOut({ scope: "local" });
  }
  return json({ ok: true });
});
