import { Briefcase, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import { REPO_URL } from "@/lib/brand";
import { cx } from "@/lib/cx";
import { Logo } from "./logo";
import { Github } from "./site-chrome";

const NAV = [
  { key: "jobs", href: "/dashboard", label: "Jobs", icon: Briefcase },
  { key: "profile", href: "/profile", label: "Profile", icon: UserRound },
] as const;

export async function AppShell({ children, active }: { children: ReactNode; active?: "jobs" | "profile" }) {
  const user = await currentUser();
  const label = user?.name ?? user?.email ?? null;

  return (
    <div className="min-h-dvh bg-surface md:flex">
      <aside className="sticky top-0 z-20 border-b border-line bg-surface/90 backdrop-blur md:h-dvh md:w-60 md:shrink-0 md:border-r md:border-b-0 md:backdrop-blur-none">
        <div className="flex h-14 items-center justify-between gap-3 px-4 md:h-auto md:flex-col md:items-stretch md:gap-0 md:px-3 md:py-5">
          <Logo href="/dashboard" className="md:px-2" />
          <nav className="flex items-center gap-1 md:mt-8 md:flex-col md:items-stretch" aria-label="Main">
            {NAV.map(({ key, href, label: navLabel, icon: Icon }) => {
              const isActive = active === key;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={cx(
                    "flex h-9 items-center gap-2.5 rounded-md px-3 text-[14px] font-medium transition-colors",
                    isActive ? "bg-base text-ink shadow-[var(--shadow-sm)] ring-1 ring-line" : "text-ink-2 hover:bg-sunken hover:text-ink",
                  )}
                >
                  <Icon className="size-4" aria-hidden />
                  <span className={cx(!isActive && "sr-only sm:not-sr-only")}>{navLabel}</span>
                </Link>
              );
            })}
            {user && !user.local && (
              <form action="/auth/signout" method="post" className="md:hidden">
                <button type="submit" aria-label="Sign out" className="flex h-9 items-center rounded-md px-3 text-ink-2 hover:bg-sunken hover:text-ink">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            )}
          </nav>
        </div>

        <div className="absolute inset-x-0 bottom-0 hidden space-y-1 border-t border-line p-3 md:block">
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="flex h-8 items-center gap-2.5 rounded-md px-3 text-[13px] text-ink-2 hover:bg-sunken hover:text-ink">
            <Github className="size-4" /> Open source
          </a>
          {user && !user.local && (
            <div className="rounded-md p-2">
              <div className="flex items-center gap-2.5">
                {user.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={user.avatarUrl} alt="" className="size-8 rounded-full ring-1 ring-line" referrerPolicy="no-referrer" />
                ) : (
                  <span className="flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-semibold text-white" aria-hidden>
                    {(label ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {user.name && <p className="truncate text-[13px] leading-4 font-medium text-ink">{user.name}</p>}
                  {user.email && <p className="truncate text-[12px] leading-4 text-muted">{user.email}</p>}
                </div>
                <form action="/auth/signout" method="post">
                  <button type="submit" aria-label="Sign out" title="Sign out" className="flex size-8 items-center justify-center rounded-md text-muted hover:bg-sunken hover:text-ink">
                    <LogOut className="size-4" aria-hidden />
                  </button>
                </form>
              </div>
            </div>
          )}
        </div>
      </aside>
      <main id="main" className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
