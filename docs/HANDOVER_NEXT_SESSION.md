# Handover — next session

Last updated 25 Oct 2026 (evening). Read `CLAUDE.md`, then this file, then `docs/STATUS.md`.

## 25 Oct session — identity investigation, keyboard PIN, phone keypad, install offer, archive, go-live cutover (deployed: `cdc994c6`)

Owner-authorised master brief (25 Oct). Commits `b7f3a06` (identity race,
PIN keyboard, phone keypad), `e4a488d` (install offer, archive people),
`8398a09` (go-live cutover, migration 0005), `232ea73` (service-worker update
fix). 282 tests.

- **Laptop identity:** evidence in `docs/AUTH_AND_RECOVERY.md` §3 — every
  laptop identity was born in Chrome Profile 2 after a profile-wide site-data
  wipe. Code race fixed (`getDevice` in one transaction with `add`).
- **Android over USB works**: Tecno KI7 (Spark 10 Pro), Android 13, Chrome
  155, serial authorised (laptop key fingerprint 54:9F:…:18:E5). DevTools via
  `adb forward tcp:9222 localabstract:chrome_devtools_remote` (localhost only).
  Android Chrome refuses `/json/new` and tab switching — open a page in front
  with `adb shell am start -a android.intent.action.VIEW -d <url> com.android.chrome`.
  **Never use airplane mode or turn off mobile data on the phone: the laptop's
  internet is the phone's hotspot.** To simulate no connection, fail the
  page's and service worker's `/api` requests with the DevTools `Fetch`
  domain (scripts were in the session scratchpad). DevTools "offline"
  emulation does not stop the app's requests.
- **Staging** (`24043488`, migration 0005): go-live run twice through the
  screens (meta `phase`/`golive_backup` reset once on staging only, to repeat
  it). Test person "Archive Check …" created; Test Worker approved on the
  Tecno (`VA9-X54`); a new headless-laptop owner device (`H26-WTB`).
- **Production (25 Oct, after export
  `Documents\mabubu-backups\mabubu-backup-2026-10-25-pre-0005-golive.sql`,
  restore-checked; Time Travel bookmark
  `00000059-00000000-0000510f-9dfdecec529877c590eb9b2a314ca483`):** migration
  0005 applied, deploy `cdc994c6`. Smoke: health 200, setup status
  `needsSetup:false`, admin/golive/sync 401 without a session, manifest 200,
  sw.js skips waiting; counts unchanged (6 people, 10 devices, 79 ops, 44
  entities, 47 balances net 0); phase pre-release, no cutover. Production
  cutover preview: `docs/GO_LIVE_CUTOVER.md` §5.
- **Not verified:** the Android install tap; the "new version ready" bar on a
  later update (the first switch was driven by the old code's immediate
  reload); keyboard PIN in the owner's own Chrome; native-speaker review of the
  new strings (`docs/LANGUAGE_REVIEW.md` §6).

## 22–25 Oct session — approve once, late records, vendor credit, desktop app (deployed: `380168bd`)

Owner-authorised brief (22 Oct) + the owner's bug report ("I was able to approve
twice"). Commits `f50c15a` (approve once), `798594a` (late records, migration
0004), `3eaca0c` (vendor credit + sync follow-up fix), `971b5c4`/`32a30a0`
(desktop install, test timeout), `8360a43` (fixes from the staging browser run).
249 tests.

