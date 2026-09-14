// Request-side identity for route handlers and server components.

import { cookies } from "next/headers";
import { sql } from "drizzle-orm";
import { queryRows } from "@/lib/db";
import { SESSION_COOKIE, verifySessionValue } from "@/lib/session";

export class UnauthenticatedError extends Error {}

/** The signed-in (anonymous or not) user id, or null. */
export async function currentUserId(): Promise<string | null> {
  const jar = await cookies();
  return verifySessionValue(jar.get(SESSION_COOKIE)?.value);
}

/**
 * The user id, with its `users` row created on first use. Rows are created
 * lazily so a visitor who only reads the landing page never becomes a row.
 */
export async function requireUser(): Promise<string> {
  const id = await currentUserId();
  if (!id) throw new UnauthenticatedError("No session");
  await queryRows(sql`INSERT INTO users (id) VALUES (${id}::uuid) ON CONFLICT DO NOTHING`);
  return id;
}
