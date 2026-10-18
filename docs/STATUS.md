# Build status — 19 Oct 2026 (live on Cloudflare)

Live address: **https://mabubu.mabubu-family.workers.dev** — deployed and checked. The owner account exists (George Muraguri) with one worker (Jijo). On 19 Oct an onboarding bug that duplicated places and size groups was fixed and deployed, and the duplicate records were cleaned from the live database after a backup — see [HANDOVER_NEXT_SESSION.md](HANDOVER_NEXT_SESSION.md) (19 Oct section). The owner's and worker's own devices need a one-time sign-out / sign-in to re-sync the cleaned data.

## Working and tested

| Area | What works | How it was checked |
|---|---|---|
| Business engine | Purchases (paid & collected / collect later / delivered for inspection), partial inspections, rejects and returns, vendor payments and balances, shipments with partial receipt and missing pieces, shipment costs in their own currency with estimate → actual, stock adjustments, worker take / return / close day with wholesale, kept-for-tomorrow and lost pieces, cash variance, manager review, cancellations that reverse effects but keep history | 35 unit tests incl. the requirement acceptance tests AT-1…AT-9, AT-14…AT-16 |
| Fixes from the owner's test (18 Oct) | (A) Vendor-page payments now clear the purchase: one derived source for purchase and vendor balances, oldest unpaid purchase first, M-Pesa code shown on the purchase. (B/C/E) The remembered place filter no longer hides sales and expenses silently: every affected page shows it and how many records it hides. (D) Saving updates every view at once — proven by a test on the real app store. Reports show original amounts ("as paid: KSh …") and every rate used; a missing rate marks the report Incomplete | 8 balance tests, 3 app-store tests, browser run of the exact scenario (15/15 checks) |
| Currency | Live market reference rates (ExchangeRate-API open access, free, no account) cached by the server, with age and stale warning; currency converter (KES, KMF, TZS, USD, EUR); recorded rates now say if they were actually received; reports convert with the recorded rate on each transaction's date, or optionally at today's market value (labelled) | 13 currency tests, 5 server cache tests; live provider checked 18 Oct 2026 |
| Downloads | PDF, Excel (.xlsx) and CSV for: profit, sales days, sales by garment, take/return records, purchases, vendors & payments, garments & prices, stock now, stock movements, shipments & costs, expenses, activity log, people & devices. Filters (dates incl. custom, worker, status, vendor, payment, place, shipment status) are written into each file; downloads are noted in the log | 13 report/format tests; files opened with independent readers (pypdf, openpyxl) |
| Server | Name + PIN sign-in, owner approval of each new device per person, lockout (5/10/15 → timed, 20 → owner unlock), per-network attempt limit, PIN stored as HMAC with a server secret, sessions revocable, owner setup and recovery with a setup key, people & device admin, sign-in log, backup export | 17 integration tests against a real SQLite database + smoke test on Cloudflare's own local runtime |
| Sync | Records saved on the device first; idempotent upload (retries never duplicate); download filtered by role (workers never receive costs, vendors, purchases or other workers); device time, server time and clock skew kept; late-sync / clock / back-dated warnings; concurrent-change guard | AT-10, AT-12, AT-13 tests; server balances proven equal to a replay of downloaded records; every role's view of the demo replays cleanly |
| App | Owner/manager screens: overview, stock with journey per garment, purchases, vendors, shipments, sales days with review, expenses, profit report with downloads, currency converter, activity log, garments & prices, people & devices, settings with exchange rates and backup. Worker phone screens: today, take, return, close day, history, banknote counter, sync status. KMF ⇄ local-count switch. Light and dark themes. Installable on Android | Type-checked; built; driven in headless Chrome on a 390 px phone and a laptop (demo and real setup paths) |
| Demo mode | Three weeks of clearly-labelled sample records, viewable as owner, manager or worker; never leaves the browser | Unit test + browser run |
| Languages | English, Français, Kiswahili for every screen, sign-in, setup, errors and record descriptions. First use asks once with the device language preselected; choice kept per device and changeable under Settings or Me. Time-of-day greetings (10 per language). See ADR-003 | 25 i18n tests (detection, completeness, fallback, greetings, error wording, no effect on balances/stock/profit), 4 preference tests (persistence, no records created); browser: French worker journey at 390 px (27 checks) locally and on the live site; owner screens in French, Swahili and English at 1280 px and 390 px with no overflow or errors |
| Worker day | Closed day: Take and Return disabled with a plain explanation; a direct attempt is refused by the rules; a manager reopens from Sales days → day → Reopen day (closing and reason kept); a new business date starts a fresh day with the first take | Engine test of the full scenario; browser run in French |
| Offline start | The installed app opens and records without internet | Fixed 18 Oct (a start-up file was not cached). Checked by stopping the server and by browser offline mode on the live site; the build now fails if a start-up file is not cached |

## Not done yet (in priority order)

1. **Owner first sign-in** on the live address with the setup key, then add people and approve their phones ([DEPLOY.md](DEPLOY.md)).
2. **Try it on a real Android phone** (not done yet): install, choose French, go offline, record a day, come back online and check it syncs.
3. **A French speaker and a Swahili speaker from the family read the screens** and list any wording to change (the translations have not been reviewed by a native speaker).
4. Downloads (PDF / Excel / CSV) are still in English.
5. Two payment features from the owner's decisions: hold a payment as credit while purchases are unpaid; move an existing payment to another purchase (ADR-002).
6. A short "how to" card for workers in French (Shikomori wording to be confirmed by the family).
7. Next phase: spread shipment costs per piece (landed cost per garment), photos of garments, printable day sheet, Play Store packaging, cash handovers / money sent home between places.

## Decisions waiting for the owner

On 18 Oct 2026 the owner provisionally confirmed the current defaults below. See ADR-002, "Owner decisions recorded", for the two payment features still to build (holding a payment as credit, moving an allocation). KMF banknote values and the ÷5 wording are still unconfirmed.


| Question | Current default | Change needs |
|---|---|---|
| Owner and manager codes are 6 digits (workers 4) | 6 digits, recommended for accounts that see money | One line in `src/shared/permissions.ts` |
| KMF banknote values in the counter | 10,000 / 5,000 / 2,000 / 1,000 / 500 | Editable in Settings; please confirm |
| Word shown for the ÷5 local count | "local count" | Editable in Settings |
| Can a worker take more garments after closing the day? | No. A manager reopens the day | Small change |
| Should workers see how many garments are in the store? | No, they see only what they hold | Small change |
| Profit: shipment costs charged in the period they are paid, not per piece | Yes, and the report says so | Next-phase feature |
| Payments not tied to a purchase pay the oldest unpaid purchase first | Yes (see ADR-002) | Small change: keep them as credit instead |
| The place switch is remembered on the device | Yes, now visible on every page it affects | Small change: reset on sign-in |

## Known limitations (honest list)

- A device time can be changed by the person holding the phone. The log treats it as evidence, flags clock skew, and also stores the server's own time.
- Data saved on a phone is not encrypted at rest. If a phone is lost, block it in People & devices.
- Records not yet synced are lost if a phone is destroyed before it reaches internet. The app shows the waiting count prominently.
- Two managers editing the same garment's name at the same time while offline: the later upload wins. Both versions stay in the activity log.
- Reports in another currency use rates recorded by the family (or a market rate someone chose to save). The app never invents a rate; a missing one marks the report Incomplete.
- Market rates are a published daily reference, not the rate a bureau or M-Pesa actually gives. Record the actual rate when money is changed.
- Downloads made offline or in demo mode are not written to the server log.
- Word (.docx) downloads are not offered yet.
