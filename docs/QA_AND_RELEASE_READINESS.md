# Quality assurance & release readiness

Living document. Last updated **26 Oct 2026** (temporary owner sign-in, keyboard and phone keypad on real devices, archived people, updates). Read `CLAUDE.md`,
then `docs/STATUS.md` and `docs/HANDOVER_NEXT_SESSION.md`, then this file.

It records the release phase, what has actually been verified (and how), the
data that must be preserved, open findings, and the evidence still needed
before a stable 1.0.0. **Stable release is the owner's decision.**

---

## 0. Release-readiness matrix (26 Oct 2026)

Evidence levels, in order: **I** implemented · **A** automated tests ·
**S** tested on staging (browser) · **D** verified on a physical device (the
owner's laptop browser in a separate test profile, or the Tecno over USB) ·
**P** deployed to production · **V** verified in production by real use.
"—" = not yet. No percentage is given: the items are not of equal weight, and
a number would hide which ones block.

| Area | I | A | S | D | P | V | Evidence / what is missing |
|---|---|---|---|---|---|---|---|
| Sign-in, device approval, owner recovery | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | Production recoveries 19–25 Oct; staging recovery through "Make it one of my devices" 25 Oct |
| **Temporary owner sign-in** (ADR-006) | ✓ | ✓ | ✓ | ✓ laptop | ✓ `a32b930c` | — | 10 server + 5 end-to-end tests; real Chrome and an app window on staging (23/23 and 24/24 checks): choice screen, sign in, ribbon, no People & devices, nothing stored, reload, sign out; owner ended one from People & devices. **Not yet used on production** — owner to try (§6) |
| Keyboard PIN (desktop) | ✓ | ✓ | ✓ | ✓ laptop | ✓ | — | Real Windows key events (not simulated in the page): number row, numeric keypad, Backspace, Delete, Enter and keypad Enter; double Enter sends one sign-in; wrong code clears. AZERTY by key position (unit test). Not tried in the owner's own installed app |
| Phone keypad layout | ✓ | — | ✓ | ✓ Tecno | ✓ | — | **Found on the Tecno:** with the "sign in online" reason and an error, Delete/0/Enter ended at 706 px of 688. Fixed; now 639 / 661 / 639 px (en / fr / sw) with both shown, keys still 54 px. Real taps and hardware keys on the phone |
| Device identity | ✓ | ✓ | ✓ | ✓ | ✓ | partial | Same identity across reload, tab reload, app restart (staging, Tecno); retries reuse one device row (server test); the identity race test fails when the fix is removed. Laptop losses are site-data deletions outside the app (AUTH §3) |
| People & devices: archive, retire, devices nobody may use | ✓ | ✓ | ✓ | ✓ Tecno | ✓ | — | Archived person taken off a phone's list (end-to-end test; on production Jijo is still listed on the Tecno until someone signs in there on the new version); server refuses new work for archived people |
| New code works at once on a phone | ✓ | ✓ | — | — | ✓ | — | End-to-end test (phone remembers the old code) |
| Install (Windows) | ✓ | — | ✓ | ✓ | ✓ | ✓ | Owner installed it 25 Oct (Profile 2); not offered during a temporary sign-in |
| Install (Android) | ✓ | — | ✓ | ✓ | ✓ | ✓ | Staging app installed on the Tecno 25 Oct 19:17 (opens standalone, same device, language kept); production app installed since 18 Oct |
| App updates | ✓ | ✓ | ✓ | ✓ Tecno | ✓ | — | On the Tecno: "A new version of Mabubu is ready" shown while open; a real tap on Reload loaded the new build. Background tab updated by itself. Updates now also checked while the app stays open |
| Offline records, sync, late records | ✓ | ✓ | ✓ | ✓ Tecno | ✓ | — | Tecno (staging, 14/14): take 5 / return 2 once each; offline take saved on the phone; manager closed the day; on reconnect the take arrived once and was held; manager's rejection reached the phone; no duplicates |
| Financial calculations, stock ledger | ✓ | ✓ | ✓ | — | ✓ | ✓ | Property tests, reconciliation, production replay (20 Oct) |
| Backup and restore | ✓ | — | ✓ | — | ✓ | ✓ | Export of 25 Oct 18:32 restored into a fresh database: all counts equal, integrity ok. Production rollback not rehearsed (staging only) |
| Go-live cutover | ✓ | ✓ | ✓ | ✓ | ✓ | — | Preview recomputed 25 Oct (GO_LIVE_CUTOVER §5). **Not run on production** |
| Security | ✓ | ✓ | — | — | ✓ | — | Reviews 19–20 Oct; this pass: temporary sign-in owner-only, no owner-only rights, same lockout (tests). No external audit |
| English / French / Swahili | ✓ | ✓ | ✓ | ✓ | ✓ | — | Native-speaker review not done (LANGUAGE_REVIEW §6–7) |
| Worker / manager day by real people | ✓ | ✓ | ✓ | ✓ staging | ✓ | — | Said's and Nancy's phones have not connected since 21–22 Oct |

**Before the clean start:** the owner settles §12 decisions and the "Jijo /
Jijo 2" question, every phone (incl. Said's and Nancy's) opens Mabubu online
once, the go-live day itself (GO_LIVE_CUTOVER §3), then the real opening stock
count.
**Before calling it 1.0.0 (owner's approval):** a few weeks of real use without
data problems, native-speaker review, a rehearsed production restore, the
open decisions settled (§12).
**Can wait for the family's feedback:** wording, the how-to card, downloads in
French, the next-phase features.

## 1. Version and phase

- **Version:** `0.1.0` (`package.json`; no other version metadata in the build
  or the Worker). Correct for the phase: live, holding real records, under test.
- **Phase:** testing / pre-release. Do not declare stable without the owner.
- **Policy (semver):** stay on `0.x` while testing; first stable is **`1.0.0`**
  (never `1.1.0` as a first stable); then `1.0.x` fixes, `1.x.0` features;
  optional `1.0.0-rc.1`. Never change the version silently.

## 2. Canonical production configuration (verified 25 Oct 2026, 18:32 UTC, read-only)

- **People:** 7 — George Muraguri (owner, the only owner), Said Abdou and
  Nancy Muthoni (managers), **Jijo 2** (worker, created 25 Oct 16:22, no
  records yet). Archived on 25 Oct, history kept: Jijo, Azadi Mdogo, Naomi.
- **Devices:** 12 rows, history kept. In use: `5YK-3GS` owner laptop
  (Profile 2, recovered 25 Oct 16:14), `YB7-EN2` the Tecno (Jijo 2; Jijo's
  access removed), `E3C-59E` Said's phone, `ZWU-XJ7` Nancy's phone. Nobody
  allowed: `A33-8RR` (Chrome Profile 13, the owner's test of "another
  computer"; both requests refused). Blocked + retired: `WNY-S7J`, `ZZU-23X`,
  `WR8-WYS`, `MCS-MH4`, `THS-8GK`, `EVK-NWF`, `UNG-RUF`.
- **Records:** 79 operations (highest seq 87), 44 entities, 47 stock balance
  rows netting to zero; all test activity (GO_LIVE_CUTOVER §5). No temporary
  sign-in yet.
- **Schema:** migrations 0001–0006 (0006 applied 25 Oct after the export
  `Documents\mabubu-backups\mabubu-backup-2026-10-25-pre-0006-temporary-signin.sql`,
  verified by a full restore into a fresh SQLite: identical counts, integrity
  ok, 0 foreign-key violations; Time Travel bookmark before 0006:
  `00000064-00000000-0000510f-546f0f0bc4bbe8b66113e174ec860320`).
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

## 4a. Findings and fixes, 25–26 Oct 2026 (owner's master brief)

Every fix below has a regression test, and each test was seen to **fail with
the fix removed** (10 fixes checked that way, then restored exactly).

| Sev | Finding (how it was found) | Status |
|---|---|---|
| High (UX) | The owner on a computer that is not theirs could only wait or use the paper key (owner's report; live log 25 Oct) | **Built**: temporary owner sign-in (ADR-006) |
| High (UX) | Phone keypad: with the "sign in online" reason and an error, Delete / 0 / Enter ended at 706 px of a 688 px screen (**measured on the Tecno**, real taps) | **Fixed** (layout, not smaller keys); 639–661 px in en/fr/sw |
| Medium | An archived person stayed on a phone's "Who is working?" list (Jijo on the Tecno, seen over USB) | **Fixed**: downloads say who may no longer sign in on the device; the app takes them off (kept, marked, if records are unsent) |
| Medium | Archiving was enforced only by the screens: a manager's app or a direct request could still start a new day for an archived person | **Fixed** in the rules (server and app); a started day can be finished; replay unaffected |
| Medium | After the owner set a new code, the phone still refused it ("Wrong code, N tries left on this device") until 5 tries — the likely reason "Jijo 2" was created | **Fixed**: online, a code the phone does not recognise is checked by the server |
| Medium | An app left open never checked for a new version (screen changes do not ask the server) | **Fixed**: checks on return to view and hourly |
| Low | A new version could reload the page on leaving it while a form or the code was half typed | **Fixed**: waits until nothing is in progress |
| Low | French (AZERTY) number row typed `& é " '…` instead of digits on the code screen | **Fixed**: digits by key position |
| Low | "Remove" (a person's access on a device) could be pressed twice (two log entries 3 s apart on 25 Oct) | **Fixed**: the line disappears at once and waits for the answer |
| Info | The laptop's identity was lost again at 16:10 UTC 25 Oct — Mabubu's site data only, deleted outside the app (AUTH_AND_RECOVERY §3) | Explained; temporary sign-in removes the key from ordinary use |

## 4c. Findings and fixes, 26–27 Oct 2026 (owner's production-readiness directive)

Found on the **live app** (owner test window, a test worker browser, the real
Tecno) unless noted. Each fix deployed and re-checked on the live app.

| Finding | Evidence | Fix | Verified |
|---|---|---|---|
| Laptop "Enter does not work" | Sign-in log: wrong codes 20:00 and 20:18 UTC after the fix was live; laptop cache got it at 20:00:10, page kept the old code | A waiting version takes over on any sign-in screen; build time shown there | Real keys 17/17 tab and app window; reload into the new version on live |
| New tab / reload asked for the code (normal sign-in) | Code: every page load started at the code screen | Continue the person signed in in this browser (open tab, or reload within 20 min); Lock locks all | `tabs-e2e` (fails without the fix); live: Reload bar kept the sign-in |
| Phone launcher kept the garment icon | Tecno: WebAPK from 18 Oct; Chrome offered a name-only update | Reinstall (data kept) | Launcher search shows NAS Mabubu with the NAS logo |
| Route labels ~5 px and in the brand row on phones | Measured 360 px: 18×5 px labels | Own strip between brand and headline | 320/360/412 px, real Tecno |
| Stock download hid garments below zero | File 2,201 ready vs screen 2,124 | Skip only all-zero rows | Regression test; live CSV 2,124 / 197 = screen |
| People & devices never showed a new request while open | Live: "Waiting 0" until reopened | Refresh every 10 s on screen and on return | Live: 2 refreshes in 21 s |
| Waiting screen made two sessions | Log 21:01:41, two `login_ok` 0.2 s apart | One check at a time | Code review (timing race) |
| Activity log 269 px wider than a phone | Long warning labels | Wrap | Live 390 px: no overflow |
| fr/sw: converter button +93–147 px, Lock button +7 px at 320 px | Crawl of every page | Wrap | Re-crawl: none |
| "Word documents are not offered yet" under the Word option | Live download sheet | Sentence removed (en/fr/sw) | — |
| A cancelled purchase did not say so on its page | Live | "Cancelled" pill in the heading | — |

## 4b. Findings and fixes, 26 Oct 2026 (owner's master directive)

| Finding | Evidence | Fix | Verified |
|---|---|---|---|
| A held digit key repeated on the code screen | Real key events on staging: 1, 2 held, 3 → 6 digits; production log wrong codes 12:41, 17:37 | Repeat ignored; real focused code field | Staging tab 28/28, app window 29/29; Tecno 18/18, 17/17 |
| No focused field: typing depended on page-wide key handling | DevTools: focus on BODY | `.pin-field` over the dots, focus ring, keypad clicks keep focus | as above |
| Temporary sign-in lost on every new tab, and ended the other tab | Production log: 4 temporary sign-ins in 8 min on 7CY-7ET | Tabs share it (BroadcastChannel) | `temporary-e2e` test; staging new-tab check |
| A pasted People link showed a server error in a temporary sign-in | Code: route not guarded; server 403 | View-only People; plain "not available" page elsewhere | worker tests; staging |
| PDF notes started with "?" | Rendered PDF (pypdfium2) | "•" mapped to "·" | reports test |
| Sign-in art: "Moroni" under the headline at 360 px | Tecno screenshot | Route drawing ends at 44 % on phones | Tecno staging, measured |
| Six, not five, recorded exchange rates | Production read-only query | Listed one by one in the go-live preview | GO_LIVE_CUTOVER §5 |

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

## 6. Owner action needed now (26 Oct)

- **Try the temporary sign-in once** (the first real use on production): in a
  normal Chrome window of another profile or another computer, open
  <https://mabubu.mabubu-family.workers.dev>, type your name and code, choose
  **Sign in temporarily**, look around, press **Sign out**. Then on your laptop
  open People & devices: it is listed under "Recent temporary sign-ins".
- **Type your code on the laptop keyboard** in the installed app (number row
  and numeric keypad, Backspace, Delete, Enter) and say if anything differs.
- **Approve your phone as a second owner device:** on the Tecno's production
  app, "Someone else" → your name and code → "Make it one of my devices" →
  approve its code from People & devices on the laptop. Then a laptop that
  forgets itself can be approved from the phone, without the key.
- **Jijo / Jijo 2:** tell us which one is the real worker (GO_LIVE_CUTOVER §5
  point 5). On the Tecno, "Jijo" leaves the sign-in list the next time
  Jijo 2 signs in there (or when "Jijo" is tapped) — unless records saved as
  Jijo on that phone never reached the server; then it stays, marked "No
  longer allowed on this device", until they are dealt with.
- Ask **Said and Nancy** to open Mabubu online once (not seen since 21–22 Oct).
- Copy `C:\Users\Admin\Documents\mabubu-backups\` to a USB stick / Drive.

## 7. Safe testing

1. Automated tests (`tests/`). 2. Explore Demo. 3. A local copy of the same
build (`npx wrangler dev`, local database). 4. **The live app** — backup and
snapshot first; before go-live, marked test records only, never set-up records
(DEPLOY.md, "Testing a change"). The staging copy used until 26 Oct 2026 was
deleted at the owner's request (its tests are recorded above as **S**).

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
- **Production rollback targets (26 Oct):** current `a32b930c` (main
  `c1cb55b`, 25 Oct 2026, schema 0001–0006); previous `cdc994c6` (`232ea73`,
  schema 0005 — runs on 0006, refuses temporary sign-ins: safe, see DEPLOY.md);
  before that `380168bd` (main `8360a43`, 24 Oct 2026, schema 0001–0004); previous `d20cecee` (`444a88b`), `6b124483`
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

## 11. Android (physical)

### Second session, 25 Oct 2026 evening

Tecno Spark 10 Pro (`TECNO_KI7`,
Android 13, Chrome 155.0.8059.84, over USB; staging, synthetic data): code
screen with real taps and hardware keys (12 checks), keypad layout in
en/fr/sw with and without errors (after the fix), the "new version ready" bar
and Reload, a worker's day with no connection and a late record decided by a
manager (14/14), the installed staging app (standalone, same device, language
kept). Production on the phone: device `YB7-EN2` holds "Jijo" (archived) and
"Jijo 2"; read-only. Not done on the phone: a temporary sign-in, a manager's
day by a real manager, production use after the new version.

### First session, 25 Oct 2026

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
- [x] typecheck / tests / build green with regression tests — **310 tests** (25 Oct).
- [ ] Owner's laptop keeps its identity (lost again 25 Oct 16:10); routine
      sign-in from the installed app — or a temporary sign-in — confirmed by
      the owner on production.
- [x] Physical Android test passed on staging (install, offline day, sync,
      late record, update, restart; keypad in en/fr/sw) — 25 Oct.
- [ ] Temporary owner sign-in used once on production and reviewed by the owner.
- [ ] French and Swahili reviewed by a family member (`LANGUAGE_REVIEW.md`).
- [x] Backup + restore rehearsed; rollback rehearsed on staging and documented.
- [x] Owner decided §5 items 1–2 (22 Oct brief); built and tested.
- [ ] Owner reviews the known limitations (`STATUS.md`, ADR-004 "Known limits").
- [ ] Owner explicitly approves `1.0.0`.

The evidence does **not** yet support declaring 1.0.0.
