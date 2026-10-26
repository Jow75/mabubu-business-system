# Go live — moving from test records to real business records

Written for the owner (George) and for whoever helps on the day. The design
and the reasons are in `docs/decisions/ADR-005-go-live-cutover.md`. Nothing
here has been run on production: only the preview has been computed (see §5).

## 1. What it does, in one sentence

Once, before real trading starts, it removes every test **activity** record
(stock, purchases, payments, shipments, expenses, sales days) from the business
records and keeps the real **set-up** (places, size groups, vendors, garments,
prices), so real business starts from zero stock and an empty history. Since
26 Oct 2026 it also clears **access left over from testing**: archived test
people, old and temporary-sign-in devices, temporary sign-ins and waiting
device requests (§2).

## 2. What is kept, removed, or yours to decide

| Kept exactly as it is | Removed from the business records | Your decision on the day |
|---|---|---|
| Places, size groups, vendors, garments (and their edits), selling prices, settings (incl. the business contact numbers) | Purchases, collections, inspections, returns · vendor payments and allocations · shipments and their costs · stock adjustments (opening stock included) · expenses · takes, returns, closings and reviews · cancellations and late-record decisions about any of these | Recorded exchange rates (`fx.set`), listed one by one: keep all, or remove all |
| **Active people** and the devices approved for them (their approvals and sessions); the security sign-in log | **Leave People & devices** (hidden, cannot sign in, rows kept — never deleted): archived test people that no kept record names; every device that is not an active person's current approved device (retired laptops, computers used only for a temporary sign-in). **End:** every temporary sign-in, every session on a removed device or of someone not kept. **Withdrawn / closed:** approvals on removed devices, waiting device requests | Approve any real new phone **before** the day — a device that is only waiting is removed |

A removed device stays in the database because kept records and the security
log name it (four of production's old laptops made set-up records that stay).
It is blocked and retired, so nothing on it can sign in, and People & devices
shows only one line: "Removed at go live: N person(s) and M device(s)". The
cutover refuses if anyone or anything was added, approved or changed between the
preview and the button (`access_changed`).

- "Removed" means **moved** to a separate server table (`ops_trial`), never
  downloaded and never counted. The pre-cutover backup keeps a full copy too.
- Stock starts at **zero**. After going live, count the real stock and record
  it (Stock → adjust, reason "count correction", note "opening count").
- The cutover record itself (when, who, from which device, which backup, what
  was kept and removed, and how many people, devices and sign-ins it cleared)
  is kept in the `cutovers` table and in the sign-in log (`cutover_completed`,
  naming the removed device codes and people). The **business** activity log
  starts empty; the **security** sign-in log is not emptied, on purpose.

## 3. On the day — the owner's steps

1. **Every phone and computer in use: open Mabubu online** once and wait for
   "Synced". This sends anything waiting and lets the app report "nothing
   waiting". Ask whoever uses Jijo's phone (now "Jijo 2"), Said and Nancy to do
   it, and open it on the owner laptop. Do this from the owner's own laptop or
   phone: a temporary sign-in cannot run go live.
2. Helper (optional but recommended): take a database export and note the
   Time Travel bookmark (§6) — a second, independent backup.
3. Owner, on the laptop: **Settings → Go live → Open go live**. Read sections
   1–6. Nothing changes yet.
4. Section 3: look at each recorded exchange rate and decide (keep all /
   remove all).
5. Section 4: check the people and devices kept and removed. If a real phone
   is missing from "Devices kept", approve it in People & devices first, then
   reopen go live.
6. Section 6: **Make and save the backup**. The app checks the file (hash and
   that it reads back) and saves it to Downloads. Copy it to a USB stick or
   Google Drive.
7. Section 7: every check must be OK, except "not connected recently", which
   you may accept knowingly (anything those devices saved before go-live will
   not be added — they will show it to their user, see §4).
8. Section 8: type **GO LIVE**, type your code, press **Clear test records and
   go live**. The page then shows "Live: real business records".
9. Record the real opening stock, and the real exchange rates when money is
   changed (Settings → Exchange rates).

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

## 5. Production preview (computed 26 Oct 2026, 19:37 UTC, read-only)

Computed by the real server code of version `b6bd2d36` (`goLiveStatus`) on a
local copy of the verified export
`mabubu-backup-2026-10-26-pre-0007-golive-access.sql` (restored into a fresh
database: every table count equal to production, integrity ok; migration 0007
applied to the copy as on production). **Production was not touched and the
cutover was not run.** Full output (no secrets):
`Documents\mabubu-backups\snapshots\prod-golive-preview-2026-10-26.json`.

1. **Kept set-up:** places Comoros, Dar es Salaam, Mombasa · sizes Newborn &
   baby, Small child, Child, Between child & adult, Small adult · vendors
   Hafsaa, Jumaa, Mama M-somalia, Mama Yasmin, Mzee wa Wanyama & Shine-Shine ·
   8 garments with their 20 edits, **including both SOMLI-80 "Elastic Neck
   Dera" and HAF-EN80 "Elastic-neck Child Dera"** (owner: two genuine products
   from different suppliers) · 8 selling prices (10 price records) · no
   settings record yet.
