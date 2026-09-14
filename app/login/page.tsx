import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Logo } from "@/components/logo";
import { SignIn } from "@/components/sign-in";
import { currentUser } from "@/lib/auth";
import { authConfigured, requireAuthConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (!authConfigured()) redirect(safeNext);
  if (await currentUser()) redirect(safeNext);

  return (
    <main id="main" className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5 py-12">
      <div className="w-full max-w-[400px]">
        <div className="flex justify-center">
          <Logo />
        </div>
        <div className="mt-8 rounded-xl border border-line bg-base p-8 shadow-[var(--shadow-sm)]">
          <h1 className="text-[22px] leading-7 font-semibold tracking-[-0.01em] text-ink">Sign in to Verdict</h1>
          <p className="mt-2 text-[14px] leading-5 text-ink-2">Your profile, every job you check and everything written for you are saved to your account, on any device.</p>
          <SignIn next={safeNext} initialError={error ?? null} supabase={requireAuthConfig()} />
        </div>
        <p className="mt-6 text-center text-[12px] leading-5 text-muted">
          By continuing you agree to the{" "}
          <Link href="/terms" className="underline underline-offset-2 hover:text-ink">
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" className="underline underline-offset-2 hover:text-ink">
            Privacy
          </Link>
          . Nothing is ever sent on your behalf.
        </p>
      </div>
    </main>
  );
}
