import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, route } from "@/lib/http";
import { createRun, listRuns } from "@/lib/pipeline/runs";

export const GET = route(async () => {
  const userId = await requireUser();
  const runs = await listRuns(userId);
  return json({
    runs: runs.map((r) => ({
      id: r.id,
      status: r.status,
      stage: r.stage,
      verdict: r.verdict,
      score: r.score?.score ?? null,
      title: r.job?.title ?? (r.fetched?.ok ? r.fetched.job.title : null),
      company: r.job?.company ?? (r.fetched?.ok ? r.fetched.job.company : null),
      inputUrl: r.inputUrl,
      companyType: r.verification?.companyType ?? null,
      createdAt: r.createdAt,
    })),
  });
});

const createSchema = z
  .object({
    url: z.string().trim().max(2_000).optional().nullable(),
    text: z.string().trim().max(60_000).optional().nullable(),
  })
  .refine((v) => Boolean(v.url) || Boolean(v.text), "A link or a description is required");

export const POST = route(async (req: Request) => {
  const userId = await requireUser();
  const parsed = createSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse("Paste a job link or a job description.", 400);
  const { url, text } = parsed.data;
  if (text && text.split(/\s+/).length < 30) {
    return errorResponse("That description is too short to judge. Paste the full posting.", 400);
  }
  const run = await createRun(userId, { url: url || null, text: text || null });
  return json({ run }, 201);
});
