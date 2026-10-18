# ADR-003 — Interface languages (English, French, Kiswahili)

Status: accepted 18 Oct 2026

## Context

Workers in the Comoros need to use the app comfortably in French. The owner works in English. Kiswahili is wanted as a third option. The app must work offline, and a language choice must never change a business record.

## Decision

- **A small in-house translation layer**, no library: `src/shared/i18n/` holds `en.ts` (defines every key), `fr.ts` and `sw.ts` (typed `Record<Key, string>`, so a missing key fails the type check), and `index.ts` (lookup with English fallback, `{placeholder}` filling, language detection, greetings, and the on-screen wording of known rule and server messages). Screens call `useT()`; `rich()` places formatted amounts inside a sentence.
- **Per device, not per user.** The choice is stored with the other device preferences (`localStorage`, key `mabubu.prefs`). It survives reloads and app installs, works offline, and never changes anyone else's phone. A shared family laptop has one language, so each person can still change it under **Settings** or **Me** in one tap. No server field, no migration.
- **First use asks once.** Before sign-in, the app shows English / Français / Kiswahili with the device language preselected: the first French, Swahili or English entry in the browser's language list, otherwise English. It is not asked again once chosen.
- **Display only.** Stored records, amounts, currency codes, ids, operation order and sync are unchanged by language. Names typed by people (garments, vendors, places, notes) are shown exactly as stored: Mabubu, Madeira and Dera are never translated. The rules engine and the server keep their messages in English (that is what is logged); the screen shows the translated wording of the known messages and the original text for anything unknown.
- **Dates** follow the language (month and weekday names). **Numbers and money** keep one format everywhere (`KMF 1,000`), so an amount reads the same on every phone.
- **Downloads stay in English** for now (PDF, Excel, CSV titles and column names). Their totals are unchanged. The download sheet says so.
- **Greetings** use the device clock: morning 05–12, afternoon 12–17, evening 17–22, night otherwise; 10 phrasings per language, chosen once per day per person. The owner, when reading in English, also sees a quiet French line; nothing else is bilingual.

## Consequences

- Adding a screen means adding keys to all three files; the type checker and `tests/i18n.test.ts` refuse an incomplete or mismatched dictionary.
- Kiswahili is plain Kenyan/Tanzanian usage. French is everyday business French. Neither has been reviewed by a native speaker from the family yet; Shikomori wording is not used anywhere until the family confirms it.
- Product descriptions are whatever the owner types; they can be written in two languages in the same field. A per-language description field would need a schema change and is not built.