2. **Moved to the trial archive (31 records):** 4 purchases, 4 vendor
   payments, 3 shipment records, 5 takes, 1 return, 6 closings, 8 reviews.
   Stock afterwards: zero everywhere.
3. **Exchange rates — 6 entries, not 5.** All six are saved market references
   (ExchangeRate-API), none is a rate the family received: KES→KMF 3.3758…,
   KES→TZS 20.3479…, KES→USD 0.0077…, KES→EUR 0.0068… (all dated 22 Oct, saved
   from THS-8GK), KES→KMF 3.3726… (23 Oct, EVK-NWF) and **KMF→EUR 0.0020325
   (26 Oct, saved at 17:56 UTC from the laptop 5YK-3GS — after the owner's
   "remove the five" decision)**. "Remove" removes all six; the owner confirms
   on the day.
4. **People kept:** George Muraguri (owner), Said Abdou and Nancy Muthoni
   (managers), Jijo 2 (worker, Comoros, id `01a173df…`). **Leave People &
   devices:** Jijo (`01a150d1…`, 7 test records), Azadi Mdogo (`01a1600e…`,
   2), Naomi (`01a16026…`, 1) — all archived since 25 Oct; no kept record names
   them, so they are removed (rows kept).
5. **Devices kept (4):** 5YK-3GS George's laptop · E3C-59E Said · ZWU-XJ7
   Nancy · YB7-EN2 Jijo 2. **Removed (9):** the 7 retired laptop identities
   WNY-S7J, ZZU-23X, WR8-WYS, MCS-MH4, THS-8GK, EVK-NWF, UNG-RUF, and the two
   computers used for temporary sign-ins A33-8RR, 7CY-7ET. WNY-S7J, WR8-WYS,
   THS-8GK and EVK-NWF made set-up records that stay (25, 5, 17 and 1), so
   their rows cannot be deleted; none of the nine can sign in afterwards.
6. **Sign-ins:** the temporary sign-in on 7CY-7ET (26 Oct) ends; 4 approvals
   on removed devices are withdrawn; no device request is waiting.
7. **Readiness:** no device reports unsent records. Said's and Nancy's phones
   have not connected since 21–22 Oct and Jijo 2's since 25 Oct ("not
   connected recently" — ask them to open the app online the day before). The
   backup is made on the day.

## 5a. Earlier production preview (25 Oct 2026, 18:32 UTC, superseded by §5)

Computed by the real server code (`goLiveStatus`) on a local copy of the
verified export `mabubu-backup-2026-10-25-pre-0006-temporary-signin.sql`
(restored into a fresh database: every table count equal to production,
integrity ok). **Production was not touched; the cutover was not run.** The
numbers change with every new record — the screen (Settings → Go live) shows
the live ones.

1. **Preserved (43 records):** places Comoros, Dar es Salaam, Mombasa · sizes
   Newborn & baby, Small child, Child, Between child & adult, Small adult ·
   vendors Hafsaa, Jumaa, Mama M-somalia, Mama Yasmin, Mzee wa Wanyama &
   Shine-Shine · 8 garments with their 20 edits (HAF-BB60, HAF-EN80,
   JUM-AA50, MZW-SH100, SOMLI-100 Mnyama, SOMLI-80 Elastic Neck Dera,
   YAS-EX150, YAS-PL80) · 8 selling prices (10 price records) · no settings
   record (banknote values and the ÷5 word are still the defaults). People,
   devices, approvals, sessions and the sign-in log are not touched.
