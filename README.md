# Mabubu business system

Records for the family Mabubu (dera) business: purchases in Mombasa, inspection of vendor deliveries, shipments via Dar es Salaam to the Comoros, each worker's sales day with cash reconciliation, expenses, profit and a complete activity log. It works offline on laptops and Android phones and syncs when there is internet.

- **Why it is built this way:** [docs/decisions/ADR-001-architecture-and-access.md](docs/decisions/ADR-001-architecture-and-access.md)
- **The agreed business requirements:** [docs/requirements/](docs/requirements/)
- **Going live on the internet (free):** [docs/DEPLOY.md](docs/DEPLOY.md)
- **What is done, tested and still open:** [docs/STATUS.md](docs/STATUS.md)

## Try it on this computer

Needs Node.js 22.5 or newer.

```bash
npm install
cp .dev.vars.example .dev.vars        # then put two long random values in it (see the file)
npm run db:migrate:local              # creates the local database
npm run build                         # builds the app once
npm run dev                           # API on :8787, app on http://localhost:5173
```

On the sign-in screen, choose **Explore the demo** to see three weeks of sample records as the owner, a manager or a worker. Demo records stay in that browser only.

For a real first start, choose **First setup or owner recovery** and enter the `SETUP_TOKEN` from `.dev.vars`.

## Checks

```bash
npm run typecheck    # TypeScript (app, server, tests)
npm test             # 310 automated tests: business rules, sync, sign-in, permissions
npm run build        # production build
node scripts/smoke.mjs   # end-to-end check against a running local server (fresh database)
```

## Layout

| Folder | What lives there |
|---|---|
| `src/shared/` | The business engine and rules. One copy, used by both the phone and the server. |
| `src/worker/` | The server: sign-in, device approval, sync, owner tools (Cloudflare Worker). |
| `src/client/` | The app people use (React, works offline). |
| `migrations/` | Database tables (Cloudflare D1 / SQLite). |
| `tests/` | Automated tests. |
| `docs/` | Requirements, decisions, deploy guide, status. |
