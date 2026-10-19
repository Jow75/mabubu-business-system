# Quality assurance & release readiness

Living document. Last updated **19 Oct 2026**. Read `CLAUDE.md`, then
`docs/STATUS.md` and `docs/HANDOVER_NEXT_SESSION.md`, then this file.

This is the single place that records the project's release phase, what has
actually been verified, the canonical data that must be preserved, and the
criteria for a stable 1.0.0. It is written so a future agent (or the owner) can
continue the work without the chat transcript.

---

## 1. Current version and release phase

- **Version:** `0.1.0` (`package.json`). This is correct for the phase — the
  app is **live but under active testing**, not a declared stable release.
- **Phase:** **Testing / pre-release.** The app is deployed at
  `https://mabubu.mabubu-family.workers.dev` and holds real business data, but
  the owner has **not** declared it stable.
- **Versioning policy (semver):**
  - Stay on `0.x` while testing. `0.MINOR.PATCH` may move during this phase.
  - The first stable release is **`1.0.0`**, set **only on the owner's explicit
    approval** after reviewing this document. Do not jump to `1.1.0` as a first
    stable version.
  - After `1.0.0`: new backward-compatible features bump the minor (`1.1.0`),
    fixes bump the patch (`1.0.1`). A release candidate, if used, is
    `1.0.0-rc.1`.
  - Never change the public version metadata silently.

## 2. Canonical business configuration that must be preserved

Verified against the live database on 19 Oct 2026 (do not hard-code these IDs in
code or delete rows by display name):

- **People:** 2 — George Muraguri (owner), Jijo (worker). **No second owner.**
- **Devices:** 4 rows kept for history — owner laptop `WR8-WYS` (active),
  Jijo's Android `YB7-EN2` (active), and two retired laptops `WNY-S7J`,
  `ZZU-23X` (blocked + retired).
- **Reference data:** 3 places, 5 size groups, 5 garments, 3 vendors (clean —
  the earlier duplicate-seeding bug is fixed and the duplicates were removed).
- **Secrets:** `PIN_PEPPER`, `SETUP_TOKEN` live only in Cloudflare. Never in
  code, logs, docs or backups committed to Git.

Preserve these through all testing. Use the app's own void/correction/retire
mechanisms rather than deleting ledger rows; keep the append-only history.

## 3. Device lifecycle (retired vs blocked)

Three states (migration `0003_device_retired.sql`):

- **Active** — `revoked_at` and `retired_at` both null.
- **Temporarily blocked** — `revoked_at` set; can be unblocked. Stays in the
  main device list.
- **Retired** — `retired_at` set (and `revoked_at` set, so auth already denies
  it). Shown in a collapsed "Retired devices" section with a confirmed
  **Reactivate** action, never a plain Unblock. The row is never hard-deleted,
  so historical operations that reference it stay intelligible.

Retiring and reactivating require `users.manage`, cannot target the device you
are signed in on, and write `device_retired` / `device_reactivated` audit
events.

## 4. Safe testing and test-data cleanup

