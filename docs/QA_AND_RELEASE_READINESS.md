# Quality assurance & release readiness

Living document. Last updated **24 Oct 2026** (approve-once fix, late records, vendor credit, desktop install). Read `CLAUDE.md`,
then `docs/STATUS.md` and `docs/HANDOVER_NEXT_SESSION.md`, then this file.

It records the release phase, what has actually been verified (and how), the
data that must be preserved, open findings, and the evidence still needed
before a stable 1.0.0. **Stable release is the owner's decision.**

---

## 1. Version and phase

- **Version:** `0.1.0` (`package.json`; no other version metadata in the build
  or the Worker). Correct for the phase: live, holding real records, under test.
- **Phase:** testing / pre-release. Do not declare stable without the owner.
- **Policy (semver):** stay on `0.x` while testing; first stable is **`1.0.0`**
  (never `1.1.0` as a first stable); then `1.0.x` fixes, `1.x.0` features;
  optional `1.0.0-rc.1`. Never change the version silently.

## 2. Canonical production configuration (verified 24 Oct 2026, read-only)

- **People:** 6 — George Muraguri (owner, the only owner), Said Abdou and
  Nancy Muthoni (managers), Jijo, Azadi Mdogo and Naomi (workers).
- **Devices:** 9 rows, history kept. Active: `EVK-NWF` owner laptop
  (recovered 22 Oct), `THS-8GK` previous owner-laptop identity (recovered
  21 Oct; probably dead since the 22 Oct clear; also approved for Azadi and
  Naomi), `YB7-EN2` Jijo's Android, `E3C-59E` Said's Android, `ZWU-XJ7`
  Nancy's Android. Blocked + retired: `WNY-S7J`, `ZZU-23X`, `WR8-WYS`, `MCS-MH4`.
- **Records:** 77 operations (all applied; highest seq 85), 43 entities, 44
  stock balance rows netting to zero; five sales days (19–22 Oct), four
  purchases with payments that exactly match them. Reference data clean.
- **Schema:** migrations 0001–0004 (0004 applied 24 Oct after the export
  `Documents\mabubu-backups\mabubu-backup-2026-10-24-pre-0004-late-records-credit.sql`,
  verified by a full restore into a fresh SQLite: identical counts, integrity ok).
- **Secrets:** `PIN_PEPPER`, `SETUP_TOKEN` only in Cloudflare, set once on
  18 Oct before the first code version (matters for rollback, §8).

Preserve all of this. Correct mistakes with the app's cancel/void/retire; never
delete rows or reset the database.

## 3. Release checklist — what the evidence actually shows

Legend: **I** implemented · **A** automated tests · **B** browser-tested (headless
Chrome, local or staging) · **P** verified in production (read-only or smoke) ·
**D** tested on a physical Android phone · **N** reviewed by a native speaker ·
— not yet.

