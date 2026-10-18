# Master fix brief — owner onboarding, duplicate reference data, device identity

**Audience:** the next AI coding agent working on this repository (hand this to it verbatim).
**Author of this brief:** a review session that investigated the code but did **not** change any code or any production data.
**Date:** 2026-10-19.

---

## 0. How to behave (read before touching anything)

- Obey `CLAUDE.md` and `docs/requirements/`, `docs/decisions/ADR-00*`. The requirements are the source of truth.
- **Do not change an agreed business rule silently.** If a fix would change behaviour the owner agreed to, stop and explain the options.
- **Do not touch the live database or deploy** without the owner's explicit go-ahead. The app is live at the URL in `docs/HANDOVER_NEXT_SESSION.md` with real owner data already in it.
- **Invent nothing** — no prices, rates, banknote values, translations, or names. If you don't know a fact, say so and ask.
- Report honestly what you tested and what you did not. Before claiming any change is done, run:
  `npm run typecheck && npm test && npm run build`
  and add a test for every behaviour you change (`tests/engine.test.ts`, `tests/worker.test.ts`, or a client test if one fits).
- These defects were found by inspecting code only. Reproduce each one yourself before and after your fix. Where this brief says "likely" or "needs reproduction", confirm it against the running app with DevTools open — do not assume.

---

## 1. What the owner actually experienced (their words, kept intact)

On the **live** site, on a laptop (Wi-Fi "sneaker"), the owner:
1. Ran setup with the setup key, entered name + a **6-digit** owner code, created the owner account, and edited vendors and garment types. This worked.
2. Switched to a **phone** (Wi-Fi "Jowg"), opened the same URL in Chrome, chose a language, and tried to sign in as a not-yet-existing worker ("test", a random 4-digit code). It errored — expected, because no worker existed yet.
3. Came back to the laptop and found **the page had refreshed and they were signed out**. It now asked them to **type a name** (not "tap your profile"). They typed the owner name "George Muraguri" + the 6-digit code. The login box showed **only four PIN circles but accepted six digits**, and then, instead of signing in, it **gave a device code and told them to ask the owner to approve the device** — even though they *are* the owner, on the same laptop they had just set up on.
4. They re-ran **create owner** (the setup key had not been deleted). It succeeded again and sent them back through the starter/add-vendors flow. Vendors and garments were still there.
5. Afterwards, across the app, reference data appears **duplicated** ("double double"):
   - **Stock → all places:** Comoros, Comoros / Dar es Salaam, Dar es Salaam / Mombasa, Mombasa.
   - **People & devices → Add person → "works at":** the same places listed twice.
   - **Garments & prices:** the **retail / wholesale selling-price columns appear twice**, and the **size groups are doubled**: Newborn & baby ×2, Small child ×2, Child ×2, Between child & adult ×2, Small adult ×2.
   - This blocked them from entering selling prices and finishing size-group setup.

The owner wants: the bugs found, explained, and fixed so the system is reliable with no errors; the duplicates cleaned up; and the onboarding made so this cannot happen again.

---

## 2. Confirmed root cause of the "double double" (one cause, many symptoms)

**This is the primary bug. It is confirmed in code, not a guess.**

- `src/client/screens/manage/StarterSetup.tsx` seeds 3 default places and 5 default size groups. Each seeded record is created with a **freshly generated `uuidv7()`** (lines ~60 and ~64), so `location.upsert` / `size.upsert` behave as **inserts, every time** — nothing is keyed to an existing record.
- `StarterSetup` is shown whenever `firstRun === true` (`src/client/App.tsx:115`).
- `src/client/lib/store.ts` `setup()` sets `firstRun: true` on **every** successful setup response — **including owner *recovery***, not only first-time creation (around lines 187–194). The server's `/setup` endpoint returns `status: 'ok'` for both first creation and recovery (`src/worker/auth.ts` `setup()`), and the client cannot currently tell them apart.

**Therefore:** the owner ran setup a second time (step 4 above). That was treated as recovery on the server but still set `firstRun`, so `StarterSetup` ran again and seeded a **second** Mombasa, Dar es Salaam, and Comoros, plus a **second** full set of size groups.

**Why the price columns also doubled:** the Catalogue shows a retail+wholesale price pair **per selling location**. There are now **two** Comoros selling locations, so the retail/wholesale columns render twice. Fix the duplicate locations and the doubled columns disappear with them — it is the same bug, not a separate rendering bug.

### Required fix (Defect 1 — critical)
1. **`firstRun` must fire only on genuine first creation.** Make the server tell the client which path ran (e.g. add `created: true` to the `/setup` `ok` response when `count === 0`, `false` on recovery) and have `store.setup()` set `firstRun` only when `created === true`. The server already distinguishes the cases (it logs `setup_owner` vs `setup_recover_owner`) — surface that to the client. Keep `LoginResponse` types in `src/shared/api.ts` in sync.
2. **Make `StarterSetup` idempotent regardless.** Before seeding, check the current ledger for existing locations/size groups and skip any that already exist (match by normalised name), or do not seed at all if the business already has locations. A second run must never create a second copy, even if reached by another path.
3. **Decide and document** whether `location.upsert` / `size.upsert` should be keyed by a stable id so re-submitting the "same" default updates rather than inserts. If you change op semantics, that is a business-rule change — get owner sign-off and write it into the relevant ADR.
4. Add tests: (a) calling setup/recovery twice seeds reference data at most once; (b) `StarterSetup`'s seeding is a no-op when the data already exists.

