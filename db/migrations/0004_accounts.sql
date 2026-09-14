-- Accounts: users rows now mirror a Supabase Auth user.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_seen_at timestamptz;

-- The original uploaded resume file, kept so the account holds everything the
-- person gave us and they can download it again.
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_file bytea;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS resume_mime text;

-- Supabase publishes every table in the public schema through its REST API,
-- reachable with the public key. This app never uses that API: the server talks
-- to Postgres directly as a role that bypasses row level security. Turning RLS on
-- with no policies leaves the REST API unable to read or write anything.
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE llm_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;

-- And on Supabase, take the API roles' table grants away entirely.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';
    EXECUTE 'ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated';
  END IF;
END $$;
