// Copy everything from the local PGlite database into DATABASE_URL.
//   npm run copy:local
// For moving from local development onto Supabase without losing profiles, runs
// or generated drafts. Safe to run twice: rows that already exist are skipped.

import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import postgres from "postgres";
import { getDb } from "@/lib/db";

const url = process.env.DATABASE_URL?.trim();
if (!url) throw new Error("Set DATABASE_URL to the database to copy into.");

await getDb(); // runs migrations on the target first

const source = new PGlite(path.join(process.cwd(), ".data", "pglite"));
const target = postgres(url, { max: 1, prepare: false, ssl: "require" });

// Parents before children, so foreign keys are satisfied.
const TABLES: Array<{ name: string; key: string[] }> = [
  { name: "users", key: ["id"] },
  { name: "profiles", key: ["user_id"] },
  { name: "runs", key: ["id"] },
  { name: "artifacts", key: ["id"] },
  { name: "company_checks", key: ["domain"] },
  { name: "llm_cache", key: ["task", "prompt_hash"] },
  { name: "llm_usage", key: ["day", "provider", "model", "key_id"] },
];

const JSONB = new Set(["facts", "events", "fetched", "job", "verification", "score", "input", "content", "data", "result"]);

for (const { name, key } of TABLES) {
  const { rows } = await source.query<Record<string, unknown>>(`SELECT * FROM ${name}`);
  let copied = 0;
  for (const row of rows) {
    const values: Record<string, unknown> = {};
    for (const [col, v] of Object.entries(row)) {
      values[col] = JSONB.has(col) && v !== null ? target.json(v as never) : v;
    }
    const result = await target`
      INSERT INTO ${target(name)} ${target(values)}
      ON CONFLICT (${target(key)}) DO NOTHING
    `;
    copied += result.count;
  }
  console.log(`${name}: ${rows.length} local, ${copied} copied`);
}

await source.close();
await target.end({ timeout: 5 });
process.exit(0);
