// Moving work done before sign-in into the account.
//
// Someone who set up a profile and checked jobs in a browser session before
// accounts existed (or before they signed in) should find all of it in their
// account afterwards. Runs always move. The profile moves only if the account
// does not already have one, so signing in on a second machine never overwrites
// a profile the account already holds.

import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";

export async function claimSessionData(fromUserId: string, toUserId: string): Promise<{ runs: number; profile: boolean }> {
  if (fromUserId === toUserId) return { runs: 0, profile: false };
  const db = await getDb();
  return db.transaction(async (tx) => {
    const exec = async <T>(q: ReturnType<typeof sql>) => {
      const r = (await tx.execute(q)) as unknown;
      return (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
    };
    const profile = await exec<{ user_id: string }>(sql`
      UPDATE profiles SET user_id = ${toUserId}::uuid, updated_at = now()
      WHERE user_id = ${fromUserId}::uuid
        AND NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = ${toUserId}::uuid)
      RETURNING user_id
    `);
    const moved = await exec<{ id: string }>(sql`
      UPDATE runs SET user_id = ${toUserId}::uuid WHERE user_id = ${fromUserId}::uuid RETURNING id
    `);
    await exec(sql`
      DELETE FROM users WHERE id = ${fromUserId}::uuid
        AND NOT EXISTS (SELECT 1 FROM profiles WHERE user_id = ${fromUserId}::uuid)
        AND NOT EXISTS (SELECT 1 FROM runs WHERE user_id = ${fromUserId}::uuid)
    `);
    return { runs: moved.length, profile: profile.length > 0 };
  });
}
