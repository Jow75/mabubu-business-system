# ADR-001 — Architecture, sync and access design

Status: **Accepted** (17 Oct 2026). Revisit if the owner rejects a cost or a trade-off below.
Prices were checked on the providers' own pricing and limits pages on 17 Oct 2026.

## 1. Decision

| Layer | Choice |
|---|---|
| Language | **TypeScript everywhere**: one set of business rules runs on the phone, the laptop and the server. |
| App | **Installable web app (PWA)**: React 19 + Vite. One codebase for the laptop, Android phones and tablets, with no app store. |
| Offline storage | **IndexedDB** (through Dexie) on each device. Records are saved on the device before the app says "saved". |
| Server | **Cloudflare Workers** (a small TypeScript API) plus **Cloudflare D1** (SQLite) as the shared database. The app's own files are served from the same place. |
| Sync | An **append-only operation log**. Each record gets a device-generated ID and is uploaded idempotently, so a retry can never create a duplicate. The server gives each record a sequence number, and devices download records by that number. |
| Login | **Name + PIN, plus device approval** (see §6). It is our own code, with no paid auth service. |
| Cost | **$0/month** on free tiers. The only paid step needed later is Workers Paid at **$5/month**, which fits the $20 budget. |

The earlier proposal was React/TypeScript/IndexedDB plus Supabase. **The frontend half stays; the backend changes from Supabase to Cloudflare.** The reasons are below.

## 2. Options compared

| | A. PWA + Supabase (original proposal) | **B. PWA + Cloudflare Workers + D1 (chosen)** | C. Flutter app + Firebase | D. PWA + PowerSync + Postgres |
|---|---|---|---|---|
| Offline on laptop and Android | We build it (IndexedDB + outbox) | We build it (IndexedDB + outbox) | Built into Firestore | Built in (SQLite on device) |
| Sync safety for a stock/money ledger | Good. Postgres has transactions | Good. Append-only log, idempotent IDs, server validation in the same TypeScript as the app | Weak. Document last-write-wins; no transactions while offline | Good, but another vendor and set of sync rules to learn |
| Simple PIN login with lockout | Not native. Supabase Auth wants email or phone; lockout needs custom functions | **Fully ours**: PIN hash with a server secret, lockout, device approval | Needs Cloud Functions, so the **Blaze billing plan (card required)** | Still needs an auth provider |
| Free tier | 500 MB; **project pauses after 1 week idle; backups not included** | 100k API requests/day; D1 holds 500 MB per database; **no pausing; 7-day point-in-time restore** | 1 GiB, 50k reads/day; Functions not on the free plan | 2 GB synced/month; **deactivated after 1 week idle** |
| First paid step | **Pro from $25/month (over budget)** | **Workers Paid $5/month** | Pay-as-you-go (unbounded) | Pro from $49/month |
| Build in 3 days with AI agents | Medium: RLS policies plus auth workarounds | Medium: we write the sync API, which is small and fully tested | Slower: Dart, plus complex rules | Slower: three services to wire |
| One developer maintaining it | Two languages (TS + SQL policies) | One language; the rules are shared | Dart + JS functions | Three systems |

Python, Java, Kotlin, C# and Go were also considered. Each needs an always-on server, and free always-on hosting is scarce or sleeps (for example, spin-down on idle). None of them can run the same business rules inside the offline phone app, so every rule would be written twice. Native Android (Kotlin) would also need a second app for the laptop. None of these fits a three-day build.

### Why B wins for Mabubu specifically

1. **The business data is a ledger.** Stock movements, payments, sales days and corrections are append-only facts. An append-only log with unique IDs syncs safely without merge conflicts. That is the hard part of offline sync, and a log removes most of it.
2. **The same code validates on the phone and on the server.** The rules (for example, "500 delivered → 300 accepted + 200 rejected", "sold = issued − returned", "KMF ÷ 5 is display only") live in one shared TypeScript engine. The worker sees an error instantly, even offline, and the server enforces the same rule.
3. **No pausing, a usable free tier, and restore points.** A family business can go quiet between buying trips. Supabase's free project would pause after a week. D1 does not pause, and it keeps 7 days of point-in-time restore on the free plan.
4. **The PIN login can be designed properly** (§6) instead of being bent around an email/password product.
5. **Costs stay inside the budget.** $0 now and $5/month at most if usage grows. Supabase's next step is $25 and PowerSync's is $49.

