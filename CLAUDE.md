# Instructions for AI coding agents working on this repository

Read first:
- `docs/requirements/` — the owner's agreed business requirements, the source of truth.
- `docs/decisions/ADR-001-architecture-and-access.md` — the architecture and why.
- `docs/decisions/ADR-002-currency-balances-and-reports.md` — exchange rates, vendor balances, downloads.
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
- What is owed per purchase and per vendor comes only from `vendorAccounts()` / `purchaseBalances()` in `src/shared/queries.ts`. Never store or compute a balance anywhere else.
- Reports convert currencies only through `Converter` (`src/shared/fx.ts`): recorded rate in force on each amount's date, keeping original amounts and the rates used. Market rates are reference only and must be labelled as current value. Never subtract across currencies without a rate.
- Screens and downloads share the selection functions in `src/shared/reports.ts`, so downloaded totals equal on-screen totals.
- The server (`src/worker/`) must stay within Cloudflare free-plan limits: ≤ 50 queries and ~10 ms CPU per request. Pre-fetch with `json_each` IN-lists and write in one `DB.batch`.
- Permissions: `src/shared/permissions.ts`. Every server endpoint re-checks capabilities; the download filter in `src/worker/sync.ts` (`pull`) must stay in step with `src/shared/visibility.ts`.
- On replay (`actor === null`), the engine must not require records the user may not see (workers never receive vendors).

- Interface text goes through `useT()` with keys in `src/shared/i18n/en.ts`, `fr.ts` and `sw.ts` (all three; see ADR-003). Never translate stored data (garment, vendor or place names, notes), and never store translated text in a record.
- The live app and its database: see `docs/HANDOVER_NEXT_SESSION.md` and `docs/DEPLOY.md`. Do not deploy, migrate or touch production data without the owner's go-ahead.
- Sign-in, devices and owner recovery are explained in `docs/AUTH_AND_RECOVERY.md`. The device identity lives only in `mabubu-device` IndexedDB; clearing site data loses it and the device becomes unrecognised — this is expected, and owner recovery via `SETUP_TOKEN` is the way back. Owner recovery must never create a second owner or re-seed starter data, and the device-approval model (ADR-001 §6) must not be weakened by a guessable device "fingerprint". Never weaken authentication to fix a login symptom, and never hide a login problem behind a reset. Device identities are retired by blocking (history kept), never hard-deleted. Never put PINs, session tokens, device secrets or the setup key in code, logs or docs.

## Before saying a change is done

```bash
npm run typecheck && npm test && npm run build
```

Add a test for any new business rule (`tests/engine.test.ts`) or server behaviour (`tests/worker.test.ts`). Report honestly what was and was not tested.
