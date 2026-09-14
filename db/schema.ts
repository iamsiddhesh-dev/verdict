// Drizzle table definitions. The SQL that creates them lives in db/migrations and
// is applied at startup by lib/db.ts; keep the two in step by hand.
//
// A deliberate simplification from the plan: a run's job, requirements,
// verification and score are jsonb columns on the run row instead of four
// separate tables. Every read of a run needs all of them together, nothing
// queries across them, and one row means a run reclaimed after a crash resumes
// from whichever column is still empty.

import { sql } from "drizzle-orm";
import {
  date,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").primaryKey(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const profiles = pgTable("profiles", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  resumeText: text("resume_text"),
  resumeFilename: text("resume_filename"),
  facts: jsonb("facts"),
  githubUrl: text("github_url"),
  linkedinUrl: text("linkedin_url"),
  portfolioUrl: text("portfolio_url"),
  // Free text the user wants the agent to know that a resume does not carry:
  // where they will relocate, notice period, the kind of team they want.
  preferences: text("preferences"),
  masterTex: text("master_tex"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type RunStatus = "queued" | "running" | "needs_input" | "done" | "failed";

export const runs = pgTable("runs", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  inputUrl: text("input_url"),
  inputText: text("input_text"),
  status: text("status").$type<RunStatus>().notNull().default("queued"),
  stage: text("stage"),
  events: jsonb("events").notNull().default(sql`'[]'::jsonb`),
  fetched: jsonb("fetched"),
  job: jsonb("job"),
  verification: jsonb("verification"),
  score: jsonb("score"),
  verdict: text("verdict"),
  unlockedAt: timestamp("unlocked_at", { withTimezone: true }),
  error: text("error"),
  attempts: integer("attempts").notNull().default(0),
  leaseUntil: timestamp("lease_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const artifacts = pgTable("artifacts", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid("run_id")
    .notNull()
    .references(() => runs.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(),
  status: text("status").notNull().default("queued"),
  input: jsonb("input"),
  content: jsonb("content"),
  progress: text("progress"),
  error: text("error"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Company-level checks are cached per domain: DNS, mail records and what a
// company says about itself do not change between two postings a day apart.
export const companyChecks = pgTable("company_checks", {
  domain: text("domain").primaryKey(),
  data: jsonb("data").notNull(),
  checkedAt: timestamp("checked_at", { withTimezone: true }).notNull().defaultNow(),
});

export const llmCache = pgTable(
  "llm_cache",
  {
    task: text("task").notNull(),
    promptHash: text("prompt_hash").notNull(),
    result: jsonb("result").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.task, t.promptHash] })],
);

// Requests and tokens spent per model per key per UTC day. Per-minute limits
// are tracked in memory; per-day ones have to survive a restart, or a redeploy
// at 3pm hands the limiter a fresh daily budget the provider does not.
export const llmUsage = pgTable(
  "llm_usage",
  {
    day: date("day").notNull(),
    provider: text("provider").notNull(),
    model: text("model").notNull(),
    keyId: text("key_id").notNull(),
    requests: integer("requests").notNull().default(0),
    tokens: integer("tokens").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.day, t.provider, t.model, t.keyId] })],
);

export const usageCounters = pgTable(
  "usage_counters",
  {
    userId: uuid("user_id").notNull(),
    day: date("day").notNull(),
    action: text("action").notNull(),
    count: integer("count").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.userId, t.day, t.action] })],
);
