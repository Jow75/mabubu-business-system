# ADR-005 — Go-live cutover: in-place, one transaction, new ledger id

Status: accepted 25 Oct 2026 (implemented, tested on staging; not run on production).

## Context

Production holds the real set-up (places, vendors, garments, prices, people,
devices) mixed with test activity. The owner wants real trading to start with
no test stock or history, keeping the set-up. Business data is an append-only
operation ledger; entities and stock balances are derived; apps keep their own
copy and an offline queue, so deleting server rows alone would let a phone
send test records back or keep showing them.

## Options

**A. In-place cutover on the existing database (chosen).** One D1 batch: move
test operations to `ops_trial`, rebuild entities and balances by replaying the
kept operations through the engine, start a new ledger id.
**B. Fresh database.** New D1 with migrations, copy users (including PIN
HMACs), devices, approvals and set-up operations, switch the Worker binding.

| | A | B |
|---|---|---|
| Cost | $0 | $0 (free plan allows several databases) |
| People, codes, devices, approvals | untouched | must be copied, including secrets — risk of a lockout or a weakened copy |
| Set-up records | kept byte-for-byte with their ids | copied; ids must stay the same |
| Atomic | yes, one transaction | no: copy, then a deploy to switch |
| Stale phones | needs the ledger id | needs the ledger id too |
| Rollback | Time Travel or backup | switch the binding back (simpler), but the new database then diverges |
| Left-over test rows | none in `ops`; derived state rebuilt from scratch | none |

B does not avoid the hard part (apps holding test data), adds a deploy-time
switch and copies secrets. A is atomic, verifiable by tests and by a rebuild
check before the batch.

## Decision

- Classification is by record type (`src/shared/golive.ts`): set-up types are
  kept; activity types are removed; `fx.set` is the owner's explicit choice;
  cancellations and late-record decisions follow their target.
- Removed records are moved, not destroyed (`ops_trial`); a full verified backup
  (SHA-256, no secrets) is required and must match the records at that moment.
- A server `phase` ('pre_release' → 'live') makes the cutover one-time; a
  `ledger` id makes every older app copy refuse to sync until it refreshes;
  unsent records on such a device are kept aside for the person, never
  uploaded and never silently dropped.
- Each app reports its unsent count on download (`device_sync`); unsent records
  anywhere block the cutover; devices not seen in 24 h need acknowledgement.
- Owner only, phrase + code re-check with sign-in lockout; server-enforced.

## Consequences

- Sync requests carry `ledger`; apps older than this build are refused after
  go-live until they update (safe: they keep their data and cannot send).
- The security sign-in log is not emptied; the business activity log is.
- Restoring Time Travel after go-live brings back the old ledger id; apps
  refresh again. Documented in `docs/GO_LIVE_CUTOVER.md`.
