# Pre-launch audit — 27/28 Oct 2026

**Update 31 Oct 2026 — the business is live.** Go live ran on **28 Oct 2026
at 08:04 EAT** (05:04 UTC), by George on his laptop 5YK-3GS, with its verified
backup made a minute before: 44 set-up records kept, 81 test records moved to
the trial archive (including the 15 unmarked records of §2.1, and the six test
exchange rates). Since then every record is real. The owner reported three
problems on 31 Oct, all fixed in this pass (not yet deployed at the time of
writing):

- **A sales day typed but not saved was lost** when the laptop lost power. Take,
  Return and Close day now keep unsaved entries on the device as they are
  typed, and bring them back; records and drafts are written "strictly" to the
  disk (tested by killing the browser mid-entry).
- **Reports said "Incomplete — do not use the totals"** although rates were in
  Settings: all ten rates are dated 28 Oct, but the US$ shipment cost is dated
  27 Oct (back-dated), so no rate was "in force". On the owner's request the
  first recorded rate is now used for amounts dated before it, and the report
  says so (ADR-002 amendment). Checked on a read-only copy of the live ledger:
  October in KMF and in KES are complete.
- **"Stock below zero" in red:** the 27 Oct take was entered before the
  luggage shipment that supplied it (then entered back-dated to 26 Oct). Stock
  is not below zero anywhere now; such warnings stay in the log as history but
  no longer ask for attention once the stock covers them.

Live state on 31 Oct (read-only): 104 records, phase live, 8 people (George
records his own sales days; Jijo 2 is now archived), 16 devices.

Written for the owner (George). The baseline taken before the "pre-launch
safety, branding, purchase workflow and AI assistant" brief was worked on, and
what that brief found in the live system. **Read-only on production: nothing
was deployed, migrated, changed or deleted there.**

## 1. Baseline (27 Oct 2026, 22:56 EAT)

| Item | Value |
|---|---|
| Live app | https://mabubu.mabubu-family.workers.dev — Worker version `8fceeed7` (deployed 27 Oct 19:35 UTC, the Enter-key fix `e887ee5`; the owner confirmed Enter now works) |
| Code | `main` at `e887ee5`, working tree clean, **one commit not yet on GitHub** (`Jow75/mabubu-business-system`) |
| Database | D1 `mabubu` (`99eb0bfa-…`, WEUR), migrations 0001–0007, `meta` empty → **phase pre-release, go live never run**, ledger "initial" |
| Restore point | D1 Time Travel bookmark `00000089-00000000-00005111-6fc589fb2c79448a89994a7586cc1f27` (7 days); exports in `Documents\mabubu-backups\` (latest 27 Oct 00:55) |
| Snapshot | `Documents\mabubu-backups\snapshots\2026-10-27-baseline-before-master-build.json` — identical to the snapshot taken after the Enter deploy |
| Checks | `npm run typecheck && npm test && npm run build`: clean, 334 tests |

**Records:** 125 (highest sequence 133). Set-up: 3 places, 5 size groups,
5 vendors, 8 garments (20 edits), 8 selling prices (10 price records),
1 settings record, 6 exchange-rate entries (5 currency pairs).

**People (8):** active — George Muraguri (owner), Said Abdou and Nancy
Muthoni (managers), Jijo 2 (worker); archived — Jijo, Azadi Mdogo, Naomi,
Test Worker (agent).

**Devices (16):** in use — 5YK-3GS (George's laptop), E3C-59E (Said), ZWU-XJ7
(Nancy), YB7-EN2 (Jijo 2, the Tecno). Retired — WNY-S7J, ZZU-23X, WR8-WYS,
MCS-MH4, THS-8GK, EVK-NWF, UNG-RUF (the seven old laptop identities) and
QQS-TJP, 3M2-7BM (the 27 Oct test window and test worker browser). Never
approved — A33-8RR, 7CY-7ET (computers used for temporary sign-ins) and
E7M-RVF (refused for George; it appeared between the 26 Oct preview and the
27 Oct 00:56 snapshot). Go live removes all 12 from People & devices
(hidden, blocked; rows kept, never deleted) and keeps the four in use.

## 2. Findings that need the owner

1. **15 activity records from 27 Oct have no "TEST" note.** Jijo 2's sales day
   of 27 Oct on the Tecno (take, return, closing — entered in 11 minutes, so
   probably practice) and, from 5YK-3GS, three purchases (Hafsaa ×2, Mama
   M-somalia), an inspection, a return, a collection, three payments, a
   credit allocation and two day approvals — entered within about 8 minutes,
   reaching the server at 19:27 UTC. Go live moves **every** activity record
   to the trial archive (kept, never counted). If any of these 15 is real, say
   which before go live: it must be entered again afterwards. One purchase
   line has a unit cost of **KSh 1,001** where the others are KSh 60–80 — very
   likely a typing slip; the new thousands separators make such slips visible.
2. **Exchange rates: six entries, not five.** The brief says five; there are
   six market references (KES→KMF 22 Oct and 23 Oct, KES→TZS, KES→USD,
   KES→EUR, KMF→EUR 26 Oct). Settings shows five because it lists the latest
   per currency pair. The owner decided on 26 Oct to remove all six at go live.
3. **Names in the brief differ from the records.** The brief says "SOML80 —
   Mama Msomani" and "HAF-EN80 — Hafsa"; the records say **SOMLI-80** from
   vendor **Mama M-somalia** and HAF-EN80 from **Hafsaa**. Both garments are
   kept as two real products (owner's decision, 26 Oct). Nothing was renamed;
   if the records are misspelt, the owner can correct them in Garments &
   prices and Vendors (history keeps the old spelling).
4. **"Go live disappears after one click."** Go live has never run on
   production. The Settings card could vanish when its status could not be
   read (offline, session ended, server error) — fixed: it now always says
   checking / could not check (why, Check again) / not yet / done. In a
   temporary sign-in it now says go live is done from the owner's own device.
5. **"Repeatable" go live.** The brief asks for a repeatable go live; the
   agreed rule (ADR-005, CLAUDE.md) is one-time. What the brief describes —
   safe to retry, never repeating the clean-up, a clear status afterwards — is
   what exists: a second attempt is refused, a failed attempt changes nothing
   (one transaction), and Settings shows the record afterwards. Nothing was
   changed; a cutover that could run twice would need a new owner decision.
6. **NVIDIA's free API is for testing only** — see `docs/AI_ASSISTANT.md` §4.
   The assistant is built, tested and switched off; its service is the
   owner's decision.

## 3. Changes made (not deployed)

| Commit | What |
|---|---|
| `d140f3e` | Money fields group thousands while typing (20880 → 20,880), display only |
| `da712b3` | Unfinished purchases kept on the device as drafts |
| `2a0ea35` | Go live card always says where things stand |
| (this pass) | The read-only business assistant, off until configured (`docs/AI_ASSISTANT.md`) |

Production data was read with SELECT queries and the snapshot script only.
