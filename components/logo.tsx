import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import { cx } from "@/lib/cx";

/** A check inside a rounded square: the verdict. Same drawing as app/icon.svg. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={cx("size-7 shrink-0", className)} aria-hidden>
      <rect width="32" height="32" rx="8" fill="var(--color-ink)" />
      <path d="M9.5 16.5l4.25 4.25L22.5 12" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cx("inline-flex items-center gap-2.5 rounded-sm text-[17px] font-semibold tracking-[-0.02em] text-ink", className)}>
      <LogoMark />
      {PRODUCT_NAME}
    </Link>
  );
}
