-- Cached market reference exchange rates (one row per provider).
-- `data` holds the last successful, validated response; it is kept when a
-- later refresh fails, so the app can show the last known rates with their
-- age and a stale warning. `attempted_at` throttles retries after failures.
CREATE TABLE fx_market (
  provider TEXT PRIMARY KEY,
  data TEXT,
  fetched_at TEXT,
  attempted_at TEXT NOT NULL,
  last_error TEXT
);
