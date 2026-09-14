"use client";

import { Check, Copy, Loader2 } from "lucide-react";
import { cx } from "@/lib/cx";
import { forwardRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

export { cx };

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-ink text-white hover:bg-ink/85 disabled:bg-ink/40",
  secondary: "bg-base text-ink border border-line-strong hover:bg-surface disabled:text-muted",
  ghost: "text-ink-2 hover:bg-sunken hover:text-ink disabled:text-muted",
  danger: "bg-skip text-white hover:bg-skip/90 disabled:bg-skip/50",
};

const SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-[14px] gap-1.5",
  md: "h-10 px-4 text-[14px] gap-2",
  lg: "h-12 px-5 text-[16px] gap-2",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", loading, icon, children, className, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "relative inline-flex shrink-0 items-center justify-center rounded-md font-medium transition-colors disabled:cursor-not-allowed",
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {/* The label keeps its space while loading so the button never changes width. */}
      <span className={cx("inline-flex items-center gap-[inherit]", loading && "invisible")}>
        {icon}
        {children}
      </span>
      {loading && <Loader2 className="absolute size-4 animate-[spin_0.8s_linear_infinite]" aria-label="Working" />}
    </button>
  );
});

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  const hasBg = /(^|\s)bg-/.test(className ?? "");
  return <div className={cx("rounded-md border border-line p-6", !hasBg && "bg-surface", className)}>{children}</div>;
}

export function Label({ children, htmlFor, hint }: { children: ReactNode; htmlFor?: string; hint?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 flex items-baseline justify-between gap-3 text-[14px] font-medium text-ink">
      <span>{children}</span>
      {hint && <span className="text-[12px] font-normal text-muted">{hint}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { invalid?: boolean }>(function Input(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        "h-10 w-full rounded-sm border bg-base px-3 text-[14px] text-ink placeholder:text-muted focus-visible:outline-2",
        invalid ? "border-skip" : "border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement> & { invalid?: boolean }>(function Textarea(
  { className, invalid, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(
        "min-h-40 w-full resize-y rounded-sm border bg-base px-3 py-2.5 text-[14px] leading-5 text-ink placeholder:text-muted",
        invalid ? "border-skip" : "border-line-strong",
        className,
      )}
      {...rest}
    />
  );
});

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1.5 text-[13px] text-skip">{children}</p>;
}

export function Helper({ children }: { children: ReactNode }) {
  return <p className="mt-1.5 text-[13px] text-muted">{children}</p>;
}

export function CopyButton({ text, label = "Copy", size = "sm" }: { text: string; label?: string; size?: ButtonSize }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size={size}
      icon={copied ? <Check className="size-4 text-apply" /> : <Copy className="size-4" />}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? "Copied" : label}
    </Button>
  );
}

export function Callout({
  tone,
  icon,
  title,
  children,
  className,
}: {
  tone: "info" | "apply" | "borderline" | "skip" | "neutral";
  icon?: ReactNode;
  title?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-info-bg border-info-line text-info",
    apply: "bg-apply-bg border-apply-line text-apply",
    borderline: "bg-borderline-bg border-borderline-line text-borderline",
    skip: "bg-skip-bg border-skip-line text-skip",
    neutral: "bg-surface border-line text-ink-2",
  };
  return (
    <div className={cx("flex gap-3 rounded-md border p-4", tones[tone], className)}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 text-[14px] leading-5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx("text-ink-2", title ? "mt-1" : undefined)}>{children}</div>}
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse-soft rounded-sm bg-sunken", className)} />;
}
