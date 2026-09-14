// Account identity from verified Supabase claims, and the WebSocket's version of
// the session check. Nothing here imports next/headers, because server.ts loads
// this module before Next.js has started.

import { createServerClient, parseCookieHeader } from "@supabase/ssr";
import { verifySessionValue } from "@/lib/session";
import { authConfigured, requireAuthConfig } from "@/lib/supabase/config";

export interface SessionUser {
  id: string;
  email: string | null;
  name: string | null;
  avatarUrl: string | null;
  /** True only for the local-development fallback. */
  local: boolean;
}

export type Claims = {
  sub?: string;
  email?: string;
  is_anonymous?: boolean;
  user_metadata?: { full_name?: string; name?: string; avatar_url?: string; picture?: string };
};

export function fromClaims(c: Claims | null | undefined): SessionUser | null {
  if (!c?.sub || c.is_anonymous) return null;
  const meta = c.user_metadata ?? {};
  return {
    id: c.sub,
    email: c.email ?? null,
    name: meta.full_name ?? meta.name ?? null,
    avatarUrl: meta.avatar_url ?? meta.picture ?? null,
    local: false,
  };
}

export function localFallbackAllowed(): boolean {
  return !authConfigured() && process.env.NODE_ENV !== "production";
}

/** The session check for the WebSocket upgrade, which only has the raw Cookie header. */
export async function userIdFromCookieHeader(header: string | undefined): Promise<string | null> {
  if (localFallbackAllowed()) {
    const match = /(?:^|;\s*)ja_session=([^;]+)/.exec(header ?? "");
    return verifySessionValue(match ? decodeURIComponent(match[1]) : null);
  }
  const { url, key } = requireAuthConfig();
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => parseCookieHeader(header ?? "").map((c) => ({ name: c.name, value: c.value ?? "" })),
      setAll: () => {},
    },
  });
  const { data } = await client.auth.getClaims();
  return fromClaims(data?.claims as Claims | undefined)?.id ?? null;
}
