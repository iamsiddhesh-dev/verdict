import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME, REPO_URL } from "@/lib/brand";
import { Logo } from "./logo";

/** Lucide dropped brand icons, so the GitHub mark is drawn here. */
export function Github({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.53-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.56-.29-5.25-1.28-5.25-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.84 1.19 3.1 0 4.43-2.7 5.4-5.27 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z" />
    </svg>
  );
}

/** Header and footer for public pages: landing, privacy, terms, 404. */
export function SiteHeader({ signedIn }: { signedIn?: boolean }) {
  return (
    <header className="sticky top-0 z-30 border-b border-transparent bg-base/85 backdrop-blur supports-[backdrop-filter]:bg-base/70">
      <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center justify-between gap-4 px-5 md:px-10">
        <Logo />
        <nav className="flex items-center gap-1 text-[14px] font-medium">
          <Link href="/#how" className="hidden rounded-sm px-3 py-2 text-ink-2 hover:text-ink sm:block">
            How it works
          </Link>
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hidden items-center gap-1.5 rounded-sm px-3 py-2 text-ink-2 hover:text-ink sm:inline-flex">
            <Github className="size-4" aria-hidden /> GitHub
          </a>
          <Link
            href={signedIn ? "/dashboard" : "/login"}
            className="ml-2 inline-flex h-9 items-center rounded-md bg-ink px-4 text-[14px] font-medium text-white transition-colors hover:bg-ink/85"
          >
            {signedIn ? "Open app" : "Sign in"}
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line">
      <div className="mx-auto flex w-full max-w-[1120px] flex-col gap-6 px-5 py-10 text-[14px] text-ink-2 md:flex-row md:items-center md:justify-between md:px-10">
        <div className="space-y-1.5">
          <Logo />
          <p className="text-[13px] text-muted">Free, open source, and nothing is ever sent or submitted for you.</p>
        </div>
        <nav className="flex flex-wrap gap-x-6 gap-y-2">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-ink">
            GitHub
          </a>
          <Link href="/privacy" className="hover:text-ink">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-ink">
            Terms
          </Link>
          <span className="text-muted">© {new Date().getFullYear()} {PRODUCT_NAME}</span>
        </nav>
      </div>
    </footer>
  );
}

export function PublicPage({ children, signedIn }: { children: ReactNode; signedIn?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader signedIn={signedIn} />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
