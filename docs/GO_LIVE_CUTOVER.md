# Go live — moving from test records to real business records

Written for the owner (George) and for whoever helps on the day. The design
and the reasons are in `docs/decisions/ADR-005-go-live-cutover.md`. Nothing
here has been run on production: only the preview has been computed (see §5).

## 1. What it does, in one sentence

Once, before real trading starts, it removes every test **activity** record
(stock, purchases, payments, shipments, expenses, sales days) from the business
records and keeps the real **set-up** (places, size groups, vendors, garments,
prices, people, devices), so real business starts from zero stock and an empty
history.

## 2. What is kept, removed, or yours to decide

| Kept exactly as it is | Removed from the business records | Your decision on the day |
|---|---|---|
| Places, size groups, vendors, garments (and their edits), selling prices, settings | Purchases, collections, inspections, returns · vendor payments and allocations · shipments and their costs · stock adjustments (opening stock included) · expenses · takes, returns, closings and reviews · cancellations and late-record decisions about any of these | Recorded exchange rates (`fx.set`): keep them if the family really received those rates, remove them if they were only test entries |
| People and their roles, devices, approvals, sessions, the sign-in log | | |

- "Removed" means **moved** to a separate server table (`ops_trial`), never
  downloaded and never counted. The pre-cutover backup keeps a full copy too.
- Stock starts at **zero**. After going live, count the real stock and record
  it (Stock → adjust, reason "count correction", note "opening count").
- The cutover record itself (when, who, from which device, which backup, what
  was kept and removed) is kept in the `cutovers` table and in the sign-in log
  (`cutover_completed`). The **business** activity log starts empty; the
  **security** sign-in log is not emptied, on purpose.

## 3. On the day — the owner's steps

1. **Every phone and computer in use: open Mabubu online** once and wait for
   "Synced". This sends anything waiting and lets the app report "nothing
   waiting". Ask Jijo, Said and Nancy to do it (and the owner laptop).
2. Helper (optional but recommended): take a database export and note the
   Time Travel bookmark (§6) — a second, independent backup.
3. Owner, on the laptop: **Settings → Go live → Open go live**. Read sections
   1–6. Nothing changes yet.
4. Section 3: decide the exchange rates (keep / remove).
5. Section 5: **Make and save the backup**. The app checks the file (hash and
   that it reads back) and saves it to Downloads. Copy it to a USB stick or
   Google Drive.
6. Section 6: every check must be OK, except "not connected recently", which
   you may accept knowingly (anything those devices saved before go-live will
   not be added — they will show it to their user, see §4).
7. Section 7: type **GO LIVE**, type your code, press **Clear test records and
   go live**. The page then shows "Live: real business records".
8. Record the real opening stock.

## 4. What phones and computers do afterwards

- Each app notices the new ledger the next time it connects and downloads the
  real records from the start (a few seconds).
- A record saved on a device **before** go-live and never sent is **not**
  added. It is kept aside on that device: Me shows "N record(s) saved on this
  device before go live were not sent" with **Download a copy** and **Remove
  from this device**. If anything in it was real, a manager re-enters it.
- An app that has not updated yet is refused until it updates (it keeps its
  data; it cannot send test records in). Updates now take over within seconds
  of opening the app online.

## 5. Production preview (computed 25 Oct 2026, read-only)

Computed by the real server code on a local copy of the verified export
`mabubu-backup-2026-10-25-pre-0005-golive.sql` — production was not touched.

- Records now: 79 (highest seq 87). Kept 43 + rates 5 (your choice); removed 31.
- Kept: places Comoros, Dar es Salaam, Mombasa · sizes Newborn & baby, Small
  child, Child, Between child & adult, Small adult · vendors Hafsaa, Jumaa,
  Mama M-somalia, Mama Yasmin, Mzee wa Wanyama & Shine-Shine · garments
  HAF-BB60, HAF-EN80, JUM-AA50, MZW-SH100, SOMLI-100 (Mnyama), SOMLI-80
  (Elastic Neck Dera), YAS-EX150, YAS-PL80 · 8 selling prices · no settings
  record (banknote values and the ÷5 word are still the defaults).
- Removed: 4 purchases, 4 vendor payments, 3 shipment records (dispatch,
  receive, cost of AIR-1021), 5 takes, 1 return, 6 closings, 8 reviews.
- Rates recorded during testing: KES→KMF, KES→TZS, KES→USD, KES→EUR (5 records).
- People: all 6 kept (George Muraguri, Said Abdou, Nancy Muthoni, Jijo, Azadi
  Mdogo, Naomi). Archive Azadi and Naomi first if they are no longer used
  (People & devices → person → Archive this person); their history stays.
- Checks: backup — not made yet (stops it, as designed); kept set-up replays
  cleanly; no device requests waiting; 4 devices "not connected recently"
  only because none had synced with the new version yet.
- Ambiguous for the owner to look at: whether SOMLI-80 "Elastic Neck Dera" and
  HAF-EN80 "Elastic-neck Child Dera" are both real garments (both are kept;
  mark one "not in use" later if it is a duplicate). Names in the system are
  "Said Abdou" and "Nancy Muthoni" — check the spelling before go-live.

## 6. If it must be undone

The cutover is one database transaction: it either fully happens or nothing
changes (tested by forcing a failure in the middle). To undo a completed one:

1. **Cloudflare D1 Time Travel** (free plan keeps 7 days):
   `npx wrangler d1 time-travel restore mabubu --timestamp=<just before>` —
   restores the whole database to that moment (including people and devices
   as they were then). Note the bookmark first with
   `npx wrangler d1 time-travel info mabubu`.
2. Or rebuild from the export / the app's backup file (see `docs/DEPLOY.md`).
3. After a restore, every app must refresh: they hold the new ledger id and
   will be told to refresh when the old id comes back.

Never restore a staging export over production.

## 7. Safety rules built in (and tested)

Owner only, checked by the server on every call · runs only while the server
phase is pre-release; afterwards every call is refused (410) and Settings
shows the record instead of the tool · exact phrase + the owner's code with
the same lockout as sign-in · only with the latest verified backup, made in
the last 6 hours, that still matches the records · blocked while any device
reports unsent records · devices not seen in 24 h must be acknowledged · the
kept set-up is replayed through the business rules first · a record arriving
in the meantime aborts it · test records can never be sent back in (old ledger
refused; archived ids refused).

Tests: `tests/golive.test.ts` (server), `tests/golive-e2e.test.ts` (real app
store on a phone that was offline across go-live). Staging: run twice through
the screens on 25 Oct 2026, including a real Tecno phone holding an unsent
take — it never reached the server and was shown under Me.
