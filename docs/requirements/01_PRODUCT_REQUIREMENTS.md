# Product Requirements — Mabubu Business Management System

## 1. Product objective

Create a family business management system that tracks garments and money from vendor purchase or delivery through inspection, storage, shipment, receipt, worker issuance, sale, return, cash reconciliation and profit reporting. Family members in Kenya must be able to review records created in the Comoros. Workers need a simple, practical mobile interface.

The system should improve traceability and reveal discrepancies. It cannot independently prove that an event outside the app happened as reported; it must distinguish recorded statements from verified facts.

## 2. Locations and movement

Initial named locations:
- Mombasa: purchasing/collection and home storage/warehouse. Home storage does not need a separate location in v1.
- Dar es Salaam: transit/temporary storage; a real example is a 23 kg package left there.
- Comoros: stock and sales location.

Shipment methods may include bus, air or sea. A package must not be marked received at its destination until receipt is explicitly confirmed. Track sender, receiver, origin, destination, carrier/method, dispatch time, expected arrival (optional), actual receipt time, package identifier, contents, weight, status, fees and notes.

Package weights are not a substitute for piece counts. A 23 kg sack may contain varying quantities. Record actual garment counts by exact garment type. Estimated counts may be stored but must be clearly labelled estimates.

## 3. Vendors and purchasing

Purchases are commonly arranged by phone. A formal purchase-order workflow is not required for v1.

Support:
- Vendor, contact details (optional), purchase/delivery date, exact garment type, quantity, unit cost, currency, total, amount paid, payment method (cash/M-Pesa/other configurable), unpaid balance and collection status.
- Payment now and collection now.
- Vendor says goods are ready; collection happens later.
- Goods delivered before payment for quality inspection.
- Vendor history and searchable historical records.
- Piece-by-piece quantity counting, even if garments physically arrive in bundles or sacks.

Example vendor/product notes supplied by the owner (examples only, not fixed price rules):
- “Mzee wa Wanyama” / “Mzee wa Shine-shine”: shiny/printed animal-style garments; approximately KSh 100 per piece.
- Mama Yasmin: plain/common garments around KSh 80; a longer/extra-design extension around KSh 150.
- Hafsa: elastic-neck baby garments and other types; examples include KSh 60, 80, 90, 100 and 150.
- Hafsa's KSh 80 elastic-neck item is smaller/shorter than Mama Yasmin's KSh 80 plain garment. Construction and size differ, so these are separate product types.

Do not assume the vendor alone defines the product. A garment type has its own identity and may include category, age/size range, design/pattern, colour, construction, notes and one or more possible suppliers. Maintain cost history by purchase line; do not overwrite older costs when prices change.

Age/size categories must be configurable and not hardcoded to only the examples. The business handles newborn/small baby garments, multiple children's sizes/ages, medium/in-between sizes and a smaller adult range.

## 4. Special consignment and inspection workflow

Some trusted vendors deliver a sack/package before payment so quality can be inspected. Example: 500 delivered, 300 accepted, 200 rejected and returned.

Required sequence:
1. Record 500 physically delivered as awaiting inspection. Do not add all 500 to saleable stock.
2. Inspect all or part of the quantity.
3. Record accepted quantity (e.g. 300) into saleable stock.
4. Record rejected quantity (e.g. 200), reason where useful, and whether/when it was returned.
5. Calculate the amount payable based on accepted quantity and the agreed unit price.
6. Record payments and remaining balance separately.
7. Preserve the original delivery count and all later inspection/return/payment events in a dated, searchable history.
8. Support partial inspection/return over multiple dates without losing the remaining pending quantity.

The system must prevent accepted + rejected + still-pending quantities from exceeding delivered quantity, except through an explicit correction event.

## 5. Inventory states and stock ledger

Use an auditable movement ledger rather than relying only on an editable “current stock” number.

Distinguish at least:
- Awaiting inspection
- Accepted/saleable
- Rejected/awaiting return
- Returned to vendor
- Stored at a location
- In transit
- Received at destination
- Issued to worker
- Returned by worker
- Sold (derived from issue minus returned, with adjustments recorded separately)
- Damaged/lost/adjusted with reason and authorization

Every movement should record item type, quantity, source/destination (when applicable), actor, event time, server receipt time, device ID if available, source record and correction link if relevant. Enforce non-negative stock where appropriate and prevent double receipt or double issuance.

## 6. Shipment and landed costs

Each shipment/package may have multiple separate cost lines, for example:
- Bus booking fare (an example supplied was KSh 300 per 23 kg sack)
- Conductor/border payment (an example supplied was about KSh 1,000 per sack)
- Air baggage allowance (an example supplied was about US$100 per 23 kg sack; another example was US$200 for two additional allowances)
- Sea freight
- Local transport to/from collection points
- Packaging
- Customs/border fees where applicable
- Other documented costs

