# Instructions for AI coding agents working on this repository

Read first:
- `docs/requirements/` — the owner's agreed business requirements, the source of truth.
- `docs/decisions/ADR-001-architecture-and-access.md` — the architecture and why.
- `docs/decisions/ADR-002-currency-balances-and-reports.md` — exchange rates, vendor balances and credit (§5), downloads.
- `docs/decisions/ADR-004-late-records.md` — worker records that arrive after their day was closed.
- `docs/decisions/ADR-005-go-live-cutover.md` + `docs/GO_LIVE_CUTOVER.md` — the owner's one-time move from test records to real ones.
- `docs/decisions/ADR-006-temporary-owner-sign-in.md` — the owner's sign-in on a computer that is not one of their devices.
- `docs/STATUS.md` — what is done, what is open, and which decisions belong to the owner.

## Ground rules from the owner

- Never change an agreed business rule silently. If something seems wrong or impossible, explain the options and ask.
- No paid service, plan upgrade or new account without the owner's explicit approval. The budget ceiling is $20/month; the current cost is $0.
- Never invent prices, exchange rates, banknote values, translations or people. Sample data lives only in `src/shared/demo-data.ts` and is labelled as demo.
- The interface must feel deliberate and mature, not like a template. Keep the design system in `src/client/styles/app.css` (ledger paper, indigo, saffron, lagoon; Fraunces / Hanken Grotesk / JetBrains Mono; the dashed "stitch" motif). Do not introduce a component library or random gradients.
- Keep the worker interface simple: big touch targets, plain words, no accounting screens.

## How the code works

- Every change to business data is an **operation** (`src/shared/ops.ts`), validated by a zod schema and applied by the pure engine (`src/shared/engine.ts`). The same engine runs on the device (instant validation, offline) and on the server (authority).
- Stock is a double-entry quantity ledger: pieces move between accounts (`A.*` in `src/shared/model.ts`) and are never edited. Corrections are `op.void` operations that reverse effects and keep history.
- Money is integer minor units in its own currency (`src/shared/money.ts`). KMF ÷ 5 "local count" is display-only.
- What is owed per purchase and per vendor, and vendor credit, comes only from `vendorAccounts()` / `purchaseBalances()` / `previewAccount()` in `src/shared/queries.ts`. Never store or compute a balance anywhere else (a `payment.allocate` split is a recorded choice, not a balance).
- A worker record refused only because its day is closed is held as a late record for a manager (`HOLDABLE`, `op.resolve`, ADR-004); never turn that back into a silent refusal.
- Go-live (ADR-005): sync requests carry the `ledger` id and the server refuses any other (`src/worker/golive.ts`); an app on a new ledger keeps its unsent records aside (`preGoLive`) — never upload them, never drop them silently. The cutover is owner-only, one-time (`meta.phase = 'live'`) and must never get a way to run again. New set-up record types must be added to `KEEP_TYPES` in `src/shared/golive.ts`.
- New record types need the sync protocol bump (`SYNC_PROTO` in `src/shared/api.ts`, `PROTO2_TYPES` in `src/worker/sync.ts`) so older cached apps never receive a type they cannot replay.
- Reports convert currencies only through `Converter` (`src/shared/fx.ts`): recorded rate in force on each amount's date, keeping original amounts and the rates used. Market rates are reference only and must be labelled as current value. Never subtract across currencies without a rate.
- Screens and downloads share the selection functions in `src/shared/reports.ts`, so downloaded totals equal on-screen totals.
- The server (`src/worker/`) must stay within Cloudflare free-plan limits: ≤ 50 queries and ~10 ms CPU per request. Pre-fetch with `json_each` IN-lists and write in one `DB.batch`.
- Permissions: `src/shared/permissions.ts`. Every server endpoint re-checks capabilities; the download filter in `src/worker/sync.ts` (`pull`) must stay in step with `src/shared/visibility.ts`.
- On replay (`actor === null`), the engine must not require records the user may not see (workers never receive vendors).

- Interface text goes through `useT()` with keys in `src/shared/i18n/en.ts`, `fr.ts` and `sw.ts` (all three; see ADR-003). Never translate stored data (garment, vendor or place names, notes), and never store translated text in a record.
- The live app and its database: see `docs/HANDOVER_NEXT_SESSION.md` and `docs/DEPLOY.md`. Do not deploy, migrate or touch production data without the owner's go-ahead.
- Sign-in, devices and owner recovery are explained in `docs/AUTH_AND_RECOVERY.md`. The device identity lives only in `mabubu-device` IndexedDB; clearing site data loses it and the device becomes unrecognised — this is expected, and owner recovery via `SETUP_TOKEN` is the way back. Owner recovery must never create a second owner or re-seed starter data, and the device-approval model (ADR-001 §6) must not be weakened by a guessable device "fingerprint". Never weaken authentication to fix a login symptom, and never hide a login problem behind a reset. Device identities are retired by blocking (history kept), never hard-deleted. Never put PINs, session tokens, device secrets or the setup key in code, logs or docs.
- Temporary owner sign-in (ADR-006, `POST /api/auth/temporary`, `sessions.temporary`): owner only, same code check and lockout as sign-in, never writes a device approval, never carries owner-only capabilities (`OWNER_ONLY`), keeps records in memory only (`MemoryRecordsDb`, no saved profile), limits in `TEMP_SIGNIN`. Never extend it, widen it to other roles, or let it approve devices without the owner's decision.
- The app's name and logo: `src/shared/brand.ts` (`APP_NAME`, `LOGO`). The owner's logo is kept as supplied in `assets/brand/`; derived files come only from `scripts/make-brand-icons.py` (resize/pad with the logo's blue, never redraw or crop). Reports print the letterhead from `ReportDoc.app`/`contacts`; the business contact numbers live in `settings.set` (`phoneKenya`, `phoneComoros`, `email`) — never hard-code or invent them.
- Go-live access clean-up (ADR-005 amendment): people/devices outside the kept set get `removed_at` (hidden, blocked, rows never deleted). Anything listing people or devices for People & devices must exclude `removed_at`; removed rows can't be changed there.
- Before and after every production deploy or migration: `node scripts/data-snapshot.mjs take production …` and `compare` (docs/DEPLOY.md). Never treat an HTTP 200 as proof the data is unchanged.
- Archived people get no new sales day (rule in `workerDay`, not only the screens); `pull` returns `deviceUsers` so apps take people who may no longer sign in off a device's list (never deleting records that were not sent).

## Before saying a change is done

```bash
npm run typecheck && npm test && npm run build
```

Add a test for any new business rule (`tests/engine.test.ts`) or server behaviour (`tests/worker.test.ts`). Report honestly what was and was not tested.
