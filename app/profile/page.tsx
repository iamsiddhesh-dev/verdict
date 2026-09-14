import type { Metadata } from "next";
import { AppShell } from "@/components/app-shell";
import { ProfileOverview } from "@/components/profile-overview";
import { ProfileSetup } from "@/components/profile-setup";
import { currentUser } from "@/lib/auth";
import { loadProfile, profileIsReady } from "@/lib/profile";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Profile" };

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string; edit?: string }> }) {
  const { next, edit } = await searchParams;
  const user = await currentUser();
  const profile = user ? await loadProfile(user.id) : null;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const editStep = edit !== undefined ? Math.max(0, Math.min(3, Number(edit) || 0)) : null;

  // A confirmed profile opens as an overview; setup is for first time and for edits.
  if (profileIsReady(profile) && editStep === null && !next) {
    return (
      <AppShell active="profile">
        <ProfileOverview
          data={{
            facts: profile.facts,
            resumeFilename: profile.resumeFilename,
            hasResumeFile: profile.hasResumeFile,
            hasMasterTex: Boolean(profile.masterTex),
            githubUrl: profile.githubUrl,
            linkedinUrl: profile.linkedinUrl,
            portfolioUrl: profile.portfolioUrl,
            preferences: profile.preferences,
            email: user?.email ?? null,
          }}
        />
      </AppShell>
    );
  }

  return (
    <AppShell active="profile">
      <ProfileSetup
        next={profileIsReady(profile) && !next ? "/profile" : safeNext}
        initialStep={editStep}
        initial={
          profile
            ? {
                facts: profile.facts,
                resumeFilename: profile.resumeFilename,
                githubUrl: profile.githubUrl ?? "",
                linkedinUrl: profile.linkedinUrl ?? "",
                portfolioUrl: profile.portfolioUrl ?? "",
                preferences: profile.preferences ?? "",
                hasMasterTex: Boolean(profile.masterTex),
                confirmed: Boolean(profile.confirmedAt),
              }
            : null
        }
      />
    </AppShell>
  );
}
