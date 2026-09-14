import { Briefcase, UserRound } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { PRODUCT_NAME } from "@/lib/brand";

const NAV = [
  { href: "/dashboard", label: "Jobs", icon: Briefcase },
  { href: "/profile", label: "Profile", icon: UserRound },
];

export function AppShell({ children, active }: { children: ReactNode; active?: "jobs" | "profile" }) {
  return (
    <div className="min-h-dvh md:flex">
      <aside className="border-b border-line bg-surface md:sticky md:top-0 md:h-dvh md:w-56 md:shrink-0 md:border-r md:border-b-0">
        <div className="flex items-center justify-between gap-4 px-5 py-3 md:block md:py-6">
          <Link href="/dashboard" className="text-[18px] font-semibold tracking-[-0.01em] text-ink">
            {PRODUCT_NAME}
          </Link>
          <nav className="flex gap-1 md:mt-8 md:flex-col">
            {NAV.map(({ href, label, icon: Icon }) => {
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
                  {label}
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto w-full max-w-[1120px] px-5 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
