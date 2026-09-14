"use client";

import { ArrowRight, Link2, TextCursorInput } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { RunView } from "@/lib/pipeline/runs";
import { Button, Textarea, cx } from "./ui/primitives";
import { api } from "./use-live";

/** A single link on its own is a URL. Anything longer is a pasted description. */
export function classifyInput(raw: string): { kind: "url"; url: string } | { kind: "text"; text: string } | { kind: "empty" } {
  const s = raw.trim();
  if (!s) return { kind: "empty" };
  if (!/\s/.test(s) && /^(https?:\/\/)?[\w-]+(\.[\w-]+)+(\/\S*)?$/i.test(s)) {
    return { kind: "url", url: /^https?:\/\//i.test(s) ? s : `https://${s}` };
  }
  return { kind: "text", text: s };
}

export function PasteBox({ autoFocus, size = "md" }: { autoFocus?: boolean; size?: "md" | "lg" }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = classifyInput(value);

  const submit = async () => {
    if (input.kind === "empty") return;
    setBusy(true);
    setError(null);
    try {
      const { run } = await api<{ run: RunView }>("/api/runs", {
        method: "POST",
        json: input.kind === "url" ? { url: input.url } : { text: input.text },
      });
      router.push(`/runs/${run.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start.");
      setBusy(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className={cx("rounded-lg border bg-base shadow-[var(--shadow-sm)] focus-within:border-accent focus-within:ring-1 focus-within:ring-accent", error ? "border-skip" : "border-line-strong")}
    >
      <Textarea
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          if (e.key === "Enter" && !e.shiftKey && input.kind === "url") {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={"Paste a job link, like https://jobs.ashbyhq.com/company/role\nor paste the whole job description"}
        aria-label="Job link or description"
        className={cx("resize-none border-0 bg-transparent px-4 focus-visible:outline-none", size === "lg" ? "min-h-32 py-4 text-[16px] leading-6" : "min-h-24 py-3")}
      />
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-3 py-2">
        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted" aria-live="polite">
          {input.kind === "url" && (
            <>
              <Link2 className="size-4" aria-hidden /> Link
            </>
          )}
          {input.kind === "text" && (
            <>
              <TextCursorInput className="size-4" aria-hidden /> Description, {input.text.split(/\s+/).length} words
            </>
          )}
          {input.kind === "empty" && "Links from LinkedIn and X need the text pasted instead."}
        </span>
        <div className="flex items-center gap-3">
          {error && <span className="text-[13px] text-skip">{error}</span>}
          <Button type="submit" size={size === "lg" ? "md" : "sm"} loading={busy} disabled={input.kind === "empty"} icon={<ArrowRight className="size-4" />}>
            Get verdict
          </Button>
        </div>
      </div>
    </form>
  );
}