Order of preference (from the owner's policy):

1. **Automated test fixtures** (`tests/`) — first choice.
2. **Explore Demo** — repeated manual experiments; cannot touch real data (see
   §5).
3. **A staging Worker + staging D1** — for repeatable destructive integration
   tests. Not yet created; must stay within the Cloudflare free tier and use
   synthetic data (do not copy real production data into staging).
4. **Controlled production checks** — only for behaviour that needs the real
   deployment. Requires a fresh backup first (§6) and a written plan for what
   will change and how it will be reconciled. Prefer clearly-labelled test
   records and the app's void/correction mechanisms over deleting rows. Never
   delete audit events or original financial operations to hide a test.

## 5. Demo-mode isolation (verified)

- Demo data lives in a **separate IndexedDB database** (`mabubu-demo`) from real
  accounts (`mabubu-u-*`).
- `demoSync()` is **local only** — demo never calls `/sync/push` or
  `/sync/pull`.
- `resetDemo()` deletes **only** the demo database; `removeProfile` skips both
  server logout and real-DB deletion for demo profiles. Seeding is idempotent.
- Regression test: `tests/demo-isolation.test.ts`.
- **Release gate (not now):** the Explore Demo entry *may* be removed from the
  public production experience as part of the eventual release, keeping an
  internal/staging test route. Do not remove it until the owner authorises it.

## 6. Backup and recovery

- **Before any risky production change:** export first —
  `npx wrangler d1 export mabubu --remote --output mabubu-backup-YYYY-MM-DD.sql`
  Keep it **off the laptop** (USB + Drive). Never commit it (`.gitignore` blocks
  `mabubu-backup-*` and `*.sql`, with an exception only for `migrations/*.sql`).
- Latest backup: `mabubu-backup-2026-10-19-pre-retired-migration.sql`
  (2 users / 4 devices / 30 ops / 21 entities). **Owner: copy it off-machine.**
- **Time Travel** keeps 7 days of restore points on the free plan. A restore
  overwrites the whole DB — disaster recovery only, export first.
- A Worker-code rollback and a database rollback are different operations; one
  does not undo the other.

## 7. Automated checks and coverage

Run before claiming any change done: `npm run typecheck && npm test && npm run build`.

- **Status (19 Oct 2026):** typecheck clean · **156 tests pass** · build clean,
  offline check green.
- Coverage highlights: engine acceptance tests AT-1..AT-16; vendor balances and
  oldest-unpaid-first allocation; currency (original amounts kept, recorded-rate
  conversion, missing-rate → report marked incomplete, market-rate cache);
  reports (filters select exactly the matching rows; **export totals equal
  on-screen totals** for profit and expenses; role-based download limits); money
  property tests (identity, round-trips, rounding bound, overflow) and
  randomised vendor-balance reconciliation; sync idempotency (AT-10,
  duplicate-payment); i18n completeness (en/fr/sw) and no effect on
  balances/stock/profit; device lifecycle (retire/reactivate/escalation
  boundary); demo isolation.

## 8. Security findings (this pass — see commit `9699c53`)

| Sev | Finding | Status |
|---|---|---|
| Critical / High | none found | — |
| Low | Owner-role escalation boundary was transitive (relied on `users.manage` being owner-only). Not live-exploitable. | **Fixed** + regression test |
| Low | Login distinguishes "valid name, wrong PIN" from "unknown name" (name-existence oracle). | Accepted — names aren't secret; `attemptsLeft` is a deliberate UX aid |
| Info | Dev-only `wrangler`/`miniflare` advisories (3 high). **Production deps: 0 vulnerabilities.** | Deferred — needs a scoped, tested wrangler bump |
| Info | No HSTS header (workers.dev is HSTS-preloaded by Cloudflare); unbounded `auth_events` growth (fine at family scale). | No action |

Verified good: strong CSP (no `script-src 'unsafe-inline'`), `frame-ancestors
'none'`; IP rate-limiting on login and setup/recovery; staged lockout;
constant-time compares; PINs stored HMAC-SHA256(pepper, userId, pin), never
returned; worker data isolation (no IDOR; one worker can't pull another's
records); engine enforces actor identity and per-op capability server-side;
parameterised SQL; no XSS sinks.

## 9. Performance findings

- Main JS bundle ~**901 kB** (gzip ~270 kB); PDF/Excel libraries are already
  split into lazy chunks. Warned by the build but **not yet measured on a real
  device**. Treat as a measurement, not a confirmed user-facing problem. Any
  code-splitting must preserve offline reliability (the service worker precaches
  the start-up files; the build fails if a start-up file is not cached).
- Server keeps within the Cloudflare free budget (≤ 50 queries / ~10 ms CPU per
  request) via `json_each` IN-list pre-fetch and one `DB.batch` write.

## 10. Browser / device verification

| What | State |
|---|---|
| Headless Chrome, 390 px + 1280 px, en/fr/sw, demo + real paths | Done in earlier sessions |
| Offline start (service worker) | Done (stopping the server + browser offline) |
| Live production smoke test (`/`, `/api/setup/status`, unauth `/api/admin/people`) | Done 19 Oct 2026 |
| **Physical Android phone** (install, French, offline day, sync, restart) | **Not done** |
| Live end-to-end on the owner's real devices | **Not done** |

## 11. Known limitations (honest list)

- Translations (incl. the new retired-device strings) are **not native-speaker
  reviewed**.
- Downloads (PDF/Excel/CSV) are **English only**.
- Two payment features from ADR-002 are **not built**: hold a payment as credit
  while purchases are unpaid; move an existing payment to another purchase.
- Device time can be changed by the phone holder (log flags clock skew and keeps
  server time); unsynced records are lost if a phone is destroyed before it
  reaches the internet (the app shows the waiting count); data on the phone is
  not encrypted at rest (block a lost phone in People & devices).
- Market reference rates are a published daily reference, not the rate a bureau
  or M-Pesa actually gives.

## 12. Criteria for declaring version 1.0.0 stable

1.0.0 is the owner's decision. The evidence below should be in place first; it
is a recommendation, not permission.

- [ ] No unresolved Critical/High security, financial, authentication or
      data-integrity finding.
- [ ] `npm run typecheck && npm test && npm run build` green, with a regression
      test for every behaviour changed in this pass. *(currently green, 156 tests)*
- [ ] Owner, manager and worker end-to-end workflows verified (demo done; **real
      devices pending**).
- [ ] A **physical Android** test passed (install, French, offline day, sync,
      restart).
- [ ] French and Swahili screens read by a native speaker from the family, with
      wording changes recorded in `src/shared/i18n/*`.
- [ ] Backup + recovery rehearsed, and a rollback plan written for both Worker
      code and the D1 database.
- [ ] Known limitations (§11) reviewed by the owner and either accepted for
      1.0.0 or scheduled.
- [ ] Owner explicitly approves the version bump to `1.0.0`.

Do not mark the project release-ready while any Critical/High finding is open.
