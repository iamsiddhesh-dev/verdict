CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  resume_text text,
  resume_filename text,
  facts jsonb,
  github_url text,
  linkedin_url text,
  portfolio_url text,
  preferences text,
  master_tex text,
  confirmed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  input_url text,
  input_text text,
  status text NOT NULL DEFAULT 'queued',
  stage text,
  events jsonb NOT NULL DEFAULT '[]'::jsonb,
  fetched jsonb,
  job jsonb,
  verification jsonb,
  score jsonb,
  verdict text,
  unlocked_at timestamptz,
  error text,
  attempts integer NOT NULL DEFAULT 0,
  lease_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runs_user_created ON runs (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS runs_claimable ON runs (status, created_at);

CREATE TABLE IF NOT EXISTS artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id uuid NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  kind text NOT NULL,
  status text NOT NULL DEFAULT 'queued',
  input jsonb,
  content jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS artifacts_run ON artifacts (run_id, created_at DESC);

CREATE TABLE IF NOT EXISTS company_checks (
  domain text PRIMARY KEY,
  data jsonb NOT NULL,
  checked_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS llm_cache (
  task text NOT NULL,
  prompt_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task, prompt_hash)
);

CREATE TABLE IF NOT EXISTS llm_usage (
  day date NOT NULL,
  provider text NOT NULL,
  model text NOT NULL,
  key_id text NOT NULL,
  requests integer NOT NULL DEFAULT 0,
  tokens integer NOT NULL DEFAULT 0,
  PRIMARY KEY (day, provider, model, key_id)
);

CREATE TABLE IF NOT EXISTS usage_counters (
  user_id uuid NOT NULL,
  day date NOT NULL,
  action text NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, day, action)
);