---

## 3. Owner locked out of their own device / asked to "approve" themselves (Defect 2 — high; reproduce first)

Symptoms: after the phone activity, the laptop refreshed, lost the signed-in owner **profile entirely** (it asked to *type a name* — the "someone else" path in `src/client/screens/auth/Welcome.tsx`, which only appears when there is **no saved real profile**), and re-login produced a **pending device-approval** response — meaning the server saw the laptop as a **new, unrecognised device**.

What the code shows:
- Device identity (`deviceId` + `deviceSecret`) and the signed-in profile (incl. session token) live **only in IndexedDB** (`src/client/lib/device.ts`, `src/client/lib/db.ts`, database `mabubu-device`). If that store is lost, the device becomes unrecognised and the saved profile disappears.
- Storage persistence is requested **only after sign-in** (`store.ts` `requestPersistence`, called from `afterOnlineAuth` / `open`). On a brand-new Chrome profile with low site engagement, `navigator.storage.persist()` can return `false`, and the browser may evict IndexedDB. That would explain both the lost profile and the "new device" result.
- There is no graceful owner recovery path when device identity is lost **other than re-running setup**, which triggers Defect 1 — so Defect 2 directly caused the duplicates.

### Required work
1. **Reproduce with DevTools open** (Application → IndexedDB) on the live site: confirm whether `mabubu-device` survives a reload, a service-worker update, and a tab close/reopen. Establish the *actual* trigger before coding a fix. Do not guess in the final report.
2. Request storage persistence **as early as possible** (at first boot, before/around device creation), and surface to the owner whether persistence was granted.
3. Harden against identity loss: at minimum, make losing the device identity not silently strand the owner. Consider a durable, explicit "this is my device" record and a clear re-link flow. Do **not** weaken the device-approval security model (`ADR-001` §6) without owner sign-off.
4. Make **owner recovery never re-seed** (covered by Defect 1 fix) so that even if the owner must re-run setup, no duplicates appear.
5. Add a worker/auth test around the created-vs-recovered distinction and the device-approval branch.

---

## 4. PIN length is confusing at login (Defect 3 — medium, UX, not data loss)

The owner code is **6–8 digits**, a worker code is **4** (`src/shared/permissions.ts` `MIN_PIN_LENGTH`). The login pad (`src/client/screens/auth/PinPad.tsx`) starts at 4 dots and **grows silently** to 8 as you type (`slots = Math.max(minLength, pin.length)`), with no on-screen hint of how many digits are expected. The owner read "four circles" as "only four allowed", which is why this felt broken even though six digits were accepted.

### Required work
- Make the expected length obvious at sign-in (e.g. show the rule, or render the right number of slots once the name/role is known). Keep it plain-language and translated in all three languages via `useT()` (`en.ts`, `fr.ts`, `sw.ts`). No new component library. This is cosmetic/clarity only — do not change the actual accepted range or the policy.

---

## 5. Clean up the duplicates already in the live database (owner-approved, careful)

The duplicates are real records already synced to the server (`location.upsert` / `size.upsert` ops). They must be removed without breaking the quantity ledger or history.

### Required work
1. **Read-only first:** inspect the live data (or a backup copy) and list exactly which location and size records are duplicated. Nothing has been sold yet, which makes cleanup low-risk, but confirm that no stock/sales/purchase op references the duplicates before removing them.
2. Propose the cleanup to the owner **before** doing it. Prefer the app's own mechanisms (deactivate the extra records, or `op.void` per the double-entry rules in `CLAUDE.md`) over raw SQL, so history and the ledger stay consistent. Keep exactly one of each default.
3. Take a backup first (`docs/DEPLOY.md` describes the backup steps). Do the cleanup only with the owner's explicit go-ahead.

---

## 6. Testing the owner wants (do these; report honestly)

- **Explore / demo mode:** exercise the whole flow here first. Demo uses a separate, self-seeded IndexedDB (`mabubu-demo`, guarded by a `seeded` flag in `store.ts` `openDemo`), so it will **not** duplicate and is safe to hammer. Verify places, size groups, and price columns each appear **once** in demo.
- **Real Android phone:** the owner will enable Developer Options → Wireless debugging and share a network so you can drive their installed PWA. Plan: install, choose Français, run an offline day (take + return with no internet), then reconnect and sync; confirm no duplicates, correct totals, and that the device stays recognised across app restarts.
- Re-run the existing Chrome walkthroughs (manager + worker, all three languages, laptop and 390 px widths) after the fixes.

---

## 7. Known backlog (do not invent values; leave unless asked)

Still open per `docs/STATUS.md` / the handover: downloads (PDF/Excel/CSV) are English-only; no native-speaker review of French/Swahili yet; KMF banknote values and the word for the ÷5 "local count" need the owner to confirm; two payment features (hold a payment as credit; move a payment to another purchase). Do not fabricate banknote values or translations — ask the owner.

---

## 8. Definition of done for this brief

- Setup/recovery run twice → reference data seeded at most once (test proves it).
- A returning owner on their own device is not asked to approve themselves; if identity is genuinely lost, there is a clear, documented recovery that does not create duplicates.
- Login makes the expected code length obvious, in all three languages.
- The live duplicates are gone (owner-approved), with a backup taken first.
- `npm run typecheck && npm test && npm run build` all pass; new tests cover the new rules.
- A short, honest report of what was reproduced, changed, tested, and left open.
