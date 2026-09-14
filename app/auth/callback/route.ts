import { NextResponse } from "next/server";
import { claimSessionData } from "@/lib/account/claim";
import { currentUser, recordUser } from "@/lib/auth";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") && !raw.startsWith("/\\") ? raw : "/dashboard";
}

// Google and email-link sign-ins both land here with a one-time code, which is
// exchanged for a session. PKCE ties that code to the browser that started the
// sign-in, so a link opened in a different browser cannot be used by anyone else.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const next = safeNext(url.searchParams.get("next"));
  const code = url.searchParams.get("code");
  const failed = (reason: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}&next=${encodeURIComponent(next)}`, url.origin));

  const providerError = url.searchParams.get("error_description");
  if (providerError) return failed(providerError);
  if (!code) return failed("The sign-in link is missing its code. Request a new one.");

  const supabase = await createSupabaseServer();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    const sameBrowser = /code verifier|code_verifier|flow state/i.test(error.message);
    return failed(sameBrowser ? "Open the sign-in link in the same browser you requested it from." : "That sign-in link has expired or was already used. Request a new one.");
  }

  const user = await currentUser();
  const response = NextResponse.redirect(new URL(next, url.origin));
  if (!user) return response;
  await recordUser(user);

  // Anything done in this browser before signing in belongs to this account now.
  const cookieHeader = request.headers.get("cookie") ?? "";
  const legacy = /(?:^|;\s*)ja_session=([^;]+)/.exec(cookieHeader)?.[1];
  const anonId = verifySessionValue(legacy ? decodeURIComponent(legacy) : null);
  if (anonId && anonId !== user.id) {
    const moved = await claimSessionData(anonId, user.id);
    if (moved.runs || moved.profile) console.log(`[auth] moved ${moved.runs} run(s)${moved.profile ? " and a profile" : ""} into account ${user.id}`);
  }
  if (anonId) response.cookies.set(SESSION_COOKIE, "", { path: "/", maxAge: 0 });
  return response;
}
