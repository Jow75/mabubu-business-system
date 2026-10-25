# ADR-002 — Exchange rates, vendor balances and downloadable reports

Date: 18 Oct 2026, §5 added 22 Oct 2026. Status: accepted; the two payment items are now decided and built (§5); the place-filter question remains open (end of file).

## 1. Purchase and vendor balances have one source

**Problem found:** a payment recorded on the vendor page (without choosing a purchase) lowered the vendor's balance but not the purchase's. The purchase list used a per-purchase "paid" field that only counted payments that named that purchase. Two numbers, two answers. That is the KES 17,000 Mama Yasmin case.

**Decision:** `vendorAccounts()` in `src/shared/queries.ts` is the only place balances are worked out. Purchase, vendor, overview and export screens all read it.

- Owed = the purchase's value, or only the accepted pieces for deliveries on inspection.
- Payments that named the purchase count first.
- Payments not tied to a purchase are applied to that vendor's **oldest unpaid purchase first, in the same currency**. Anything left over is shown as credit with the vendor.
- Nothing is stored. The result is recomputed from the records, so it cannot drift. A test checks that it always equals the vendor ledger postings.

The payment sheet on the vendor page now asks "What does this pay for?" and defaults to "Oldest unpaid purchase first". Payment references such as M-Pesa codes appear on the purchase.

## 2. Exchange rates: recorded rates for cost, market rates for "value now"

The agreed rule (requirements §4): *"Any conversion for reporting must use an explicitly recorded exchange rate with date/source."* This is kept.

- **Recorded rates** (`fx.set` records) now also say what kind of rate they are: *actually received*, *market reference saved on purpose*, or *entered by hand*. Older records count as "entered by hand".
- **Reports convert each amount with the recorded rate in force on that amount's own date.** A later rate never changes past profit.
- **Market reference rates** come from ExchangeRate-API's open-access endpoint (`open.er-api.com`). Checked on 18 Oct 2026, it has:
  - no account or key, cost $0;
  - KES, KMF, TZS, USD and EUR;
  - updates once a day;
  - attribution required ("Rates By Exchange Rate API", shown in the converter);
  - no redistribution of the data.

  The server fetches the rates, checks them and caches them in D1 (`fx_market`, migration 0002). It asks the provider at most once per published update, and waits 30 minutes before retrying after a failure. If the provider is down, the last good rates are shown with their age and a stale warning. In demo mode the device asks the provider directly.
- KMF and other pairs are worked out through USD, the provider's base (rate = units of target per USD ÷ units of source per USD). As a sanity check, KMF/EUR from the feed came out at ≈ 491.97, which matches the official fixed parity of 491.96775.
- Reports can optionally show **"today's market (value now)"**. That view is labelled as current value, not historical cost.
- Every report line shows its original amounts ("as paid: KSh 31,720") and lists each rate used, with its date, kind and source.
- A missing rate leaves the amount out and marks the report **Incomplete** in red. The app never shows it as a finished profit figure.

## 3. Downloads

- Reports are built on the device from the same records and selection functions as each screen (`src/shared/reports.ts`). The downloaded totals therefore match the screen.
- Formats:
  - **PDF**: jsPDF 4.2.1 and jspdf-autotable 5.0.9, MIT licence. Loaded only when a PDF is made, with table headers repeated on every page and page numbers.
  - **Excel (.xlsx)**: a small writer of our own. Numbers stay numbers and dates are real dates.
  - **CSV**.
  - **Word** is not offered yet.
- Who may download what is set in `src/shared/report-catalog.ts`. The builder refuses without the right permission, and workers never hold management records anyway. When online, each download is noted in the sign-in & device log ("Report downloaded"). Downloads made offline or in demo mode are not logged.

## 4. The place filter

The Overview's place switch is remembered on the device. Sales days, Expenses and Reports applied it **without saying so**: with "Mombasa" chosen they showed no sales and only the Mombasa expense. Those pages now:

- show the place picker themselves;
- show a notice ("Showing Mombasa only. 8 sales days at other places are hidden by this filter. [Show all places]");
- explain why a list is empty.

## 5. Vendor credit and payment allocation (22 Oct 2026, owner-authorised brief, Phase 4)

**Problem.** A payment recorded for one purchase that was larger than the
purchase left the purchase "overpaid" (a negative balance), and the extra could
not be used for the same vendor's other purchases. A payment could not be held
as credit while purchases were unpaid, and the only way to change what an
existing payment pays was to cancel it and enter it again — a second cash
record for one real payment.

**Rule.** The payment record is the one canonical record of the cash that
moved: amount, date, vendor, method and M-Pesa reference never change. *How*
it is used is a separate, explicit choice:

