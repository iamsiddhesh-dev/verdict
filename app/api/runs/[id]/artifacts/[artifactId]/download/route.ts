import { and, eq } from "drizzle-orm";
import { artifacts } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { errorResponse, notFound, route } from "@/lib/http";
import { getRunForUser } from "@/lib/pipeline/runs";
import type { ResumeContent } from "@/lib/resume";

// GET ?format=pdf|tex. Ownership is proven through the run before the artifact
// is read, and a miss at either step is a 404, so ids cannot be probed.
export const GET = route(async (req: Request, ctx: { params: Promise<{ id: string; artifactId: string }> }) => {
  const userId = await requireUser();
  const { id, artifactId } = await ctx.params;
  const run = await getRunForUser(userId, id);
  if (!run) return notFound();

  const db = await getDb();
  const [row] = await db
    .select()
    .from(artifacts)
    .where(and(eq(artifacts.id, artifactId), eq(artifacts.runId, run.id), eq(artifacts.kind, "resume"), eq(artifacts.status, "done")))
    .limit(1);
  const content = (row?.content as { value?: ResumeContent } | null)?.value;
  if (!content) return notFound();

  const format = new URL(req.url).searchParams.get("format") === "pdf" ? "pdf" : "tex";
  const name = content.filename || "Resume";
  if (format === "pdf") {
    if (!content.pdfBase64) return errorResponse("This version has no PDF. Download the .tex and compile it in Overleaf.", 404);
    return new Response(new Uint8Array(Buffer.from(content.pdfBase64, "base64")), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  }
  return new Response(content.tex, {
    headers: {
      "Content-Type": "application/x-tex; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}.tex"`,
      "Cache-Control": "private, no-store",
    },
  });
});
