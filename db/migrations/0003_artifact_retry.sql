-- Tool generations wait out busy free models instead of failing: a job that hits
-- capacity goes back on the queue with a time before which it is not claimed.
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS available_at timestamptz;
