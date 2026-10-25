-- Go-live cutover (ADR-005). Additive only: no existing row or column changes.
--
-- meta:        small server settings. 'phase' = 'pre_release' (absent) until the
--              owner's one-time go-live cutover, then 'live' — the cutover
--              endpoints refuse to run again. 'ledger' = the id of the current
--              business ledger; absent means 'initial'. Every app sends the
--              ledger id it holds and the server refuses uploads and downloads
--              from an app holding another one, so a phone with records from
--              before go-live can never send them into the real ledger.
--              'golive_backup' = the verified pre-cutover backup's fingerprint.
-- cutovers:    the protected record of the cutover: when, who, from which
--              device, the backup it was checked against, scope and result.
-- ops_trial:   test records taken out of the business ledger at go-live —
--              moved here, not destroyed, so they stay available for
--              accountability but are never downloaded or counted.
-- device_sync: what each app last reported when it downloaded: when, and how
--              many records it still had waiting to send. Used by the cutover's
--              readiness check (records waiting on a phone block go-live).

CREATE TABLE meta (
  k TEXT PRIMARY KEY,
  v TEXT NOT NULL
);

CREATE TABLE cutovers (
  id TEXT PRIMARY KEY,
  at TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  ledger TEXT NOT NULL,
  backup_sha256 TEXT NOT NULL,
  backup_at TEXT NOT NULL,
  scope TEXT NOT NULL,
  result TEXT NOT NULL
);

CREATE TABLE ops_trial (
  seq INTEGER NOT NULL,
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
  status TEXT NOT NULL,
  error TEXT,
  flags TEXT NOT NULL,
  vis TEXT,
  subject_id TEXT,
  voided_by TEXT,
  review TEXT,
  resolved_by TEXT,
  cutover_id TEXT NOT NULL
);

CREATE TABLE device_sync (
  device_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  pending INTEGER NOT NULL,
  ledger TEXT NOT NULL,
  PRIMARY KEY (device_id, user_id)
);
