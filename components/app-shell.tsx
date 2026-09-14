import { Briefcase, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { currentUser } from "@/lib/auth";
import { PRODUCT_NAME } from "@/lib/brand";

const NAV = [
  { href: "/dashboard", label: "Jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export async function AppShell({ children, active }: { children: ReactNode; active?: "jobs" | "profile" }) {
  const user = await currentUser();
  const label = user?.name ?? user?.email ?? null;

  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:flex md:h-dvh md:w-56 md:shrink-0 md:flex-col md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-3 md:block md:py-6">
          <Link href="/dashboard" className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
            {PRODUCT_NAME}
          </Link>
          <nav className="flex gap-1 md:mt-8 md:flex-col">
            {NAV.map(({ href, label: navLabel, icon: Icon }) => {
              const isActive = (active === "jobs" && href === "/dashboard") || (active === "profile" && href === "/profile");
              return (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive ? "page" : undefined}
                  className={`flex h-9 items-center gap-2 rounded-sm px-3 text-[14px] font-medium ${
                    isActive ? "bg-base text-ink shadow-[var(--shadow-sm)] ring-1 ring-line" : "text-ink-2 hover:bg-sunken hover:text-ink"
                  }`}
                >
                  <Icon className="size-4" aria-hidden />
                  {navLabel}
                </Link>
              );
            })}
            {user && !user.local && (
              <form action="/auth/signout" method="post" className="md:hidden">
                <button type="submit" aria-label="Sign out" className="flex h-9 items-center rounded-sm px-3 text-ink-2 hover:bg-sunken hover:text-ink">
                  <LogOut className="size-4" aria-hidden />
                </button>
              </form>
            )}
          </nav>
        </div>

        {user && !user.local && (
          <div className="hidden border-t border-line px-3 py-3 md:mt-auto md:block">
            <div className="flex items-center gap-2.5 px-2">
              {user.avatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={user.avatarUrl} alt="" className="size-7 rounded-full" referrerPolicy="no-referrer" />
              ) : (
                <span className="flex size-7 items-center justify-center rounded-full bg-accent-subtle text-[12px] font-semibold text-accent" aria-hidden>
                  {(label ?? "?").slice(0, 1).toUpperCase()}
                </span>
              )}
              <div className="min-w-0">
                {user.name && <p className="truncate text-[13px] font-medium text-ink">{user.name}</p>}
                {user.email && <p className="truncate text-[12px] text-muted">{user.email}</p>}
              </div>
            </div>
            <form action="/auth/signout" method="post" className="mt-2">
              <button type="submit" className="flex h-8 w-full items-center gap-2 rounded-sm px-2 text-[13px] font-medium text-ink-2 hover:bg-sunken hover:text-ink">
                <LogOut className="size-4" aria-hidden /> Sign out
              </button>
            </form>
          </div>
        )}
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