These are examples only. The system must record actual costs at the time; never assume these amounts are fixed or always applicable.

Each cost line records amount, currency, date, description/category, payer, related shipment/package, receipt/reference if available, and whether estimated or actual. Preserve the source amount/currency. Any conversion for reporting must use an explicitly recorded exchange rate with date/source.

Provide:
- Basic/gross product margin view: sales minus garment purchase cost.
- Landed/net view: sales minus purchase cost and allocated shipment/transport/other applicable costs.
- Estimated versus actual cost/profit clearly distinguished.
- An explainable allocation method for shared shipment costs (initially configurable; candidate methods include by garment piece count or weight when recorded). Never silently choose an allocation method for historical reports.
- Expenses not tied to a shipment can be recorded separately and included/excluded according to clearly labelled report rules.

## 7. Sales model and worker reconciliation

The business sells wholesale and retail, mainly through hawking rather than a fixed shop POS. Workers may be too busy to record every customer transaction live.

Worker daily workflow:
1. Select work date/shift and record the exact quantities taken by garment type at the moment the stock is physically collected.
2. Save the record immediately, including offline if necessary.
3. At the end of the work period, record the quantities returned by garment type.
4. Record actual money handed over/received, expenses, and any approved cash movements.
5. Record wholesale/discount quantities and realized price where needed, so legitimate discounts are not incorrectly flagged as missing cash.
6. Review their own records and submission status.

Calculation:
- Quantity sold per type = quantity issued minus quantity returned, adjusted only by explicit, auditable damage/loss/correction events.
- Expected proceeds should be calculated from the applicable price/discount records and quantities, but must allow recorded wholesale sales and approved discounts.
- Actual proceeds are entered separately.
- Variance = expected proceeds minus actual proceeds, with the sign and meaning clearly labelled.
- Returns are returned to the correct stock/location.
- Do not treat a money difference alone as proof of theft or misconduct.

Example pricing:
- Many KSh 60/80/100 garments are often sold at KMF 1,000 each (local-count 200).
- Some KSh 150 garments may sell at local-count 350 = KMF 1,750.
- Wholesale quantity discounts may apply; example local-count 200 retail vs 170 wholesale corresponds to KMF 1,000 vs KMF 850 per piece.
- Prices vary by garment type, season, customer, quantity and authorized deal. These examples are not global defaults.

## 8. Currency and local-count display

Official Comorian franc (KMF) is the canonical currency for Comoros sales and money records. Store official KMF amounts, preferably as integer units.

Provide an optional on-demand display toggle for local spoken-count convention:
- local count = KMF amount / 5.
- KMF 1,000 displays as KMF 1,000 and local count 200.
- KMF 1,750 displays as KMF 1,750 and local count 350.

This is a presentation transform only. It must not change the currency, saved transaction, calculations, exports or accounting ledger. Label both values clearly to avoid confusion. The local wording/spelling for spoken labels should remain configurable/awaiting owner confirmation; do not invent translations.

The banknote counter is a secondary, optional utility. It belongs on a separate utility screen or unobtrusive drawer, never in the sales flow. Denominations must be configurable/verified; do not invent denomination values. It must not be required to save a sale or reconcile a worker.

## 9. Offline operation and synchronization

- Core records must save locally before the UI reports success.
- Show clear states: saved on this device, pending sync, syncing, synchronized, sync error and conflict requiring attention.
- Use unique IDs generated on device and idempotency keys so retries cannot duplicate records.
- Preserve both device-recorded event time and server-received time.
- Store the device's timezone/offset when useful; display business times in Africa/Nairobi (UTC+03:00).
- Queue writes durably; retry with backoff and avoid infinite loops.
- Do not silently overwrite conflicting records. Prefer append-only movement/audit events; for editable master data, define and test a conflict policy.
- Do not promise recovery of unsynchronized data if the device is lost/destroyed. Clearly show unsynced records and encourage regular synchronization.
- Cloud records must be shared across authorized family accounts.
- Provide backup/export and a documented restore process.
- Never make a financial or stock operation depend on a live internet connection if it can safely be recorded offline.

## 10. Audit log and access control

Roles should be configurable, with at least:
- Owner/admin: full configuration, users, catalogue, purchases, inspection, shipments, expenses, stock corrections, pricing, reports, audit log and exports.
- Manager: operational and reporting access as explicitly granted by admin.
- Worker: create/view their own stock issue, return, daily sales/cash and expense records; view relevant history and sync status; no access to cost/profit or other workers' private records unless explicitly authorized.

