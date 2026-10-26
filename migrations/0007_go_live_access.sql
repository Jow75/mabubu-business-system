-- Go-live access clean-up (ADR-005, amended 26 Oct 2026 at the owner's
-- request). Additive only: two nullable columns, no existing row changes.
--
-- devices.removed_at: set by the go-live cutover on every device that is not
--   one of the business's current devices (old laptop identities from
--   testing, computers used only for a temporary sign-in). Such a device is
--   also blocked and retired, so nothing it holds can sign in; it no longer
--   appears in People & devices. The row itself is kept (never deleted):
--   records kept in the ledger and the security log still name it.
-- users.removed_at: set by the cutover on archived people from the testing
--   period that no kept record names (e.g. test workers). They already
--   cannot sign in (archived); they no longer appear in People & devices and
--   cannot be reactivated from there. The row is kept for the trial archive
--   and the security log.
--
-- A Worker older than this migration ignores both columns, so a rollback of
-- the code is safe; it would simply show such rows again (still blocked).
ALTER TABLE devices ADD COLUMN removed_at TEXT;
ALTER TABLE users ADD COLUMN removed_at TEXT;
