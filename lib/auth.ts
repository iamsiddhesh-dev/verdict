// Who is making this request.
//
// Accounts are Supabase Auth users (Google, or an email link). A person's
// profile, runs and generated drafts are keyed on their auth user id, so they
// follow the account to any browser or device and survive cleared cookies.
//
// Local development without Supabase keys falls back to the signed anonymous
// cookie from lib/session.ts, so the app still runs with zero setup. That
// fallback is refused in production.

import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { fromClaims, localFallbackAllowed, type Claims, type SessionUser } from "@/lib/auth-claims";
import { queryRows } from "@/lib/db";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";
import { createSupabaseServer } from "@/lib/supabase/server";

export type { SessionUser } from "@/lib/auth-claims";

export class UnauthenticatedError extends Error {}

export async function currentUser(): Promise<SessionUser | null> {
  if (localFallbackAllowed()) {
    const jar = await cookies();
    const id = verifySessionValue(jar.get(SESSION_COOKIE)?.value);
    return id ? { id, email: null, name: null, avatarUrl: null, local: true } : null;
  }
  const supabase = await createSupabaseServer();
  // getClaims verifies the access token's signature (locally, against the
  // project's published keys) instead of trusting whatever the cookie says.
  const { data } = await supabase.auth.getClaims();
  return fromClaims(data?.claims as Claims | undefined);
}

export async function currentUserId(): Promise<string | null> {
  return (await currentUser())?.id ?? null;
}

/** Keep the users row in step with the account. Writes at most every ten minutes per user. */
export async function recordUser(user: SessionUser): Promise<void> {
  await queryRows(sql`
    INSERT INTO users (id, email, display_name, avatar_url, last_seen_at)
    VALUES (${user.id}::uuid, ${user.email}, ${user.name}, ${user.avatarUrl}, now())
    ON CONFLICT (id) DO UPDATE SET
      email = COALESCE(EXCLUDED.email, users.email),
      display_name = COALESCE(EXCLUDED.display_name, users.display_name),
      avatar_url = COALESCE(EXCLUDED.avatar_url, users.avatar_url),
      last_seen_at = now()
    WHERE users.last_seen_at IS NULL
       OR users.last_seen_at < now() - interval '10 minutes'
       OR users.email IS DISTINCT FROM COALESCE(EXCLUDED.email, users.email)
  `);
}

export async function requireUser(): Promise<string> {
  const user = await currentUser();
  if (!user) throw new UnauthenticatedError("Not signed in");
  await recordUser(user);
  return user.id;
}