### What we give up (honest trade-offs)

- **We write our own sync and auth code** instead of using a hosted product. That code is about 600 lines with automated tests, and it is the most critical code in the system. Tests must cover it, and they do.
- **Permissions are enforced in our API code**, not in database row-level policies. Every endpoint checks the session user's capabilities. Tests cover allowed and denied calls.
- **Free-plan per-request limits: 10 ms CPU and 50 database queries.** The sync API is built for them: uploads are batched (max 25 records), reads are pre-fetched, and writes are combined into a few multi-row statements. If the limits ever bite, the $5 plan raises them sharply.
- **A record's device time is self-reported.** See §5 for how we flag clock problems.

## 3. Costs

| Item | Cost |
|---|---|
| Cloudflare account, Workers Free, D1 Free, static hosting | **$0/month** |
| Web address `mabubu-<name>.workers.dev` | $0 |
| Optional own domain (e.g. `mabubu.co.ke`) | about $10–25/year, optional |
| If daily usage outgrows the free plan: Workers Paid | **$5/month** (includes 10M requests and 25B D1 row reads per month) |

The owner must create the Cloudflare account and run the first deploy. No account or paid plan is created by the coding agent. Expected usage is about 200 records/day, roughly 110 MB/year, so the free 500 MB database lasts years.

## 4. Offline storage and synchronisation

```
Phone / laptop (IndexedDB)                        Cloudflare Worker + D1
┌──────────────────────────────┐   push (≤25)   ┌──────────────────────────────┐
│ operation log                │ ─────────────▶ │ validate with SHARED engine  │
│  • pending (saved on device) │                │ INSERT-or-ignore by op ID    │
│  • synced (server seq #)     │ ◀───────────── │ assign seq + server time     │
│  • rejected (needs attention)│   pull since N │ update balances & documents  │
│ projection = replay of log   │                │ flag anomalies               │
└──────────────────────────────┘                └──────────────────────────────┘
```

- Every action (take garments, record a purchase, receive a shipment…) is one **operation**. It gets a time-ordered UUID created on the device, the device clock time, the time-zone offset, and whether the device was online.
- Saving writes to IndexedDB first. The screen shows **"Saved on this device"**, then **"Synced"** once the server confirms. It never shows "synced" before confirmation.
- Upload is **idempotent**: the server ignores an operation ID it already has and returns the original result. A retry therefore never duplicates a sale, payment or stock movement.
- **Hard errors are rejected and kept** on the device as "needs attention", never silently dropped. Examples: inspecting more than was delivered, receiving a shipment twice, or a worker recording for someone else.
- **Physical facts are accepted even when they look wrong, and flagged.** Example: two offline workers each take 300 when only 500 were recorded as available. The garments really left the store, so the record is kept and management sees a **stock exception** to investigate.
- Devices download new operations by server sequence number and rebuild their view by replaying the same engine. Workers download only reference data and their own records. They never receive purchase costs, profit or other workers' days.
- Corrections are new operations ("void with reason") that reverse the original's effects. History is never edited or deleted.
- Backups: D1 7-day point-in-time restore, plus `wrangler d1 export` to a file, plus an owner "Download backup" button. Every management device also holds a full copy of the log.

## 5. Timestamps and the management activity log

- Each operation stores the **device time** (when the person pressed save), the **server receipt time**, and the device's measured **clock skew** (server time minus device time at upload).
- The log shows "recorded offline at 07:42, reached the server at 18:10". It flags clock skew over 5 minutes and entries backdated more than 24 hours.
- A device clock can be changed, so an offline time is **evidence, not proof**. The app labels it that way.
- Login, failed PINs, lockouts, device approvals and user changes are also logged. Workers never see the management log.
- Business time zone: **Africa/Nairobi (UTC+3)**, which is the same as Comoros time.

## 6. Authentication and roles

**The experience:** a phone already set up shows the faces/names of people who have used it. You tap your name and type your PIN, and the app opens on your role's home screen. On a new phone you type your name once.

**Why a 4-digit PIN alone is not enough:** there are only 10,000 combinations. Anyone who found the web address could script guesses. Slow hashing does not help either, because 10,000 guesses is trivial offline. The protection must come from elsewhere:

