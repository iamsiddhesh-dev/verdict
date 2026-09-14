import { requireUser } from "@/lib/auth";
import { json, notFound, route } from "@/lib/http";
import { getRunForUser } from "@/lib/pipeline/runs";

export const GET = route(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const userId = await requireUser();
  const { id } = await ctx.params;
  const run = await getRunForUser(userId, id);
  if (!run) return notFound();
  return json({ run });
});