| Area | I | A | B | P | D | N | Notes |
|---|---|---|---|---|---|---|---|
| Sign-in, first setup, owner recovery | ✓ | ✓ | ✓ | smoke | — | — | 20 Oct audit: owner-aware new-device screen, setup race guard, starter step server-decided (`AUTH_AND_RECOVERY.md`) |
| Role permissions / escalation | ✓ | ✓ | — | smoke | — | n/a | Escalation guard deployed 20 Oct; worker-cannot-promote tests |
| Device management (approve/block/retire) | ✓ | ✓ | ✓ | read-only | — | — | Retired state live since 19 Oct |
| Financial correctness | ✓ | ✓ | — | read-only replay | — | n/a | Hand-worked month reconciliation; production replay matches server balances exactly |
| Stock / ledger integrity | ✓ | ✓ | ✓ | read-only | — | n/a | Production: 15 balances net to 0; replay 32/32, 0 mismatches |
| Sync & offline | ✓ | ✓ | ✓ staging | — | — | n/a | Emulated Android day on staging: offline close, honest status, single upload on reconnect, no duplicates on forced retries |
| Demo isolation | ✓ | ✓ | ✓ | n/a | — | n/a | Separate DB, no network, mid-sync switch tested |
| English / French / Swahili | ✓ | ✓ | ✓ 189 screens | — | — | **—** | All 45 user-facing server/rule messages now translated; review sheet `docs/LANGUAGE_REVIEW.md` |
| Export completeness | ✓ | ✓ | — | — | — | — | Exports still **English only** |
| Backup & restore | ✓ | — | — | ✓ | n/a | n/a | Export → full restore into a fresh SQLite: identical counts, integrity ok |
| Worker rollback | ✓ | — | ✓ staging | — | n/a | n/a | Rehearsed on staging (§8); not executed on production |
| Performance | ✓ | — | ✓ throttled | — | — | n/a | §9 |
| Accessibility / responsive | ✓ | — | ✓ | — | — | n/a | §10 |
| Actual Android behaviour | ✓ | — | emulated | — | **—** | n/a | Needs the owner's phone (§11) |
| Approve once (22 Oct) | ✓ | ✓ | ✓ staging | — | — | — | Owner's bug report; production had two days approved 3×, which still replay |
| Late records (22 Oct, ADR-004) | ✓ | ✓ | ✓ staging | migration only | — | — | Worker phone offline in Chrome (390 px, en + fr) and owner desktop; forced-race test for two managers |
| Vendor credit (22 Oct, ADR-002 §5) | ✓ | ✓ | ✓ staging | read-only replay | n/a | — | Production payments all exact: no figure changes |
| Desktop install (22 Oct) | ✓ | — | ✓ staging | — | n/a | — | Chrome installability check passes; the install click is the owner's |

## 4. Findings and fixes in this pass (20 Oct 2026)

| Sev | Finding | Status |
|---|---|---|
| **High** (data) | A record saved while a sync was running disappeared from the screen and the in-memory ledger when that sync finished (the sync replaced records with its start-of-sync copy). It stayed saved on the device and uploaded after the app reopened, but a worker could re-enter it → duplicate stock movement. | **Fixed** (`5533d88`), deterministic regression test, deployed |
| Medium | "Remove from this device" during a running sync could bring the profile back; it deleted records not yet sent with one tap and no warning. | **Fixed**: session ends first; confirmation; explicit warning with the unsent count |
| Medium | Switching person / opening the demo while a slow sync ran could write the previous person's identity and records into the new session. | **Fixed**: session-generation guard (defence in depth — closing the old database already blocked most paths) |
| Medium | A sync requested while another ran was dropped until the 30 s timer. | **Fixed**, regression test |
| Medium (UX) | Owner on a forgotten laptop saw "Waiting for the owner" (themselves). Live log shows this happened again on 20 Oct (`MCS-MH4`). | **Fixed**: owner-aware screen, recovery prefilled; root cause is browser-side clearing (`AUTH_AND_RECOVERY.md` §3) |
| Low | Two simultaneous first setups could create two owners (needs the setup key; only before first setup). | **Fixed**: atomic guard + test |
| Low | Interrupted first setup could never show the starter step again. | **Fixed**: server-decided `starterNeeded` |
| Low | No IndexedDB → app stuck on "Opening…". | **Fixed**: explanatory screen |
| Medium (UX) | French/Swahili header filters wider than a 390 px phone (page zoomed out); phone header status pushed the page sideways; disabled worker actions looked enabled; 4 unnamed form fields; small phone targets. | **Fixed**, 189-screen sweep clean |
| Medium (i18n) | 51 of 71 fixed server/rule messages showed in English to fr/sw users. | **Fixed** (45 user-facing; 6 operator-only stay English) + build-failing test |
| Info | Live owner-escalation guard (`9699c53`) was not deployed. | **Deployed** 20 Oct (`d78753fe`) |

**Security review (this pass):** no Critical or High security finding. Verified:
parameterised SQL everywhere (no string-built SQL); no XSS sinks; strict CSP
on pages, `no-store`/`nosniff`/`no-referrer` on API responses; same-origin
check on writes; bearer tokens (no cookies, so no CSRF); 512 KB body cap;
pull paginated; PIN as HMAC with pepper; device secret and session tokens
stored hashed; constant-time comparisons; per-account staged lockout + 30
failures/hour per network; worker download filter server-side (AT-13);
production dependencies 0 advisories (`npm audit --omit=dev`). Not claimed:
protection against volumetric attacks (none on the free plan; Cloudflare's
network absorbs some) — no load or intrusive testing was done on production.

