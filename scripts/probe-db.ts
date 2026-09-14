// Check DATABASE_URL: can we connect, which Postgres is it, and are migrations applied.
//   npm run probe:db

import postgres from "postgres";

const url = process.env.DATABASE_URL?.trim();
if (!url) {
  console.log("DATABASE_URL is empty: the app uses local PGlite.");
  process.exit(0);
}
const host = url.match(/@([^:/]+)/)?.[1];
const port = url.match(/@[^:/]+:(\d+)/)?.[1];
console.log(`Connecting to ${host}:${port} ...`);
const sql = postgres(url, { max: 1, prepare: false, ssl: "require", connect_timeout: 15 });
try {
  const [v] = await sql`select version()`;
  console.log("ok:", String(v.version).split(",")[0]);
  const migrations = await sql`select name from schema_migrations order by name`.catch(() => []);
  console.log("migrations applied:", migrations.map((m) => m.name).join(", ") || "none yet (they run when the server starts)");
} catch (err) {
  const e = err as { code?: string; message?: string };
  console.log(`failed: ${e.code ?? ""} ${e.message ?? err}`);
  if (/ENOTFOUND|ENETUNREACH|EHOSTUNREACH|ETIMEDOUT|getaddrinfo/i.test(`${e.code} ${e.message}`) && host?.startsWith("db.")) {
    console.log("This is the direct connection, which is IPv6-only on Supabase's free plan. Use the Session pooler string instead.");
  }
} finally {
  await sql.end({ timeout: 2 });
}
