import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { RunScreen } from "@/components/run-screen";
import { currentUserId } from "@/lib/auth";
import { getRunForUser } from "@/lib/pipeline/runs";
import { loadProfile, profileIsReady } from "@/lib/profile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const userId = await currentUserId();
  const run = userId ? await getRunForUser(userId, id) : null;
  const title = run?.job?.title ?? (run?.fetched?.ok ? run.fetched.job.title : null);
  const company = run?.job?.company ?? (run?.fetched?.ok ? run.fetched.job.company : null);
  return { title: title ? `${title}${company ? ` at ${company}` : ""}` : "Checking a job", robots: { index: false } };
}

export default async function RunPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await currentUserId();
  if (!userId) notFound();
  const [run, profile] = await Promise.all([getRunForUser(userId, id), loadProfile(userId)]);
  if (!run) notFound();
  return (
    <AppShell active="jobs">
      <RunScreen initialRun={run} profileReady={profileIsReady(profile)} hasMasterTex={Boolean(profile?.masterTex)} />
    </AppShell>
  );
}