Remaining, accepted or for the owner:
- *Low:* the per-network limit is shared — many phones behind one mobile-carrier
  address could be slowed by one person typing wrong codes for an hour.
- *Low:* a 4-digit worker code protects the app on the phone only lightly; the
  phone's data is not encrypted at rest (block a lost phone).
- *Low:* sign-in tells "known name, wrong code" from "unknown name" via the
  tries-left hint (names are not secret; deliberate UX).
- *Info:* dev-only advisories (`sharp` via wrangler/miniflare); `auth_events`
  grows without pruning (fine at family scale); unexpected server errors are
  logged (message and stack only, no request bodies).

## 5. Open business questions found by testing (owner decides)

1. ~~A take arriving after its day was closed is refused.~~ **Decided and
   built 22 Oct** (ADR-004): kept as a late record for a manager — Reject with
   a reason, or Reopen the day and accept, then close again.
2. ~~Overpaying a purchase cannot roll onto other purchases.~~ **Decided and
   built 22 Oct** (ADR-002 §5): the purchase is paid in full, the extra is
   visible vendor credit, which can be allocated to other purchases; existing
   payments can be re-split without cancelling them.
3. Passkey (Windows Hello / phone screen-lock) as a second, optional owner
   recovery method — assessed, recommended only if the laptop keeps losing its
   data after the browser setting is fixed (`AUTH_AND_RECOVERY.md` §5).
4. Removing the public "Explore the demo" entry at release (keep it during
   testing).

## 6. Owner action needed now

- **Done by you on 21 Oct** (recovered as `THS-8GK`, retired `WR8-WYS` and
  `MCS-MH4`) — and **again on 22 Oct** (recovered as `EVK-NWF`): the browser
  cleared the site's data once more. After fixing the setting below, retire
  `THS-8GK` in People & devices and re-approve Azadi and Naomi on the laptop
  if they use it there.
- **Stop the laptop forgetting itself:** in Chrome, *Settings → Privacy and
  security → Third-party cookies / Site data*: turn off "Delete data sites have
  saved … when you close all windows", or add `mabubu.mabubu-family.workers.dev`
  to "Allowed to save data". Open Mabubu from the installed app.
