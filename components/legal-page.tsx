import type { ReactNode } from "react";
import { PublicPage } from "./site-chrome";

export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <PublicPage>
      <article className="mx-auto w-full max-w-[720px] px-5 py-16 md:py-20">
        <h1 className="text-[36px] leading-11 font-semibold tracking-[-0.02em] text-ink">{title}</h1>
        <p className="mt-2 text-[14px] text-muted">Last updated {updated}</p>
        <div className="mt-10 space-y-8 text-[16px] leading-7 text-ink-2 [&_a]:text-ink [&_a]:underline [&_a]:underline-offset-2 [&_h2]:mb-2 [&_h2]:text-[20px] [&_h2]:leading-7 [&_h2]:font-semibold [&_h2]:text-ink [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {children}
        </div>
      </article>
    </PublicPage>
  );
}
