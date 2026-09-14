-- A one-line description of what a running artifact is doing right now
-- ("Fitting to one page, attempt 2 of 6"). Kept on the row, not only in the
-- socket event, so a page opened mid-generation shows the same thing.
ALTER TABLE artifacts ADD COLUMN IF NOT EXISTS progress text;
