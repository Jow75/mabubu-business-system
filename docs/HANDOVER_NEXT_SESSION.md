# Handover — next session

Last updated 19 Oct 2026. Read `CLAUDE.md`, then this file, then `docs/STATUS.md`.

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

| Item | State |
|---|---|
| Code | Branch `main`, pushed to private GitHub `Jow75/mabubu-business-system`. Run `git log --oneline -5` for the latest commit. No force-pushes; no automatic deploy from GitHub |
| Live app | https://mabubu.mabubu-family.workers.dev (Cloudflare Worker `mabubu`, free plan) |
| Database | D1 `mabubu`, id `99eb0bfa-4c87-4afc-be5f-3cb0faf397ef` (WEUR). Migrations 0001–0002 applied. **No owner yet, so no business records.** |
| Secrets | `PIN_PEPPER`, `SETUP_TOKEN` set in Cloudflare only. The owner was shown the setup key in Notepad and asked to write it down and delete `Documents\MABUBU-SETUP-KEY.txt` |
| Wrangler login | Logged in on the owner's laptop (`npx wrangler whoami`) |
| Checks | `npm run typecheck && npm test && npm run build`: clean, 132 tests, build includes the offline check |

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
