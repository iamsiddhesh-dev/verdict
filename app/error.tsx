"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex min-h-[60dvh] w-full max-w-[720px] flex-col items-start justify-center px-5 py-16">
      <p className="font-mono text-[14px] text-muted">Something broke</p>
      <h1 className="mt-3 text-[32px] leading-10 font-semibold tracking-[-0.02em] text-ink">This page hit an error.</h1>
      <p className="mt-3 text-[16px] leading-6 text-ink-2">
        Your data is safe. Any job that was being checked keeps running on the server. Trying again usually works.
      </p>
      {error.digest && <p className="mt-2 font-mono text-[12px] text-muted">Reference: {error.digest}</p>}
      <div className="mt-8 flex gap-3">
        <button type="button" onClick={reset} className="inline-flex h-10 items-center gap-2 rounded-md bg-ink px-4 text-[14px] font-medium text-white hover:bg-ink/85">
          <RotateCcw className="size-4" aria-hidden /> Try again
        </button>
        <Link href="/dashboard" className="inline-flex h-10 items-center rounded-md border border-line-strong bg-base px-4 text-[14px] font-medium text-ink hover:bg-surface">
          Your jobs
        </Link>
      </div>
    </div>
  );
}
