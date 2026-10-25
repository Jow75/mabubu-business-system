# ADR-004 — Late records: a stock movement that reaches the server after its day was closed

Date: 22 Oct 2026. Status: accepted (owner-authorised brief of 22 Oct 2026, Phase 3).

## Problem

A worker can take or return garments, or close the day, while the phone is
offline. Meanwhile a manager may close that worker's day from another device.
When the phone reconnects, its record reaches a day that is already closed.

Until now the rules refused it ("This day is already closed"). The record was
kept on the server as *rejected* and the phone showed "Not accepted", but
nobody was asked to decide, and the pieces that physically left the shelf were
not counted anywhere. The QA pass of 20 Oct pinned this behaviour with a test
and left it to the owner (QA doc §5.1).

Two things must both hold:

1. A real physical movement must never disappear quietly because the network
   was slower than the manager.
2. A closed day's figures must never change silently, and a time typed or
   kept by a phone (which its holder can change) is evidence, not proof.

## Decision

**Rule.** A valid offline stock record is never silently discarded because it
reached the server after its day was closed. It is kept as a *late record*,
counts for nothing, and waits for a manager, who accepts or rejects it. Every
step stays in the history.

### What is held

The rules fail such a record with a distinct code, `day_closed`
(`src/shared/engine.ts`, `workerDay`). The server holds — instead of refusing —
a record that fails with that code and is one of (`HOLDABLE`):

- a take (`worker.issue`), a return (`worker.return`), a closing (`worker.settle`),
- a worker cancelling their own take or return (`op.void`), whose only fault
  is that the day closed meanwhile.

Any other failure is still a plain refusal.

### How it is stored

The record is stored exactly as before (`status = 'rejected'`, nothing
applied), plus two nullable columns (migration `0004_late_records.sql`):

| Column | Meaning |
|---|---|
| `review` | `NULL` = not a late record; `waiting` · `accepted` · `rejected` |
| `resolved_by` | the `op.resolve` record that decided it |

Its device time, server receipt time, measured clock skew, device id, person,
place, business date, record type and quantities are already part of every
record; the conflict reason is the stored error. The timing flags
(`CLOCK_SKEW`, `LATE_SYNC`, `BACKDATED`) are kept for late records too.

A retry of the same record returns the same answer (`duplicate: true`) and is
never stored twice — record ids are unique, as for every record.

### The decision record

A new record type, `op.resolve` `{ targetId, decision: 'accept' | 'reject', reason }`:

- Only someone with `workers.reconcile` (owner, manager) may decide. A worker
  can never decide on their own late record.
- **Reject** needs a reason (at least 3 characters). Nothing is counted; the
  late record, its times and the reason stay in the history, and the worker
  sees "Not accepted by <name>: <reason>".
- **Accept** applies the late record *now, under its own id*, exactly as if it
  had only just arrived. So it needs an **open** day: on a closed day the
  rules refuse ("Reopen this day before accepting the late record."). The
  manager reopens the day — the existing "Reopen day", which cancels the
  closing and keeps it in the history with a reason — accepts the late
  records in the order they were saved, and then the day is closed again
  with the right figures. A closed day's totals are therefore never changed
  in place.
- A decision is final (`op.resolve` cannot be cancelled). An accepted record
  behaves like any other: it can be cancelled with a reason while its day is
  open.
- Two managers deciding the same late record at the same moment: the server
  updates the late record only while it is still `waiting`, behind a guard
  that aborts the whole upload otherwise; the retry then refuses the second
  decision ("This late record was already decided."). Proven by a forced-race
  test.

Devices rebuild consistently: refused and late records are recorded first,
then everything applied is replayed in server order, so a decision always
finds the record it decides; an accepted late record counts from the moment
of its acceptance.

### Why reopen-and-accept, not "add to the closed day"

Adding a late take to a closed day without redoing the closing would leave the
day saying "took 8, sold 5" with the cash counted for 5 — sales in the wrong
day and a closing that no longer adds up. Reopening keeps the accounting whole
(took − returned = what the closing accounts for) and reuses an audited step
the family already knows. When the worker's own late closing arrives too, the
manager can accept it after the take and return, so the worker's real figures
are used.

### Evidence shown to the manager

On the day screen, for each late record: when it was saved by the phone's
clock; that time corrected by the clock error the server measured on upload;
when it reached the server; when the closing it collided with reached the
server and who recorded it; and "Saved before / after the closing reached the
server (by the phone's clock)". The screen says plainly that phone times are
evidence, not proof (`src/shared/late.ts`).

### Statuses a worker sees

| State | On the phone |
|---|---|
| Saved locally, waiting to sync | "Saved on this phone · not sent yet" |
| Received by the server | "✓ Sent" |
| Needs manager review | "Reached the office after the day was closed. A manager will check it." and a note on the home screen |
| Approved / reconciled | "Accepted by <name>" |
| Rejected with reason | "Not accepted by <name>: <reason>" |

Managers see late records first under Overview → Needs attention, as "n late"
on Sales days, on the day screen (Approve is hidden until they are decided),
and in the activity log and downloads.

### Compatibility

- Migration 0004 only adds nullable columns: no table rebuild, existing rows
  unchanged, older Worker versions keep working against the new schema.
- Sync protocol 2 (`SYNC_PROTO`): the server sends `op.resolve` (and
  `payment.allocate`, ADR-002 §5) only to apps that ask with `proto=2`, so an
  older app still cached on a phone never meets a record type it cannot
  replay. The new app downloads everything once on its first sync.

## Scenarios tested

| Scenario | Where |
|---|---|
| A — take offline while open; manager closes first | engine, server (HTTP), store end-to-end, staging browser |
| B — take saved after the closing (phone did not know) | evidence test ("after"); the phone that knows the day is closed refuses at once |
| C — the same record uploaded repeatedly | server (two retries, one row), store end-to-end |
| D — phone clock 2 h behind / 3 h ahead | server (clock skew flag kept), evidence tests |
| E — manager rejects after counting | engine, server, store end-to-end |
| F — manager accepts (reopen, accept, re-close) | engine (hand-worked stock and sales), server, store end-to-end, staging browser |

Stock conservation and "the take counts exactly once" are checked against
figures worked out by hand (`tests/engine.test.ts`, `tests/worker.test.ts`,
`tests/late-e2e.test.ts`).

## Known limits

- A worker cancelling a take that is itself still waiting is refused as a
  plain refusal; the manager can reject the take with that reason.
- Late records are decided one by one or "all, in order"; there is no bulk
  decision across several days.
