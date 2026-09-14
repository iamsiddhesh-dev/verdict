// State changes a user can make to their own run:
//   paste    supply the description after a link could not be read
//   retry    re-run from the step that failed or stopped
//   rescore  score again, for example after editing the profile
//   unlock   open the tools on a borderline verdict

import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { errorResponse, json, notFound, route } from "@/lib/http";
import { getRunForUser, updateRun } from "@/lib/pipeline/runs";
import { requeue } from "@/lib/pipeline/worker";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("paste"), text: z.string().trim().min(1).max(60_000) }),
  z.object({ action: z.literal("retry") }),
  z.object({ action: z.literal("rescore") }),
  z.object({ action: z.literal("unlock") }),
]);

export const POST = route(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser();
  const { id } = await ctx.params;
  const run = await getRunForUser(userId, id);
  if (!run) return notFound();

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return errorResponse("Unknown action.", 400);
  const body = parsed.data;

  if (body.action === "paste") {
    if (body.text.split(/\s+/).length < 30) return errorResponse("That description is too short to judge. Paste the full posting.", 400);
    await requeue(run, { inputText: body.text, fetched: null, job: null, verification: null, score: null, verdict: null, unlockedAt: null });
  } else if (body.action === "retry") {
    if (run.status !== "failed" && run.status !== "needs_input") return errorResponse("This run is not stopped.", 409);
    // A blocked fetch is retried from scratch; anything else resumes from the
    // first empty stage.
    await requeue(run, run.fetched && !run.fetched.ok ? { fetched: null } : {});
  } else if (body.action === "rescore") {
    if (run.status !== "done") return errorResponse("This run has not finished yet.", 409);
    await requeue(run, { score: null, verdict: null, unlockedAt: null });
  } else if (body.action === "unlock") {
    if (run.verdict !== "borderline") return errorResponse("Only borderline verdicts can be unlocked by hand.", 409);
    await updateRun(run, { unlockedAt: new Date() });
  }

  return json({ run: await getRunForUser(userId, id) });
});
