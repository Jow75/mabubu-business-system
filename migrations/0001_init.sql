-- Mabubu business system — initial schema (Cloudflare D1 / SQLite).
-- Business data lives in the append-only `ops` table. `entities` and
-- `balances` are the server's working state, derived from ops by the shared
-- engine; they can be rebuilt from ops at any time.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'manager', 'worker')),
  grants TEXT NOT NULL DEFAULT '[]',
  revokes TEXT NOT NULL DEFAULT '[]',
  location_id TEXT,
  pin_hmac TEXT NOT NULL,
  pin_set_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  failed_count INTEGER NOT NULL DEFAULT 0,
  locked_until TEXT,
  hard_locked INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY,
  secret_hash TEXT NOT NULL,
  code TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  user_agent TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  last_seen_at TEXT,
  revoked_at TEXT
);

-- A device must be approved by the owner for each person who uses it.
CREATE TABLE device_access (
  device_id TEXT NOT NULL REFERENCES devices (id),
  user_id TEXT NOT NULL REFERENCES users (id),
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'denied', 'revoked')),
  requested_at TEXT NOT NULL,
  decided_at TEXT,
  decided_by TEXT,
  PRIMARY KEY (device_id, user_id)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users (id),
  device_id TEXT NOT NULL REFERENCES devices (id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  last_used_at TEXT NOT NULL,
  revoked_at TEXT
);
CREATE INDEX sessions_user ON sessions (user_id);
CREATE INDEX sessions_device ON sessions (device_id);

CREATE TABLE ip_failures (
  ip TEXT PRIMARY KEY,
  window_start TEXT NOT NULL,
  count INTEGER NOT NULL
);

CREATE TABLE auth_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  user_id TEXT,
  actor_id TEXT,
  device_id TEXT,
  ip TEXT,
  detail TEXT NOT NULL DEFAULT '{}'
);
CREATE INDEX auth_events_at ON auth_events (at);

CREATE TABLE ops (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_time TEXT NOT NULL,
  tz_offset_min INTEGER NOT NULL,
  created_online INTEGER NOT NULL,
  v INTEGER NOT NULL,
  server_time TEXT NOT NULL,
  clock_skew_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('applied', 'rejected')),
  error TEXT,
  flags TEXT NOT NULL DEFAULT '[]',
  vis TEXT,
  subject_id TEXT,
  voided_by TEXT
);
CREATE INDEX ops_vis ON ops (vis, seq);
CREATE INDEX ops_subject ON ops (subject_id, seq);
CREATE INDEX ops_actor ON ops (actor_id, seq);

CREATE TABLE entities (
  key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  data TEXT NOT NULL,
  ver INTEGER NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX entities_kind ON entities (kind);

CREATE TABLE balances (
  acct TEXT NOT NULL,
  gt TEXT NOT NULL,
  qty INTEGER NOT NULL,
  PRIMARY KEY (acct, gt)
);

-- Inserting a non-zero value aborts the surrounding batch. Used to roll back
-- a sync write when another device changed the same record concurrently.
CREATE TABLE guard (v INTEGER NOT NULL CHECK (v = 0));
