// Interface languages. Display only: nothing here touches stored records,
// amounts, currency codes, ids or the order of operations.
import { en, type Key } from './en';
import { fr } from './fr';
import { sw } from './sw';

export type { Key } from './en';
export type Lang = 'en' | 'fr' | 'sw';
export type Vars = Record<string, string | number>;
export type T = (key: Key, vars?: Vars) => string;

export const LANGS: readonly { code: Lang; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'fr', name: 'Français' },
  { code: 'sw', name: 'Kiswahili' },
];

/** BCP 47 tag used for dates (Intl). Numbers and money keep one fixed style everywhere. */
export const LOCALE: Record<Lang, string> = { en: 'en-GB', fr: 'fr-FR', sw: 'sw-KE' };

export const DICTS: Record<Lang, Partial<Record<Key, string>>> = { en, fr, sw };

export function isLang(v: unknown): v is Lang {
  return v === 'en' || v === 'fr' || v === 'sw';
}

/**
 * Suggested language from the device's list (e.g. navigator.languages):
 * the first entry that is French, Swahili or English wins; anything else → English.
 */
export function detectLang(preferred: readonly string[] | undefined | null): Lang {
  for (const tag of preferred ?? []) {
    const base = tag.toLowerCase().split(/[-_]/)[0];
    if (isLang(base)) return base;
  }
  return 'en';
}

function fill(s: string, vars?: Vars) {
  return vars ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : s;
}

/** Look up a key; a missing translation falls back to English, then to the key itself. */
export function translate(lang: Lang, key: Key, vars?: Vars): string {
  return fill(DICTS[lang][key] ?? en[key] ?? key, vars);
}

export function makeT(lang: Lang): T {
  return (key, vars) => translate(lang, key, vars);
}

export const tEn: T = makeT('en');

/* ---------------- Greetings ---------------- */

export type Period = 'morning' | 'afternoon' | 'evening' | 'night';

export function periodOf(hour: number): Period {
  if (hour >= 5 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 22) return 'evening';
  return 'night';
}

const POOL: Record<Period, Key[]> = {
  morning: ['greet.morning.1', 'greet.morning.2', 'greet.morning.3'],
  afternoon: ['greet.afternoon.1', 'greet.afternoon.2', 'greet.afternoon.3'],
  evening: ['greet.evening.1', 'greet.evening.2'],
  night: ['greet.night.1', 'greet.night.2'],
};

/**
 * A greeting for the device's local hour. The variant changes once a day
 * (stable across renders and navigation), chosen by date and person.
 */
export function greeting(lang: Lang, at: Date, name: string | null | undefined, seed = ''): string {
  const pool = POOL[periodOf(at.getHours())];
  const day = Math.floor((at.getTime() - at.getTimezoneOffset() * 60_000) / 86_400_000);
  let h = day;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  const key = pool[h % pool.length]!;
  const who = name?.trim();
  const text = translate(lang, key, { name: who || '' });
  // Without a name, drop the dangling ", " / " {name}" cleanly.
  return who ? text : text.replace(/,?\s+(?=[.?!]|$)/, '').replace(/\s+,/, ',').replace(/,\s*\./, '.').trim();
}

/* ---------------- Engine and server messages ---------------- */