- **Approve once.** Production had Naomi 21 Oct and Jijo 20 Oct approved 3×
  each (the owner's notes said so). Rules now refuse a second review of an
  approved day; the screen shows "Approved by … · when"; saves on a device run
  one after another (two taps cannot both save). The existing repeat approvals
  still replay (replay keeps what the server accepted).
- **Late records (ADR-004).** `day_closed` code → server holds the record
  (`ops.review`), manager decides with `op.resolve` (reject with reason, or
  reopen + accept + close again). Sync protocol 2 (`SYNC_PROTO`): new record
  types only to apps asking `proto=2`; the new app re-downloads once.
- **Vendor credit (ADR-002 §5).** `payment.allocate` splits; `vendorAccounts()`
  caps payments at what a purchase owes, extra = credit; `previewAccount()` for
  the payment sheet. Production payments all exact → no figure changed.
- **Desktop.** Manifest `id`/`scope`/`launch_handler`, rounded 512 icon +
  separate maskable; Install button only on the browser's own offer; version
  under Me. Guide: `docs/INSTALL_DESKTOP.md`.
- **Production (24 Oct, after export
  `Documents\mabubu-backups\mabubu-backup-2026-10-24-pre-0004-late-records-credit.sql`,
  restore-verified):** migration 0004 applied, then deploy `380168bd`. Smoke:
  health 200, setup status `needsSetup:false`, admin 401, manifest 200,
  installable (Chrome API), data counts unchanged (6 people, 9 devices,
  77 ops, balances net 0). Time Travel bookmark before 0004 is in the QA doc §8.
- **Staging:** migrated + deployed (`930f18cd`, then the 8360a43 build).
  Synthetic additions: "Mombasa (test)", "Hafsa (test)", garment `TST-01`
  with 60 pieces at Comoros, two test purchases and one test payment, and
  test sales days for Test Worker on 22 and 24 Oct. Browser checks were
  driven over the DevTools protocol (scripts in the session scratchpad, not
  the repo): late-record flow 16/17 then all clear after the phone-overflow
  fix; vendor-credit flow all checks; phone layout 390 px en + fr clean.
- **Owner laptop:** recovered again on 22 Oct (`EVK-NWF`); `THS-8GK` probably
  dead. Owner to fix the Chrome site-data setting, install the app, then
  retire `THS-8GK` (it also holds Azadi's and Naomi's laptop approvals).
- **Android (not done):** the Tecno was reachable at `192.168.100.13` with
  Wireless debugging on, but the laptop is **not paired** (`adb connect` →
  offline/untrusted; mDNS saw nothing; the Wi-Fi is "Public" in Windows).
  The owner must pair in a separate PowerShell window (plan below), then the
  physical test runs against staging.
- **Not verified:** physical Android; the install click in the owner's own
  Chrome; native-speaker review (new strings added to `LANGUAGE_REVIEW.md` §5).

## 20 Oct session — second QA pass (deployed: `d78753fe`, `6b124483`, `d20cecee`)

Full record: `docs/QA_AND_RELEASE_READINESS.md`. Commits `5533d88` (auth
lifecycle + store sync fixes), `6f4cf0d` (phone layout/accessibility, staging),
`2ccedb7` (financial reconciliation), `7905821` (translations, review sheet),
`444a88b` (smaller offline cache). 193 tests.

- **Production deploys (each after a verified export to
  `Documents\mabubu-backups\`, outside the repo):** `d78753fe` = escalation
  guard; `6b124483` = auth/sync fixes; `d20cecee` = UX/i18n/precache. No
  migration; data unchanged after each (counts checked). One `setup_wrong_key`
  sign-in-log entry on 20 Oct ~11:41 UTC came from a deliberate smoke check.
- **Owner laptop:** forgot itself again on 20 Oct (new pending identity
  `MCS-MH4`, same Chrome). The app never deletes the identity; the browser
  cleared it. Owner must recover with the key and fix the Chrome setting (QA §6).
- **Staging:** `wrangler.jsonc` env `staging` → Worker `mabubu-staging`, D1
  `mabubu-staging` (`7a3d9fe8-…`), own secrets; synthetic demo-catalogue data;
  test owner "Test Owner", test worker "Test Worker" (codes and staging key in
  `Documents\mabubu-backups\STAGING-ONLY-setup-key.txt`). Never copy production
  data there. Setting secrets from Windows PowerShell 5.1 by piping corrupts
  them — paste interactively, or pipe from Git Bash with `printf '%s'`.
- **Not done:** physical Android (no phone paired), native-speaker review,
  production rollback (rehearsed on staging only).

### Android test plan (needs the owner's phone)

1. Owner: phone on the same Wi-Fi as the laptop; Settings → Developer options →
   **Wireless debugging** on → "Pair device with pairing code". In a **separate
   PowerShell window on the laptop** (not in the chat) run
   `& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" pair <IP:port>`
   and type the 6-digit code there. Then tell the agent "paired".
2. Agent: `adb mdns services` / `adb connect`, `adb devices -l`; record model,
   Android and Chrome versions only.
3. Use **staging** with "Test Worker"; approve the phone as Test Owner. Drive
   Chrome through `adb forward tcp:9222 localabstract:chrome_devtools_remote`
   (the same DevTools scripts as the emulated run), or guide the owner step by step.
4. Steps: French → install to home screen → reopen → sign in → take 10 /
   return 2 → airplane mode → close day → check "saved on this device" →
   network on → one closing on the server, no duplicates → restart → final state.
5. `adb disconnect`; owner turns Wireless debugging off.

## 19 Oct session (3) — retired-device lifecycle (built, tested, deployed) + start of the QA/pre-release pass

Context: the owner opened a testing/auditing/pre-release pass (QA, security,
financial correctness, demo/sync safety, docs, then workflow + Android). First
deliverable: make the two superseded Windows laptops stop looking like
temporarily-blocked devices. See commit `47c895e`.

**What changed (code — commit `47c895e`, pushed to `main`):** devices had only
one off-switch (`revoked_at`). Added a third lifecycle state so a device is
*active*, *temporarily blocked*, or *retired*.
- Migration `0003_device_retired.sql` adds `devices.retired_at`. Retired implies
  blocked, so the existing auth checks already refuse a retired device — **no
  auth change**. Owner recovery clears `retired_at` when it reactivates its own
  device.
- `/admin/devices` accepts `{ retired }`: retiring blocks + ends sessions + logs
  `device_retired`; reactivating clears both flags + logs `device_reactivated`.
  Cannot act on your own device; still needs `users.manage`; a plain unblock
  never resurrects a retired device.
- People screen: retired devices live in a **collapsed "Retired devices"**
  section with a confirmed **Reactivate** (no Unblock). en/fr/sw strings added
  (not native-reviewed). 5 new worker tests (147 total). typecheck/test/build clean.
- `.gitignore` now un-ignores `migrations/*.sql` — the blanket `*.sql` backup
  rule would otherwise have dropped this migration from the repo.

**Done to production (owner-authorised, backup first, history preserved):**
- Backup: `mabubu-backup-2026-10-19-pre-retired-migration.sql` (git-ignored, not
  in repo; 2 users / 4 devices / 30 ops / 21 entities). **Copy it off the laptop.**
- Applied migration `0003` to remote D1, then deployed. **Version ID
  `6bd4ba0f-b080-4927-8c8d-6c20872d2f30`.**
- Retired `WNY-S7J` and `ZZU-23X` (set `retired_at`; both were already blocked
  with access revoked). Added two `device_retired` audit events (actor = owner).
  Final: `WNY-S7J`/`ZZU-23X` blocked+retired; `YB7-EN2` (Jijo Android) and
  `WR8-WYS` (owner laptop) active. No hard-deletes; ops/entities unchanged.
- Smoke test on the live URL: `GET /` 200; `/api/setup/status` → `needsSetup:false`;
  unauthenticated `/api/admin/people` → 401.

**Note:** the owner laptop and Jijo's phone pick up the new client automatically
the next time each is opened online (service worker update).

**Progress in this QA/pre-release pass** (each its own tested, committed checkpoint):
1. Retired-device lifecycle — built, deployed (`47c895e`, version `6bd4ba0f`).
2. Security review — no Critical/High; owner-role escalation boundary hardened (`9699c53`).
3. Demo isolation + sync safety — verified + regression test (`24a1525`).
4. Financial correctness — money + vendor-balance property tests (`e16358d`).
5. Testing/pre-release docs — `docs/QA_AND_RELEASE_READINESS.md` (versioning policy, canonical config, tested/partial/untested checklist, findings, 1.0.0 criteria).

**Still to do (owner's order):** comprehensive owner/manager/worker end-to-end
workflow testing (demo + a controlled live check) and **physical Android**
verification. Keep the app in its documented testing/pre-release phase; do not
declare `1.0.0` without the owner's explicit approval. See
`docs/QA_AND_RELEASE_READINESS.md` for the full picture.

## 19 Oct session (2) — owner locked out on own laptop: recovery, PIN clarity, device cleanup

Context: the owner cleared the site's browser data on their laptop, then could
not sign back in — correct code, but the app said the device was new and sat on
"waiting for the owner" with no way out, because the only owner was the one
waiting. See `docs/AUTH_AND_RECOVERY.md` for the full model.

**Root cause (confirmed in code and in the live database).** The device identity
(`deviceId` + `deviceSecret`) lives only in IndexedDB (`mabubu-device`). Clearing
site data deletes it, so the app makes a new identity and the server correctly
treats the laptop as a new device. Ordinary login then returns `pending`, and the
sign-in screen had **no owner-recovery route out of the waiting screen**. The live
auth log showed exactly this: the owner's current laptop device was `pending`
since 18 Oct 23:36 and had been polling unapproved. (This is not the duplicate-data
bug — that was already fixed and verified; reference data is clean: 3 places,
5 size groups.)

**Live data: what was actually there.** 2 users only — George Muraguri (owner) and
Jijo (worker); there is **no second George**. 4 devices: Jijo's Android, the
owner's current laptop, and **two superseded "Windows computer" laptop identities**
from earlier site-data clears (all three laptop rows were tied to George, which is
what read as "another George"). Backup taken first:
`mabubu-backup-2026-10-19-auth-precleanup.sql` (git-ignored, not in repo).

**Done to the live database (owner-authorised, history preserved):**
- Approved the owner's current laptop so the lockout ends (the waiting screen logs
  in by itself; if closed, reopening signs in).
- Retired the two superseded laptop identities: blocked, their access revoked,
  dormant sessions revoked. Rows, ops and auth log kept. Jijo's Android and the
  owner's current laptop untouched. Final: 1 owner, 1 worker, 2 active devices
  (owner laptop + Jijo Android), 2 retired laptop rows.

**Done in code (client only — no server/schema/migration change):**
- **Owner recovery UX.** The "waiting for the owner" screen now offers "Are you the
  owner? → Recover owner access", and the setup screen relabels itself as
  **Recover owner access** once a business exists. Both use the existing
  `SETUP_TOKEN` recovery path, which already approves the current device, never
  creates a second owner and never re-seeds (see `src/worker/auth.ts setup()`).
- **PIN length clarity on the "type your name" path.** That path previously showed
  four empty circles with no role (the earlier fix only covered the tap-a-saved-
  profile path). `PinPad` now takes the role; when the role is not known yet it
  shows "Workers 4 digits · owner & managers 6–8", and a dashed circle after the
  minimum shows a longer code is accepted. No change to the accepted range/policy.
- i18n keys added in `en.ts`, `fr.ts`, `sw.ts`. New tests in `tests/worker.test.ts`
  cover recovery on a lost device, wrong key, no-bypass, and no worker→owner
  escalation.

Checks: `npm run typecheck && npm test && npm run build` all clean, **142 tests**.
**Not verified:** a physical Android phone. The owner's own laptop sign-in after
approval is expected to work on reopen but had not polled again at hand-off time.

## 19 Oct session (1) — onboarding bug fix + duplicate cleanup

Context: see `docs/FIX_PROMPT_onboarding_and_duplicates.md` (the owner's report of duplicated places and size groups after re-running setup).

Done and deployed to production (Version ID `d0b633b9`):
- **Root cause (duplicates).** `/setup` now returns `created: true` only on genuine first owner creation and `created: false` on owner recovery (`src/worker/auth.ts`, `src/shared/api.ts`). The client shows the starter-setup screen (which seeds places and size groups) only when `created` is true (`src/client/lib/store.ts`), so re-running setup for recovery never re-seeds. Belt-and-braces: starter seeding is now idempotent — it skips any default whose name already exists and de-duplicates within its own list (`src/client/lib/seed.ts`, used by `StarterSetup.tsx`).
- **Storage persistence (device identity).** `store.boot()` now requests `navigator.storage.persist()` at first boot, before sign-in, to make IndexedDB eviction (which loses the device identity and pushes the owner back through setup) far less likely. Owner recovery is now safe to re-use as a device re-link path because it no longer re-seeds.
- **PIN length clarity.** The sign-in pad shows the expected code length ("6–8 digits" / "4–8 digits") and renders the right number of dots once the role is known (`PinPad.tsx`, `Welcome.tsx`). No change to the accepted range or policy.
- **Minor.** People → "works at" no longer lists inactive places.
- **Live data cleanup.** The owner's live DB had the second seeding (3 extra places + 5 extra size groups). Backup taken first (`mabubu-backup-2026-10-19-precleanup.sql`, git-ignored, not in the repo). The 8 duplicate entity rows + their 8 ops were deleted after confirming nothing referenced them (no prices, no balances, no garment pointed at a duplicate size). Verified after: 3 places, 5 size groups, 5 garments, 3 vendors, 0 orphaned references. Users (owner George Muraguri, worker Jijo), devices and sessions were untouched.

**Still needed (owner action, cannot be done from the dev machine):** the owner's laptop and Jijo's phone already synced the duplicate records, so they must each sign out and sign back in once to re-sync the cleaned data (Me / Account → Lock-switch person → remove the profile → sign in again; the device stays approved). Until they do, those two devices still show the old duplicates locally even though the server is clean.

Checks: `npm run typecheck && npm test && npm run build` clean, 138 tests. **Not verified:** a physical Android phone; the device re-sync described above (owner must do it).

## Where things are

| Item | State (25 Oct 2026) |
|---|---|
| Code | `main` on private GitHub `Jow75/mabubu-business-system`; no force-pushes; no automatic deploy |
| Live app | https://mabubu.mabubu-family.workers.dev — Worker `mabubu`, version `cdc994c6` (main `232ea73`) |
| Database | D1 `mabubu` (`99eb0bfa-…`, WEUR), migrations 0001–0005 (phase: pre-release); real records (1 owner, 2 managers, 3 workers) |
| Staging | https://mabubu-staging.mabubu-family.workers.dev — Worker `mabubu-staging`, D1 `mabubu-staging`, synthetic data |
| Secrets | `PIN_PEPPER`, `SETUP_TOKEN` in Cloudflare only (production set once, 18 Oct) |
| Backups | `C:\Users\Admin\Documents\mabubu-backups\` (outside Git) + older ones in the repo folder (git-ignored). Copy off the laptop |
| Wrangler | Logged in on the owner's laptop; this network drops connections now and then — retry |
| Checks | `npm run typecheck && npm test && npm run build`: clean, 282 tests |

## Done in the 18 Oct session

- Git: repository created, history checked for secrets (none), pushed.
- Cloudflare: database, migrations, secrets, `workers.dev` subdomain `mabubu-family`, deploy. Preview URLs off.
- Languages: English / French / Swahili across the whole interface (ADR-003). The first-use language screen and greetings are new.
- Worker closed day: explanation on screen, Return disabled when closed, engine test of close → blocked → manager reopens → next day.
- Profit report states that garment cost is purchase price only (not landed cost).
- **Bug fixed:** the installed app could not open offline (a start-up file was not cached). `scripts/check-offline.mjs` now fails the build if this returns.

## How it was verified

- Unit and integration tests as above.
- Browser runs with headless Chrome driven over the DevTools protocol (scripts were kept in the session scratchpad, not the repo): the French worker journey at 390 px (language choice, owner setup screen, demo take, close, refused take, manager reopen, Swahili switch), locally and on the live site; owner screens in all three languages at 1280 px and 390 px; offline start by stopping the server and with offline mode on the live site.
- **Not verified:** a physical Android phone; real owner sign-in on the live site (needs the owner's setup key); sync between two real devices on the live server.

## Open work, in order

1. Owner's first sign-in and adding people (owner action).
2. Physical Android test (install, French, offline day, sync).
3. Native-speaker review of the French and Swahili wording; record changes in `src/shared/i18n/fr.ts` and `sw.ts`.
4. Downloads (PDF/Excel/CSV) in the chosen language.
5. Payment credit and allocation moves (ADR-002 open items). This needs a new operation type and the owner's go-ahead.
6. Worker how-to card in French; landed cost per piece; other next-phase items in STATUS.

## Decisions still with the owner

- KMF banknote values and the word for the ÷5 local count (both editable in Settings, unconfirmed).
- Whether to build the two payment features now.
- Any wording changes from the family's language review.

## Notes for an AI agent

- Never print or commit secret values. `.dev.vars` is local only.
- The live database is real business data once the owner signs in: no resets, no test records, no destructive migrations. Back up first (`docs/DEPLOY.md`).
- Every new screen text needs keys in `en.ts`, `fr.ts` and `sw.ts`. The type checker and `tests/i18n.test.ts` enforce it.
- Headless Chrome on this laptop needs a short `--user-data-dir` path (for example under `%LOCALAPPDATA%\Temp\mbt`). Otherwise Cache Storage fails and service-worker tests give false results.
