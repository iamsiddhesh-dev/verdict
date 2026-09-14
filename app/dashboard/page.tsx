import { AppShell } from "@/components/app-shell";
import { Dashboard, type RunRow } from "@/components/dashboard";
import { currentUserId } from "@/lib/auth";
import { listRuns } from "@/lib/pipeline/runs";
import { loadProfile, profileIsReady } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const userId = await currentUserId();
  const [runs, profile] = userId ? await Promise.all([listRuns(userId), loadProfile(userId)]) : [[], null];
  const rows: RunRow[] = runs.map((r) => ({
    id: r.id,
    status: r.status,
    stage: r.stage,
    verdict: r.verdict,
    score: r.score?.score ?? null,
    title: r.job?.title ?? (r.fetched?.ok ? r.fetched.job.title : null),
    company: r.job?.company ?? (r.fetched?.ok ? r.fetched.job.company : null),
    inputUrl: r.inputUrl,
    createdAt: r.createdAt,
  }));
  return (
    <AppShell active="jobs">
      <Dashboard initialRuns={rows} profileReady={profileIsReady(profile)} />
    </AppShell>
  );
}
