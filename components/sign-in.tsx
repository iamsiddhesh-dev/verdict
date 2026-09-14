"use client";

import { Mail, MailCheck } from "lucide-react";
import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button, Callout, Input, Label } from "./ui/primitives";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7Z" />
      <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1Z" />
      <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
    </svg>
  );
}

export function SignIn({ next, initialError, supabase }: { next: string; initialError: string | null; supabase: { url: string; key: string } }) {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(initialError);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const redirectTo = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  const google = async () => {
    setBusy("google");
    setError(null);
    const { error: err } = await createSupabaseBrowser(supabase).auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirectTo() } });
    // On success the browser is already leaving for Google.
    if (err) {
      setError(err.message);
      setBusy(null);
    }
  };

  const emailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    const address = email.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) {
      setError("Enter a valid email address.");
      return;
    }
    setBusy("email");
    setError(null);
    const { error: err } = await createSupabaseBrowser(supabase).auth.signInWithOtp({ email: address, options: { emailRedirectTo: redirectTo() } });
    setBusy(null);
    if (err) {
      setError(/rate limit|too many/i.test(err.message) ? "Too many sign-in emails were requested. Wait a few minutes, or sign in with Google." : err.message);
      return;
    }
    setSentTo(address);
  };

  if (sentTo) {
    return (
      <div className="mt-6 space-y-4">
        <Callout tone="info" icon={<MailCheck className="size-4" />} title="Check your email">
          A sign-in link is on its way to <span className="font-medium text-ink">{sentTo}</span>. Open it in this browser to finish signing in.
        </Callout>
        <Button variant="ghost" size="sm" onClick={() => setSentTo(null)}>
          Use a different email
        </Button>
      </div>
    );
  }

  return (
    <div className="mt-6 space-y-5">
      {error && <Callout tone="skip">{error}</Callout>}

      <Button variant="secondary" size="lg" className="w-full" icon={<GoogleMark />} loading={busy === "google"} disabled={busy !== null} onClick={google}>
        Continue with Google
      </Button>

      <div className="flex items-center gap-3 text-[12px] text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
      </div>

      <form onSubmit={emailLink} noValidate>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        <Button type="submit" size="lg" className="mt-3 w-full" icon={<Mail className="size-4" />} loading={busy === "email"} disabled={busy !== null}>
          Email me a sign-in link
        </Button>
      </form>
    </div>
  );
}
