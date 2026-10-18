# ADR-002 — Exchange rates, vendor balances and downloadable reports

Date: 18 Oct 2026. Status: accepted, with two owner decisions open (end of file).

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

## Open decisions for the owner

1. **Payments not tied to a purchase go to the oldest unpaid purchase first.** This matches what was expected in testing. The alternative is to keep them as unapplied credit until someone chooses a purchase.
2. **The place switch is remembered on the device.** Keep it remembered (now always visible), or reset it to "All places" on each sign-in?
