# Mabubu Business Management System
## Starter implementation pack

**Purpose:** Build a reliable, laptop-first business management app for a family-run Mabubu/Madeira garment business operating across Mombasa, Dar es Salaam, and the Comoros.

This pack is the first implementation foundation, not a claim that every possible requirement has already been specified. It preserves the currently confirmed rules and instructs the coding agent to identify unresolved decisions rather than silently inventing them.

## Recommended first release

- Responsive installable web app (PWA), designed laptop-first and usable on Android phones/tablets.
- React + TypeScript + Vite.
- Local persistence with IndexedDB (for example, Dexie).
- Supabase PostgreSQL/Auth for shared cloud records, with explicit Row Level Security.
- A deliberate sync queue/outbox and idempotent sync operations.
- No paid service or billing upgrade without the owner's explicit approval.
- No payment processing integration in v1. Record cash and M-Pesa payments manually.
- No live GPS tracking, worker surveillance, or hidden collection of data unrelated to business operations.

## Three-day build plan

### Day 1 — Foundation and core records
1. Inspect the existing repository before changing anything. Do not overwrite unrelated projects.
2. Confirm framework, scripts, current tests, environment and deployment setup.
3. Create the design tokens, app shell, navigation, responsive layouts, login/role boundaries, local database schema, cloud schema/migrations and audit event model.
4. Implement garment catalogue, vendors, purchase/collection records and inspection acceptance/rejection.
5. Add seed/demo data clearly marked as demo.
6. Run tests and report blockers.

### Day 2 — Stock movement and sales reconciliation
1. Implement package/shipment records and location-to-location movements.
2. Implement stock issuance to a worker by exact garment type.
3. Implement end-of-day returns, quantity-sold calculation, actual cash received, expenses, approved discounts and variance reporting.
4. Implement KMF canonical values and the optional local-count display (KMF divided by five).
5. Implement offline save queue and sync-status indicators.
6. Test duplicate retries, refresh/restart persistence and reconciliation arithmetic.

### Day 3 — Management, verification and demo
1. Implement management overview, stock-by-location, shipment costs, basic vs landed-cost profit views, audit log and export.
2. Verify role permissions, offline behavior, sync conflict handling, mobile layout, keyboard/accessibility basics and error states.
3. Run the full automated test suite and production build.
4. Fix high-priority defects; do not add risky scope at the last minute.
5. Prepare a demo walkthrough, known-limitations list, setup instructions, backup/export instructions and a list of next-phase items.

**Important:** Three days is a target for a usable MVP/demo, not a promise that every feature is production-grade. Do not describe untested or incomplete features as complete.

## Non-negotiable engineering rules

- Do not fabricate business records, costs, prices, FX rates, denominations, shipments or user identities.
- Do not hardcode example prices as universal pricing rules.
- Store official KMF transaction amounts as integer KMF units. Local-count display is derived as KMF / 5 and must never overwrite saved amounts.
- Store original transaction currency and amount. FX conversions require an explicitly recorded rate, rate date/source, and reporting currency.
- Stock movements must be traceable. Do not silently edit historical movement quantities.
- Correct mistakes using a reversal/correction event linked to the original, preserving history.
- Every meaningful mutation must have an audit event.
- Sync operations must be idempotent and safe to retry.
- Never let a client directly write privileged data without server-side validation and database authorization.
- Do not place Supabase service-role secrets in frontend code.
- Do not commit real credentials, personal data or production secrets.
- Do not delete or rewrite existing project files before inspecting them and explaining the proposed changes.
- The owner must approve new recurring costs, paid upgrades, irreversible migrations, and major scope changes.