2. **Moved to the trial archive (`ops_trial`, 31 records):** 4 purchases,
   4 vendor payments, 3 shipment records (dispatch, receive, cost), 5 takes,
   1 return, 6 closings, 8 reviews. No record is cancelled today (0 voids).
3. **Absent from the business records afterwards:** all of the above, so the
   activity log, purchases, payments, shipments, sales days and profit start
   empty. The security sign-in log and the cutover record stay, on purpose.
4. **Stock:** today's balances are test stock — 498 pieces available at
   Mombasa, 1,615 (net) at Comoros, 185 recorded as sold. After the cutover
   stock is rebuilt from the kept set-up only: **zero everywhere**. Count the
   real stock and record it (Stock → adjust, "count correction").
5. **People to confirm:** 7 people. Active: George Muraguri (owner), Said
   Abdou and Nancy Muthoni (managers), **Jijo 2** (worker). Archived on 25 Oct:
   **Jijo**, Azadi Mdogo, Naomi — they stay archived with their history.
   *Owner decision:* is "Jijo 2" the same person as "Jijo"? If so, either
   reactivate "Jijo" (and archive "Jijo 2", which has no records yet), or
   rename the archived one (e.g. "Jijo (old)") and then "Jijo 2" to "Jijo" —
   names must be unique. Check the spelling of "Said Abdou" and "Nancy Muthoni".
6. **Exchange rates — owner decision:** 5 records (KES→KMF ×2, KES→TZS,
   KES→USD, KES→EUR, 22–23 Oct). **All five are saved market references**
   (ExchangeRate-API, `basis: market`), not rates the family received. Unless
   you want them as reference history, choose **remove**; record the real
   rate the first time money is changed.
7. **Unsent records on devices:** none reported (owner laptop `5YK-3GS`,
   Jijo 2's phone `YB7-EN2`: 0 waiting).
8. **Devices on the current ledger:** the two above synced on 25 Oct on the
   current ledger. **Said's phone (`E3C-59E`) and Nancy's phone (`ZWU-XJ7`)
   have not connected since 21 and 22 Oct** — the check shows them as "not
   connected recently" (a warning you may accept). Better: ask Said and Nancy
   to open Mabubu online once before the day; their apps then update and
   report "nothing waiting".
9. **Backup:** none made yet (this blocks, as designed). On the day, section 5
   of the screen makes it: a full copy without codes or secrets, checked by
   SHA-256 and read back, saved to Downloads; it must be under 6 hours old and
   match the records at that moment. Also take a database export (§6).
10. **If it is interrupted:** the cutover is one database transaction — it
    either completes or changes nothing (tested by forcing a failure). A
    record arriving between the preview and the button aborts it ("Records
    changed since the preview"). To undo a completed one, §6.

Kept set-up replays cleanly through the rules; no device requests are waiting.
A **temporary sign-in** (ADR-006) cannot run the cutover: go live needs the
owner's own device. Ambiguous for the owner to look at: whether SOMLI-80
"Elastic Neck Dera" and HAF-EN80 "Elastic-neck Child Dera" are both real
garments (both are kept; mark one "not in use" later if it is a duplicate).

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

Owner only (not from a temporary sign-in), checked by the server on every call · runs only while the server
phase is pre-release; afterwards every call is refused (410) and Settings
shows the record instead of the tool · exact phrase + the owner's code with
the same lockout as sign-in · only with the latest verified backup, made in
the last 6 hours, that still matches the records · blocked while any device
reports unsent records · devices not seen in 24 h must be acknowledged · the
kept set-up is replayed through the business rules first · a record arriving
in the meantime aborts it · a person, device or approval changed since the
preview aborts it · test records can never be sent back in (old ledger
refused; archived ids refused) · removed devices are blocked and retired, so
an old phone or laptop from testing cannot sign in or send anything.

Tests: `tests/golive.test.ts` (server), `tests/golive-e2e.test.ts` (real app
store on a phone that was offline across go-live). Staging: run twice through
the screens on 25 Oct 2026, including a real Tecno phone holding an unsent
take — it never reached the server and was shown under Me.