// Business rules and the server answer in English (that is what is stored and
// logged). On screen, known messages are shown in the chosen language; an
// unknown message is shown as it came.
const ERRORS: [RegExp, Key, string[]][] = [
  [/^This day is already closed\. Ask a manager to reopen it\.$/, 'err.dayClosed', []],
  [/^This day was started at another location, not (.+)\.$/, 'err.otherLocation', ['place']],
  [/^(.+): no selling price set\.$/, 'err.noPrice', ['label']],
  [/^(.+): enter the wholesale price\.$/, 'err.wholesalePrice', ['label']],
  [/^(.+): sold \+ kept \+ lost must equal the (\d+) held\.$/, 'err.heldSum', ['label', 'n']],
  [/^(.+): wholesale pieces cannot be more than pieces sold\.$/, 'err.wholesaleMore', ['label']],
  [/^Quantity cannot be negative\.$/, 'err.negative', []],
  [/^Sales at (.+) are recorded in (\w+)\.$/, 'err.salesCurrency', ['place', 'currency']],
  [/^Not signed in\.$/, 'err.notSignedIn', []],
  [/^Invalid entry\.$/, 'err.invalid', []],
  [/^No connection to the server\.$/, 'err.noServer', []],
  [/^Wrong code\. (\d+) tries left on this device\.$/, 'err.wrongCodeLocal', ['n']],
  [/^Too many wrong codes\. Connect to the internet and sign in again\.$/, 'err.tooManyLocal', []],
  [/^That name and code do not match\.$/, 'err.noMatch', []],
  [/^Enter your name and your 4–8 digit code\.$/, 'err.enterNameCode', []],
  [/^Too many wrong attempts from this network\. Try again in an hour\.$/, 'err.networkLimit', []],
  [/^This account is locked after too many wrong codes\. Ask the owner to unlock it\.$/, 'err.locked', []],
  [/^This account is now locked\. Ask the owner to unlock it\.$/, 'err.nowLocked', []],
  [/^Too many wrong codes\. Wait before trying again\.$/, 'err.wait', []],
  [/^Too many wrong codes\. Try again in (\d+) minutes\.$/, 'err.waitMinutes', ['n']],
  [/^This account is switched off\. Ask the owner\.$/, 'err.switchedOff', []],
  [/^This device was blocked by the owner\.$/, 'err.deviceBlocked', []],
  [/^The owner has not allowed this device for you\.$/, 'err.deviceNotAllowed', []],
  [/^This device is not recognised\. Reset the app on this device and sign in again\.$/, 'err.deviceUnknown', []],
  [/^Please sign in\.$/, 'err.signIn', []],
  [/^Your session has ended\. Please sign in again\.$/, 'err.sessionEnded', []],
  [/^This device is no longer allowed\. Ask the owner\.$/, 'err.deviceNoLonger', []],
  [/^The setup key is not correct\.$/, 'err.setupKey', []],
  [/^Fill in the setup key, your name and a code\.$/, 'err.setupFill', []],
  [/^Setup is already done\. For recovery, enter the existing owner’s name\.$/, 'err.setupDone', []],
  [/^Work day not found\.$/, 'err.workDayNotFound', []],
  [/^The record to cancel was not found\.$/, 'err.recordNotFound', []],
  [/^The code must contain digits only\.$/, 'err.pinDigits', []],
  [/^An? (?:owner|manager|worker) code needs at least (\d+) digits\.$/, 'err.pinShort', ['n']],
  [/^The code can have at most (\d+) digits\.$/, 'err.pinLong', ['n']],
  [/^Avoid codes with one repeated digit\.$/, 'err.pinRepeat', []],
  [/^Avoid simple sequences like 1234\.$/, 'err.pinSequence', []],
  [/^No connection\. Showing the last rates saved on this device\.$/, 'err.ratesOffline', []],
  [/^Could not get rates\.$/, 'err.ratesFailed', []],
  [/^Too many wrong codes on this device\.$/, 'err.tooManyDevice', []],
  [/^Something went wrong on the server\.$/, 'err.serverWrong', []],
  [/^Server error \((\d+)\)\.$/, 'err.serverStatus', ['n']],
  [/^You do not have permission for this\.$/, 'err.noPermission', []],
  [/^You do not have permission for this action\.$/, 'err.noPermissionAction', []],
  [/^You do not have permission to download this report\.$/, 'err.noPermissionReport', []],
  [/^Person not found\.$/, 'err.personNotFound', []],
  [/^Unknown person\.$/, 'err.unknownPerson', []],
  [/^Only an owner can add another owner\.$/, 'err.ownerAddsOwner', []],
  [/^Only an owner can make someone an owner\.$/, 'err.ownerMakesOwner', []],
  [/^That name is already used\. Add a surname or an initial\.$/, 'err.nameTakenHint', []],
  [/^That name is already used\.$/, 'err.nameTaken', []],
  [/^There must always be at least one active owner\.$/, 'err.lastOwner', []],
  [/^Unknown location\.$/, 'err.unknownLocation', []],
  [/^Invalid request\.$/, 'err.invalidRequest', []],
  [/^Device not found\.$/, 'err.deviceNotFound', []],
  [/^You cannot block or retire the device you are using\.$/, 'err.ownDevice', []],
  [/^You cannot archive your own account\.$/, 'err.ownAccount', []],
  [/^The business was just set up from another device\. Try again to recover owner access\.$/, 'err.setupRace', []],
  [/^Another device was saving at the same moment\. Try again\.$/, 'err.busy', []],
  [/^Unknown vendor\.$/, 'err.unknownVendor', []],
  [/^Unknown garment type\.$/, 'err.unknownGarment', []],
  [/^Unknown size category\.$/, 'err.unknownSize', []],
  [/^This record is changed by editing, not cancelling\.$/, 'err.editNotCancel', []],
  [/^This kind of record is changed by editing, not cancelling\.$/, 'err.editNotCancelKind', []],
  [/^Pick two different currencies\.$/, 'err.twoCurrencies', []],
  [/^Purchase not found\.$/, 'err.purchaseNotFound', []],
  [/^Cancel the collections, inspections, returns and payments of this purchase first\.$/, 'err.purchaseDependents', []],
  [/^This purchase was not waiting for collection\.$/, 'err.notAwaiting', []],
  [/^This purchase was not delivered for inspection\.$/, 'err.notInspection', []],
  [/^Some of these rejected pieces were already returned to the vendor\. Cancel the return first\.$/, 'err.rejectedReturned', []],
  [/^This purchase was cancelled\.$/, 'err.purchaseCancelled', []],
  [/^This purchase belongs to another vendor\.$/, 'err.otherVendor', []],
  [/^Origin and destination must be different\.$/, 'err.sameRoute', []],
  [/^Shipment not found\.$/, 'err.shipmentNotFound', []],
  [/^Cancel this shipment’s receipts and cost lines first\.$/, 'err.shipmentDependents', []],
  [/^This shipment was cancelled\.$/, 'err.shipmentCancelled', []],
  [/^The cost being replaced is not an active cost line of this shipment\.$/, 'err.costNotActive', []],
  [/^Cost line not found\.$/, 'err.costNotFound', []],
  [/^This cost was replaced by a later one\. Cancel the later one first\.$/, 'err.costReplaced', []],
  [/^Explain the adjustment in the note\.$/, 'err.explainAdjust', []],
  [/^This day is not closed by this record\.$/, 'err.notThisClose', []],
  [/^Only a closed day can be reviewed\.$/, 'err.reviewClosedOnly', []],
  [/^This day was already approved\.$/, 'err.alreadyApproved', []],
  [/^The late record was not found\.$/, 'err.lateNotFound', []],
  [/^This late record was already decided\.$/, 'err.lateDecided', []],
  [/^Reopen this day before accepting the late record\.$/, 'err.reopenFirst', []],
  [/^Only a manager can decide on a late record\.$/, 'err.managerDecides', []],
  [/^Payment not found\.$/, 'err.paymentNotFound', []],
  [/^This payment was cancelled\.$/, 'err.paymentCancelled', []],
  [/^Someone changed how this payment is used\. Check it again and retry\.$/, 'err.allocChanged', []],
  [/^The amounts add up to more than the payment\.$/, 'err.allocOverPayment', []],
  [/^More than this purchase costs\.$/, 'err.allocOverPurchase', []],
  [/^Records can only be created in your own name\.$/, 'err.ownName', []],
  [/^Only a manager can cancel this record\.$/, 'err.managerCancels', []],
  [/^This purchase was already recorded\.$/, 'err.purchaseExists', []],
  [/^This shipment was already recorded\.$/, 'err.shipmentExists', []],
  [/^This record was already cancelled\.$/, 'err.alreadyCancelled', []],
  [/^Request is too large\.$/, 'err.tooLarge', []],
];

/** Appended by the app when a session ends; the reason before it is translated on its own. */
const SAVED_STAY = ' Your saved records stay on this device until you sign in again.';

export function localizeError(lang: Lang, message: string | null | undefined): string {
  if (!message) return '';
  if (lang === 'en') return message;
  if (message.endsWith(SAVED_STAY)) return `${localizeError(lang, message.slice(0, -SAVED_STAY.length))} ${translate(lang, 'err.savedStay')}`;
  for (const [re, key, names] of ERRORS) {
    const m = re.exec(message);
    if (m) return translate(lang, key, Object.fromEntries(names.map((n, i) => [n, m[i + 1]!])));
  }
  return message;
}