- New record `payment.allocate { paymentId, basedOn, allocations[], note }`:
  how one payment is split across **the same vendor's purchases in the same
  currency**. Whatever it does not split onto a purchase is **vendor credit**.
  It moves no money and posts nothing — it is not a payment, not a refund,
  not income, not a negative expense. Owner/manager only (`payments`).
- It replaces the payment's previous split. `basedOn` names the split it
  replaces (null for none yet); if someone else changed it meanwhile the new
  one is refused ("Someone changed how this payment is used. Check it again
  and retry."). It is never cancelled — a correction is a new split — so the
  allocation history is the list of splits, all kept.
- The rules refuse a split that adds up to more than the payment, names a
  purchase of another vendor or currency, a cancelled purchase or payment, or
  puts more on a purchase than it costs.

**How balances are worked out** (still only in `vendorAccounts()`; the split
is a recorded choice, not a stored balance). Payments are taken oldest first:

1. A payment split by hand pays the purchases it names, and a payment recorded
   for one purchase pays that purchase — each **never more than the purchase
   still owes**; the rest stays as credit until someone allocates it.
2. Then vendor-page payments (no purchase chosen) pay the oldest unpaid
   purchases first — the agreed default, unchanged — and what they cannot
   place is credit too.

So no purchase is ever paid more than it costs, credit is never negative, and
the same money is never counted twice: for every payment, what it pays plus
what stays as credit equals the payment. If a split asks more than a purchase
still needs (for example two phones splitting different payments onto the same
purchase), only what it needs is applied; the rest stays as credit and the
vendor page says so. `VendorAccount` now carries `outstanding` (what purchases
still owe), `credit` (available vendor credit) and `balance` = payable − paid =
outstanding − credit.

**The owner's example.** Purchase A KSh 5,000; payment KSh 10,000 for A →
A owes 0, credit KSh 5,000, one payment of KSh 10,000. Allocate KSh 3,000 of
the credit to purchase B (KSh 3,000) → A 0, B 0, credit KSh 2,000, the payment
still exactly KSh 10,000, recorded once (`tests/vendor-credit.test.ts`).

**Screens.** Recording a payment shows "What this payment will do" before
saving, computed by the same rules on the draft (so the preview is what the
books will show). A payment larger than its purchase offers "Leave the extra as
credit" (default) or "Use it now for other unpaid purchases". From the vendor
page a payment can also be "kept as credit for now". The vendor page shows
Outstanding purchases and Available vendor credit separately, Allocate credit,
and for each payment what it pays, what stays as credit, Change allocation and
the allocation history. A purchase with something owed offers "Use credit for
this purchase" when the vendor holds credit; its history lists the splits that
touched it. Nothing is ever moved onto another purchase without the owner
seeing it first.

**Production effect (checked read-only, 22 Oct 2026):** the three real
payments exactly match their purchases, so no real figure changes.

**Not built:** refunds from a vendor (cash coming back) — record them as a
note today; ask before adding a record type for them.

## Open decisions for the owner

1. **Payments not tied to a purchase go to the oldest unpaid purchase first.** This matches what was expected in testing. The alternative is to keep them as unapplied credit until someone chooses a purchase.
2. **The place switch is remembered on the device.** Keep it remembered (now always visible), or reset it to "All places" on each sign-in?

## Owner decisions recorded 18 Oct 2026 (provisional)

| Decision | What the code does today | Gap |
|---|---|---|
| Unassigned vendor payments go to the oldest unpaid purchase first (same currency) | Yes — `vendorAccounts()` | — |
| An authorised user may assign a payment to a specific purchase | Yes, when the payment is recorded ("What does this pay for?") | — |
| Genuine unallocated credit (advances, payments awaiting allocation) | Yes since 22 Oct: "Keep it as credit for now", and the extra of a payment larger than its purchase stays as visible credit (§5) | — |
| Each payment recorded once, original amount and reference kept, allocations traceable | Yes — idempotent upload; `PurchaseBalance.allocations` lists each payment, its reference and how it reached the purchase (`named` / `auto` / `allocated`) | — |
| Re-allocating an existing payment must keep the original and record the change | Yes since 22 Oct: `payment.allocate` re-splits the one payment; every split stays in the history (§5) | — |

Both former open items were built on the owner's go-ahead of 22 Oct 2026 (§5).

Other decisions confirmed unchanged: location filter remembered per device and shown on every affected page and download; PINs 6 digits for owner/manager, 4 for workers; a closed worker day stays closed until a manager reopens it (the reopen keeps the closing record and its reason in the log); workers see only stock they hold; the profit report charges shipment costs in the period they are paid and says it is not a per-garment landed cost. KMF banknote values and the ÷5 wording remain editable in Settings and unconfirmed.
