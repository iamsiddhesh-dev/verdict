import Link from "next/link";
import { redirect } from "next/navigation";
import { SignIn } from "@/components/sign-in";
import { currentUser } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";
import { authConfigured, requireAuthConfig } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  if (!authConfigured()) redirect(safeNext);
  if (await currentUser()) redirect(safeNext);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-surface px-5 py-12">
      <div className="w-full max-w-[400px] rounded-lg border border-line bg-base p-8 shadow-[var(--shadow-sm)]">
        <Link href="/" className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
          {PRODUCT_NAME}
        </Link>
        <h1 className="mt-6 text-[24px] leading-8 font-semibold tracking-[-0.01em] text-ink">Sign in</h1>
        <p className="mt-2 text-[14px] leading-5 text-ink-2">
          Your profile, every job you check and everything written for you are saved to your account, on any device.
        </p>
        <SignIn next={safeNext} initialError={error ?? null} supabase={requireAuthConfig()} />
      </div>
      <p className="mt-6 max-w-[400px] text-center text-[12px] leading-4 text-muted">Nothing is ever sent or submitted on your behalf.</p>
    </div>
  );
}