Audit important actions: create/update/reverse/approve/receive/issue/return/pay/adjust/price-change/login/sync-related events where practical. Capture:
- actor user ID and display name at event time
- action type
- affected entity and record ID
- before/after summary or change set, avoiding secrets
- device-recorded timestamp and UTC offset
- server-received timestamp
- device/install ID if available
- online/offline status and sync event reference
- reason/approval when required

Workers should not see the full management audit interface. Do not falsely claim that a device timestamp created offline is cryptographically verified. Use server timestamps after sync and flag suspicious clock drift or backdated entries. Prevent ordinary users from deleting audit history; corrections should be append-only events.

## 11. User experience and visual identity

The app must feel like a mature, deliberately designed business tool, not a generic template.
- Clear visual hierarchy, considered typography, spacing, meaningful status design and restrained but memorable brand palette.
- High-quality responsive layouts for laptop and Android.
- Worker flow optimized for quick use with one hand, minimal typing, large touch targets and plain language.
- Management screens prioritize searchable tables, filters, useful summaries, detail views and audit trails.
- No decorative charts that do not help decisions.
- No intrusive modal/dialog on every action.
- Avoid over-animation, random gradients, generic AI-themed imagery and excessive cards.
- Include loading, empty, offline, sync failure, validation and permission-denied states.
- Make important values legible; show KMF and local count without confusion.
- Design banknote counter as an optional utility only.
- Use accessible contrast and keyboard navigation.

## 12. Reporting

Initial management reports:
- Current stock by location and exact garment type
- Stock in transit and packages awaiting receipt
- Vendor deliveries, inspection acceptance/rejection, balances and payment history
- Worker daily issue/return/sold quantities and cash reconciliation
- Approved discounts and price overrides
- Shipment cost breakdown and landed cost
- Basic versus landed/net profit
- Expenses by type, currency, date and location
- Audit log with filters by user, date, action, record and sync state
- Pending sync/conflict status
- CSV export of key records

All reports must define their date range, currency and calculation assumptions. Avoid describing sales revenue as profit.

## 13. Security, reliability and data ownership

- Enforce authorization in the backend/database, not only by hiding UI controls.
- Enable and test database row-level security.
- Keep privileged secrets on the server only.
- Validate quantities, amounts, ownership and state transitions server-side.
- Use soft deletion or reversal events for important business records.
- Provide data export and a practical recovery plan.
- Do not add analytics/telemetry that exposes business or personal data without approval.
- Do not add recurring paid services without explicit approval.
- Document what the free hosting tier does and does not guarantee.

## 14. Acceptance tests

At minimum, automated tests should prove:
1. Hafsa elastic-neck KSh 80 product and Mama Yasmin plain KSh 80 product remain distinct.
2. A 500-piece consignment does not enter saleable stock as 500 before inspection.
3. Accepting 300 and rejecting/returning 200 results in exactly 300 accepted pieces and preserves the original 500-piece delivery record.
4. Vendor payable amount is calculated from accepted quantity and agreed price, not the rejected quantity.
5. A package in transit is not counted as destination stock before receipt confirmation.
6. Issuing 50 pieces and returning 12 calculates 38 sold for that exact product type.
7. Legitimate wholesale/discount sales can be recorded without incorrectly treating the retail-price difference as unexplained missing cash.
8. KMF 1,000 displays as local count 200; toggling the display does not change the stored amount.
9. KMF 1,750 displays as local count 350.
10. Retrying a sync request does not duplicate a stock movement, payment or sale.
11. Offline records survive app refresh/restart and show pending sync.
12. When a pending record syncs, the original device event time and server receipt time remain separately visible to managers.
13. A worker cannot access admin profit reports or another worker's records through the API.
14. A stock correction preserves the original event and records who authorized the correction.
15. Every shipment cost remains linked to the appropriate package/shipment and retains its original currency.
16. Basic and landed-profit reports use different, clearly documented cost definitions.
17. The app remains usable on a small Android screen and laptop.
18. Exported data can be opened and reconciled against on-screen totals.
19. No credentials are committed to the repository or exposed in client bundles.
20. Production build and test commands pass, or failures are documented honestly.

## 15. Open decisions the agent must not invent

Ask the owner only when a decision blocks implementation. Otherwise use a documented, reversible default and mark it as a proposal:
- Final product/app name and brand palette.
- Whether the first deployment is a web PWA only or also packaged as desktop software.
- Final manager permissions.
- Exact KMF banknote denominations if the optional counter is implemented.
- Exact local-language labels/spellings.
- Preferred shared shipment-cost allocation method.
- Whether a garment type can have multiple vendors and how a default supplier is selected.
- Whether partial worker stock returns and multiple shifts per day are required in v1.
- Whether to enable a paid plan or service (must require explicit approval).
