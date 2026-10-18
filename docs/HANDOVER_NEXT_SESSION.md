# Handover — next session

Last updated 18 Oct 2026 (evening). Read `CLAUDE.md`, then this file, then `docs/STATUS.md`.

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
