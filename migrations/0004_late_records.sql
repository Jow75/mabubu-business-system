-- Late records (ADR-004). A worker record (take, return, closing, or a worker
-- cancelling their own take/return) that reaches the server after its sales
-- day was closed is no longer simply refused: it is stored as before
-- (status 'rejected', nothing counted) and marked for a manager's decision.
--   review:      NULL = not a late record; 'waiting' | 'accepted' | 'rejected'.
--   resolved_by: the op.resolve record that decided it.
-- Both columns are nullable additions: existing rows are unchanged, and older
-- Worker versions keep working against this schema (they ignore the columns).
ALTER TABLE ops ADD COLUMN review TEXT;
ALTER TABLE ops ADD COLUMN resolved_by TEXT;
