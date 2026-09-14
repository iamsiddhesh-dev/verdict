import { AppShell } from "@/components/app-shell";
import { ProfileSetup } from "@/components/profile-setup";
import { currentUserId } from "@/lib/auth";
import { loadProfile } from "@/lib/profile";

export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  const userId = await currentUserId();
  const profile = userId ? await loadProfile(userId) : null;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  return (
    <AppShell active="profile">
      <ProfileSetup
        next={safeNext}
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
