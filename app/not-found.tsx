import { ArrowLeft } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/site-chrome";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <PublicPage>
      <div className="mx-auto flex w-full max-w-[1120px] flex-col items-start px-5 py-24 md:px-10 md:py-32">
        <p className="font-mono text-[14px] text-muted">404</p>
        <h1 className="mt-3 text-[36px] leading-11 font-semibold tracking-[-0.02em] text-ink">This page does not exist.</h1>
        <p className="mt-3 max-w-lg text-[16px] leading-6 text-ink-2">
          The link may be wrong, or it may point to a job checked under a different account. Jobs are only visible to the account that checked them.
        </p>
        <Link href="/dashboard" className="mt-8 inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink/85">
          <ArrowLeft className="size-4" aria-hidden /> Back to your jobs
        </Link>
      </div>
    </PublicPage>
  );
}
