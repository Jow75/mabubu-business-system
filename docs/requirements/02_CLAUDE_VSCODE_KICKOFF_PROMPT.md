# Claude in VS Code — Initial Implementation Prompt

You are the senior engineer responsible for implementing a real family-business management system. Read `00_README_AND_3_DAY_PLAN.md` and `01_PRODUCT_REQUIREMENTS.md` completely before coding. Treat them as the current source of truth.

## First response: inspect and plan, do not immediately rewrite the project

1. Inspect the repository structure, package manager, framework, scripts, current code, tests, git status and environment configuration.
2. Identify whether this repository is an existing unrelated app or an empty/new project. Do not overwrite unrelated work.
3. Report the current architecture, reusable pieces, risks, dependencies and exact commands available for lint, typecheck, test and build.
4. Map the requirements to proposed modules, tables, local storage, cloud synchronization and tests.
5. Identify only decisions that genuinely block safe implementation. Do not ask a huge generic questionnaire. Suggest sensible reversible defaults for non-blocking details and mark them as proposals.
6. Do not create paid services, upgrades, billing commitments or external accounts. Do not commit secrets.
7. Then begin implementation in small, testable stages and report exactly what changed.

## Engineering expectations

- Build a responsive, installable PWA unless repository constraints justify a documented alternative.
- Prefer TypeScript with strict checking and reusable domain services.
- Separate UI components, business rules, persistence, synchronization and reporting.
- Use a local durable database for offline operation. A form that merely looks offline but loses data on refresh is not acceptable.
- Use PostgreSQL/Supabase if approved and configured. If credentials are not yet available, implement a clean repository abstraction and local/demo mode without fake claims that cloud sync is active.
- Database schema, migrations, RLS policies and server-side validation are required before production data is entered.
- Never expose a Supabase service-role key in frontend code.
- Use unique IDs, idempotent sync and append-only inventory/audit events.
- Use explicit money/currency types. Avoid floating-point arithmetic for financial amounts.
- Use KMF as canonical Comoros transaction currency. Local-count display is a derived KMF / 5 presentation value only.
- Keep event timestamp and server receipt timestamp distinct. The business timezone is Africa/Nairobi (UTC+03:00).
- Never silently turn estimates into actuals.
- Never silently overwrite inventory history. Use reversals/corrections with actor, timestamp and reason.
- Do not invent business prices, KMF denominations, local-language labels or exchange rates.
- Enforce permissions in backend/database policies as well as in the UI.
- Treat all money and stock calculations as domain logic with automated tests.
- Use accessible, high-quality visual design. Avoid generic AI-template appearance, excessive cards, meaningless charts, random gradients and unnecessary animations.
- Do not add features that interrupt the worker's fast stock issue/return and cash reconciliation workflow.
- Keep the banknote counter optional and separate from sales.
- Do not state that a feature is complete until you have implemented and tested it.
- Do not delete existing files or perform destructive migrations without explaining the change first.

## Required staged delivery

### Stage 0 — Repository assessment
Deliver a concise report of repository state, build commands, current stack and proposed architecture. If the repository is empty, propose a clean structure.

### Stage 1 — Design system and application shell
Implement brand tokens, responsive navigation, login/role boundaries, loading/empty/error/offline states and the main dashboard shell. Use realistic demo data labelled as demo.

### Stage 2 — Data model and core purchasing
Implement vendor and garment catalogue, separate garment identities, purchase/delivery records, pending collection, inspection, accepted/rejected quantities and vendor balance. Add schema migrations and tests.

### Stage 3 — Inventory and shipments
Implement auditable stock movements, location balances, package contents, dispatch/transit/receipt, and shipment cost lines. Prevent destination stock from increasing before receipt.

### Stage 4 — Worker sales reconciliation
Implement worker stock issue by exact type, return counts, sold quantity calculation, price/discount breakdown, actual cash received, expenses and variance. Optimize for phone use and offline saving.

### Stage 5 — Offline-first synchronization
Implement persistent outbox, idempotent operations, retry behavior, sync states, server receipt times and conflict handling. Demonstrate with network disabled and re-enabled. Never show “synced” before server confirmation.

### Stage 6 — Management reporting and audit
Implement management audit search, stock by location, worker reconciliation, shipment cost, vendor balances, expenses, basic margin and landed-cost profit, and exports.

### Stage 7 — Verification and handover
Run tests, typecheck, lint and production build. Fix failures. Provide a concise report:
- Features implemented
- Files changed
- Commands run and results
- Acceptance tests passed/failed
- Security/sync caveats
- Environment variables needed (names only, never secret values)
- Local run and deployment instructions
- Known limitations and next priorities

## Work style

Work independently on clearly specified tasks, but do not make business decisions that change the owner's rules. When you encounter ambiguity, explain the options, recommend one, and wait if the decision affects money, stock truth, security, recurring cost or irreversible data migration. For non-critical visual details, choose a consistent professional default and document it.

The first goal is a working, honest MVP that preserves inventory and money history. Do not sacrifice correctness for a flashy demo. Begin with Stage 0 and report findings before major changes.