- Copy `C:\Users\Admin\Documents\mabubu-backups\` to a USB stick / Drive.

## 7. Safe testing

1. Automated tests (`tests/`). 2. Explore Demo. 3. **Staging** — Worker
`mabubu-staging` + D1 `mabubu-staging`, synthetic data only
(https://mabubu-staging.mabubu-family.workers.dev; `npm run deploy:staging`;
its own secrets; the staging-only key and test codes are in
`Documents\mabubu-backups\STAGING-ONLY-setup-key.txt`, never in Git).
4. Controlled production checks — backup first, read-only where possible.

## 8. Backup, restore and rollback (rehearsed 20 Oct 2026)

- **Backup:** `npx wrangler d1 export mabubu --remote --output <outside the
  repo>`; this pass: `Documents\mabubu-backups\mabubu-backup-2026-10-20-*.sql`
  (3 files). Exports are retried automatically if the network drops.
- **Restore (rehearsed safely):** the 20 Oct export was loaded into a brand-new
  SQLite database: identical counts (2 users, 5 devices, 32 ops, 22 entities,
  15 balances, 3 migrations), integrity check ok, 0 foreign-key violations.
  `wrangler d1 execute --local --file` fails on this Windows machine for *any*
  file (tool problem, not the backup). A real restore goes into a **new** D1
  database, never over the live one with newer records; compare first.
- **Worker rollback (rehearsed on staging):** deploy → `npx wrangler rollback
  <older-version> --env staging --yes` → the older bundle was served and
  `/api/health` answered → roll forward → data unchanged. **Lesson:** every
  secret change creates a new Worker version, and rolling back to a version
  older than a secret change restores the old secret — on staging this broke
  sign-in on the rolled-back version, exactly as predicted. **Production is
  safe today:** its secrets were set before the first code version, so every
  rollback target uses the current secrets.
- **Production rollback targets:** current `380168bd` (main `8360a43`, 24 Oct
  2026, schema 0001–0004); previous `d20cecee` (`444a88b`), `6b124483`
  (`5533d88`), `d78753fe` (`6586145`), `6bd4ba0f` (`47c895e`). The older ones
  run fine on schema 0004 (they ignore its two nullable columns; see
  `DEPLOY.md` for what a rollback would mean for late records and
  allocations). Worker rollback never changes D1 data or schema; a data
  mistake is corrected in the app (void) or, in a disaster, by Time Travel /
  restore into a new database after exporting. Restore point taken just
  before migration 0004: Time Travel bookmark
  `0000004a-00000000-0000510e-5d2fe492183a86ab41a8e743a36cd800` (24 Oct).
- **Not rehearsed:** a rollback on production itself; a D1 Time Travel restore.

## 9. Performance (measured 20 Oct 2026, staging, CPU throttled 4×)

| Network | First visit | Later opens | Later opens offline |
|---|---|---|---|
| slow 3G (400 kbit/s, 400 ms) | 12.8–15.5 s | 1.0–4.2 s | 0.3–0.5 s |
| 4G (9 Mbit/s, 60 ms) | 2.0–8.0 s | 0.9–1.9 s | 0.6–0.9 s (once cached) |

Main script 901 kB (≈270 kB compressed). The offline cache is now 1,964 KiB
(was 2,052; unused font subsets removed). JS heap after start ≈ 6–7 MB. The
bundle size is **not** a measured daily problem: after the first visit the app
opens from the device in about a second. The first visit on a slow link is
slow, and the full offline cache (≈2 MB, incl. 711 kB fonts and 410 kB PDF
library) must finish downloading before the phone can work offline — do the
first install on Wi-Fi. Not measured: a physical low-end phone.

## 10. Accessibility and responsive layout

Sweep of 189 screens (390 / 768 / 1280 px × en / fr / sw × owner and worker,
measured against the device width): **no horizontal overflow, no clipped
labels, every form control has an accessible name**, every worker-screen
control ≥ 40 px tall except the 36 px header status. Remaining: no screen-reader
walkthrough by a person; colour contrast not formally measured.

## 11. Android (physical) — not yet done

ADB 37 is installed. On 22 Oct the Tecno Spark 10 Pro was reachable on the
same Wi-Fi (`192.168.100.13`, Wireless debugging port open), but this laptop is
**not paired** with it: `adb connect` reported the device offline (untrusted
key), and mDNS discovery saw nothing (the Wi-Fi is set to "Public" in Windows).
Pairing needs the code shown on the phone, typed by the owner in a separate
PowerShell window (`adb pair <IP:port>`); the code is never written down here.
The plan in the handover runs against **staging** with the test worker, so
real records are never touched. The emulated and Chrome results above are not
a substitute.

## 12. Criteria for declaring 1.0.0 (recommendation; owner decides)

- [x] No unresolved Critical/High security, financial, auth or data finding
      (the High data finding of this pass is fixed and deployed).
- [x] typecheck / tests / build green with regression tests — **249 tests** (24 Oct).
- [ ] Owner's laptop keeps its identity (it needed recovery again on 22 Oct);
      routine sign-in from the installed app confirmed by the owner.
- [ ] Physical Android test passed on staging (install, French, offline day,
      sync, restart).
- [ ] French and Swahili reviewed by a family member (`LANGUAGE_REVIEW.md`).
- [x] Backup + restore rehearsed; rollback rehearsed on staging and documented.
- [x] Owner decided §5 items 1–2 (22 Oct brief); built and tested.
- [ ] Owner reviews the known limitations (`STATUS.md`, ADR-004 "Known limits").
- [ ] Owner explicitly approves `1.0.0`.

The evidence does **not** yet support declaring 1.0.0.
