import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { Dashboard, type RunRow } from "@/components/dashboard";
import { currentUser } from "@/lib/auth";
import { listRuns } from "@/lib/pipeline/runs";
import { loadProfile, profileIsReady } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs" };

export default async function DashboardPage() {
  const user = await currentUser();
  const [runs, profile] = user ? await Promise.all([listRuns(user.id), loadProfile(user.id)]) : [[], null];
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
  const fullName = profile?.facts?.name ?? user?.name ?? null;
  return (
    <AppShell active="jobs">
      <Dashboard initialRuns={rows} profileReady={profileIsReady(profile)} firstName={fullName?.trim().split(/\s+/)[0] ?? null} />
    </AppShell>
  );
}
