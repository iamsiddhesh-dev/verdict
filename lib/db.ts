// One database handle for the whole process.
//
// With DATABASE_URL set (Supabase free tier in production) this is a normal
// postgres-js pool. Supabase over Neon, deliberately: the worker polls the queue
// every few seconds, which would keep a Neon compute awake around the clock and
// spend its 100 compute-hours a month in under three weeks. Supabase has no
// compute-hour cap, and that same activity keeps a free project from pausing.
// Use the Session pooler connection string: the direct one is IPv6-only on the
// free plan, and most free hosts have no IPv6. Without it, the app runs on PGlite: real Postgres
// compiled to WASM, stored in .data/pglite. That keeps local development at zero
// setup and zero cost, and because it is actual Postgres, the queue's
// FOR UPDATE SKIP LOCKED and the quota's ON CONFLICT ... WHERE behave the same
// way they will in production.
//
// The handle lives on globalThis. The custom server (server.ts) and Next's
// bundled route handlers each import this file through their own module graph,
// and two PGlite instances over one data directory would corrupt it.

import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import type { SQL } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "@/db/schema";

export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

interface DbState {
  db: Db;
  ready: Promise<void>;
  driver: "pglite" | "postgres";
}

const g = globalThis as typeof globalThis & { __jobAgentDb?: DbState };

async function createState(): Promise<{ db: Db; runRaw: (sqlText: string) => Promise<void>; driver: DbState["driver"] }> {
  const url = process.env.DATABASE_URL?.trim();
  if (url) {
    const { default: postgres } = await import("postgres");
    const { drizzle } = await import("drizzle-orm/postgres-js");
    // prepare:false keeps this compatible with Supabase's transaction pooler.
    // Anything that is not a local database gets TLS.
    const local = /@(localhost|127\.0\.0\.1|\[::1\])[:/]/.test(url);
    const client = postgres(url, { max: 5, prepare: false, ssl: local ? false : "require" });
    return {
      db: drizzle(client, { schema }) as unknown as Db,
      runRaw: async (text) => {
        await client.unsafe(text);
      },
      driver: "postgres",
    };
  }
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const dir = path.join(process.cwd(), ".data", "pglite");
  mkdirSync(dir, { recursive: true });
  const client = new PGlite(dir);
  return {
    db: drizzle(client, { schema }) as unknown as Db,
    runRaw: async (text) => {
      await client.exec(text);
    },
    driver: "pglite",
  };
}

function init(): DbState {
  const s = {
    db: null as unknown as Db,
    driver: process.env.DATABASE_URL?.trim() ? "postgres" : "pglite",
  } as DbState;
  s.ready = (async () => {
    const { db, runRaw } = await createState();
    await migrate(runRaw);
    s.db = db;
  })();
  return s;
}

async function migrate(runRaw: (sqlText: string) => Promise<void>) {
  const dir = path.join(process.cwd(), "db", "migrations");
  await runRaw(`CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const body = readFileSync(path.join(dir, file), "utf8");
    // Every migration is written to be idempotent (IF NOT EXISTS), so applying
    // one twice is harmless and the bookkeeping row is recorded afterwards.
    const name = file.replace(/'/g, "''");
    await runRaw(`${body}\nINSERT INTO schema_migrations (name) VALUES ('${name}') ON CONFLICT DO NOTHING;`);
  }
}

function state(): DbState {
  if (!g.__jobAgentDb) g.__jobAgentDb = init();
  return g.__jobAgentDb;
}

/** Resolves once the driver is loaded and migrations have run. */
export async function getDb(): Promise<Db> {
  const s = state();
  await s.ready;
  return s.db;
}

/**
 * Raw SQL returning rows. postgres-js resolves `execute` to an array and PGlite
 * to `{ rows }`; this hides the difference so callers do not branch on driver.
 */
export async function queryRows<T>(query: SQL): Promise<T[]> {
  const db = await getDb();
  const result = (await db.execute(query)) as unknown;
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

export function dbDriver(): DbState["driver"] {
  return state().driver;
}
