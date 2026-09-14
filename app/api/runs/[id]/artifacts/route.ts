import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, notFound, route } from "@/lib/http";
import { createArtifact, listArtifacts, toolsUnlocked } from "@/lib/pipeline/artifacts";
import { getRunForUser } from "@/lib/pipeline/runs";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser();
  const { id } = await ctx.params;
  const run = await getRunForUser(userId, id);
  if (!run) return notFound();
  return json({ artifacts: await listArtifacts(run.id) });
});

const schema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("answers"),
    includeStandard: z.boolean().default(true),
    questions: z
      .array(
        z.object({
          question: z.string().trim().min(3).max(1_000),
          maxChars: z.number().int().min(50).max(10_000).nullable().optional(),
        }),
      )
      .max(15)
      .default([]),
  }),
  z.object({
    kind: z.literal("outreach"),
    contactName: z.string().trim().max(120).nullable().optional(),
    contactRole: z.string().trim().max(120).nullable().optional(),
  }),
  z.object({ kind: z.literal("resume") }),
]);

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser();
  const { id } = await ctx.params;
  const run = await getRunForUser(userId, id);
  if (!run) return notFound();

  const gate = toolsUnlocked(run);
  if (!gate.ok) return errorResponse(gate.reason, 403);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse(parsed.error.issues[0]?.message ?? "Invalid request.", 400);
  const body = parsed.data;
  if (body.kind === "answers" && !body.includeStandard && body.questions.length === 0) {
    return errorResponse("Add at least one question.", 400);
  }
  const { kind, ...input } = body;
  const artifact = await createArtifact(run, kind, input);
  return json({ artifact }, 201);
});