1. **Device approval (the main protection).** A new phone or laptop must be approved by the owner once, for that person, from the owner's People screen. A stranger who guessed a PIN still cannot get in. *Changed for the owner only on 25 Oct 2026, at the owner's request (ADR-006):* the owner may sign in **temporarily** on an unapproved computer with name and code — no device is approved by it, it ends within 8 hours, and it carries no owner-only rights. Workers and managers are unchanged.
2. **Lockout.** 5 wrong PINs lock the account for 15 minutes, with longer locks after that. 20 failures lock it until the owner unlocks it. Failed attempts are also rate-limited per network address.
3. **PINs are never stored as plain text.** The server keeps only an HMAC-SHA256 of the PIN, keyed with a server-only secret (`PIN_PEPPER`), so a stolen database alone does not reveal PINs.
4. **Sessions** are random tokens. Only their hash is stored on the server, and the owner can revoke them (lost phone → revoke device). Permissions are re-checked on every request, so disabling a user takes effect immediately.
5. **Offline unlock.** A phone that has signed in before can be unlocked offline with the PIN, checked against a local PBKDF2 hash. After 5 wrong attempts it requires an online sign-in. This protects against casual access, not a determined thief holding the phone. Lost phones must be revoked.
6. **Owner and manager PINs must be 6 digits; worker PINs 4–8 digits.** *Owner decision:* 4 digits for everyone is possible. The recommendation is 6 digits for accounts that can see money and costs.
7. **First setup and recovery** use a one-time `SETUP_TOKEN` server secret. It creates the owner account and approves the owner's device. It is also the recovery route if the owner's only device is lost. No shared admin password exists in the code, and no database credentials ship in the app.

**Roles** come with default capabilities, and the owner can grant or remove individual ones:

| Capability | Owner | Manager | Worker |
|---|:-:|:-:|:-:|
| Own daily stock take/return/close day | ✓ | ✓ | ✓ |
| Catalogue, prices, FX rates | ✓ | ✓ | |
| Purchasing, inspection, vendor payments | ✓ | ✓ | |
| Shipments and their costs | ✓ | ✓ | |
| Stock adjustments, corrections (void) | ✓ | ✓ | |
| Expenses | ✓ | ✓ | |
| Reconcile/review other workers | ✓ | ✓ | |
| View costs, vendor balances, profit | ✓ | ✓ | |
| Activity (audit) log | ✓ | ✓ | |
| Users, devices, settings | ✓ | | |

The server checks permissions on every write (by operation type) and every read (the download filter). The worker interface hides management screens, but security does not rely on hiding.

## 7. Limitations and risks

- **Three days buys a solid MVP, not a finished product.** Priority order: correctness of stock and money, then offline sync, then management screens, then polish.
- **Data on a device is not encrypted at rest** (browser storage). Revoke lost devices promptly.
- **Unsynced records on a lost or broken phone are lost.** The app shows unsynced counts prominently so people sync daily.
- **Android can clear browser storage under pressure** unless the app is installed. The app requests persistent storage and shows a warning if the browser refuses.
- **Profit across currencies needs exchange rates that the owner enters.** The app never invents rates. Reports show "rate needed" instead of guessing.
- **Shared shipment costs** start with a simple, labelled method: shipment and expense costs are charged in the period they occur, while garment cost uses weighted average purchase cost. Per-piece allocation of transport cost is a next-phase option.
- **Concurrent offline edits to catalogue items** (two managers renaming the same garment) resolve as "last upload wins". Every version stays in the log.

## 8. What the 3-day build delivers

| Day | Deliverable |
|---|---|
| 1 (17 Oct) | Project, shared engine + tests (purchases, inspection, stock ledger, shipments, worker days, money), server API with auth/sync/permissions + tests, database schema |
| 2 (18 Oct) | Worker phone flow (take / return / close day with variance, local-count display, offline save + sync status); management screens (overview, stock, purchases, vendors, shipments, worker days) |
| 3 (19 Oct) | Activity log, people & devices, catalogue/prices, expenses, profit report and CSV export, cash counter, verification on phone and laptop, deploy guide |

Deferred unless time allows: photos of garments, printed receipts, Play Store packaging, per-piece landed cost allocation, multi-currency cash boxes/remittances.
