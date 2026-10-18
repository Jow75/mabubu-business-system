// Interface languages: detection, completeness, fallback, greetings, error
// wording, and proof that the chosen language never changes business results.

import { describe, expect, it } from 'vitest';
import { DICTS, detectLang, greeting, localizeError, makeT, periodOf, translate, type Key, type Lang } from '../src/shared/i18n';
import { en } from '../src/shared/i18n/en';
import { buildDemo, DEMO_USERS } from '../src/shared/demo-data';
import { Ledger } from '../src/shared/ledger';
import { buildLookups, describeOp } from '../src/shared/describe';
import { profitReport, purchaseBalances, stockByLocation, vendorAccounts, workerDays } from '../src/shared/queries';
import { fmtDate, setDisplayLocale } from '../src/shared/time';

const KEYS = Object.keys(en) as Key[];
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe('choosing the first language', () => {
  it.each([
    [['fr-FR', 'en'], 'fr'],
    [['fr-KM'], 'fr'],
    [['sw-TZ'], 'sw'],
    [['sw'], 'sw'],
    [['en-US'], 'en'],
    [['ar-KM', 'fr'], 'fr'],
    [['ar'], 'en'],
    [['de-DE', 'it'], 'en'],
    [[], 'en'],
  ] as [string[], Lang][])('%j → %s', (list, lang) => {
    expect(detectLang(list)).toBe(lang);
  });

  it('copes with a missing language list', () => {
    expect(detectLang(undefined)).toBe('en');
    expect(detectLang(null)).toBe('en');
  });
});

describe('translations are complete', () => {
  it.each(['fr', 'sw'] as Lang[])('%s has every key, none empty, with the same {placeholders} as English', (lang) => {
    const d = DICTS[lang];
    const missing = KEYS.filter((k) => !d[k]?.trim());
    expect(missing).toEqual([]);
    const extra = Object.keys(d).filter((k) => !(k in en));
    expect(extra).toEqual([]);
    for (const k of KEYS) expect(placeholders(d[k]!), `${lang} ${k}`).toEqual(placeholders(en[k]));
  });

  it('keeps the product and place names as they are', () => {
    for (const lang of ['fr', 'sw'] as Lang[]) {
      expect(translate(lang, 'auth.tagline')).toMatch(/dera/i);
      expect(translate(lang, 'auth.tagline')).toMatch(/Mombasa/);
      expect(translate(lang, 'auth.tagline')).toMatch(/Ngazidja/);
      expect(translate(lang, 'lbl.payment.mpesa')).toBe('M-Pesa');
    }
  });

  it('the key worker actions are really in French, not English', () => {
    const t = makeT('fr');
    for (const k of ['w.take', 'w.return', 'w.closeDay', 'c.save', 'sd.cash', 'w.closedBody', 'sync.offline'] as Key[]) expect(t(k)).not.toBe(en[k]);
    expect(t('w.take')).toBe('Prendre des vêtements');
    expect(t('w.closeDay')).toBe('Clôturer la journée');
  });
});

describe('translate', () => {
  it('fills in names and numbers', () => {
    expect(translate('fr', 'sd.takenToast', { n: 12 })).toBe('Enregistré : 12 pcs prises');
    expect(translate('sw', 'sd.youHold', { n: 3 })).toBe('Una 3');
    expect(translate('en', 'w.managerSays', { note: 'Explain' })).toBe('Manager: “Explain”');
  });

  it('falls back to English for a missing translation, then to the key itself', () => {
    const saved = DICTS.fr['c.save'];
    delete DICTS.fr['c.save'];
    try {
      expect(translate('fr', 'c.save')).toBe('Save');
    } finally {
      DICTS.fr['c.save'] = saved;
    }
    expect(translate('fr', 'no.such.key' as Key)).toBe('no.such.key');
  });

  it('leaves unknown placeholders visible rather than inventing a value', () => {
    expect(translate('en', 'sd.worth')).toBe('Worth {amount} at full price');
  });
});

describe('greetings', () => {
  const at = (h: number, day = 18) => new Date(2026, 9, day, h, 15);

  it('follow the local hour', () => {
    expect([5, 11, 12, 16, 17, 21, 22, 2].map(periodOf)).toEqual(['morning', 'morning', 'afternoon', 'afternoon', 'evening', 'evening', 'night', 'night']);
    expect(greeting('en', at(8), 'George', 'u1')).toMatch(/morning/i);
    expect(greeting('en', at(14), 'George', 'u1')).toMatch(/afternoon|Hello/);
    expect(greeting('fr', at(19), 'George', 'u1')).toMatch(/^Bon(soir| ?ne soirée)/);
    expect(greeting('sw', at(8), 'Amina', 'u2')).toMatch(/asubuhi/i);
    expect(greeting('sw', at(19), 'Amina', 'u2')).toMatch(/jioni/i);
  });

  it('include the person’s name, and read cleanly without one', () => {
    for (const lang of ['en', 'fr', 'sw'] as Lang[]) {
      for (const h of [8, 14, 19, 23]) {
        expect(greeting(lang, at(h), 'George', 'x')).toContain('George');
        const plain = greeting(lang, at(h), '', 'x');
        expect(plain).not.toMatch(/\{name\}|,\s*$|\s,|,\s*[.?!]/);
      }
    }
  });

  it('stay the same through the day and vary between days', () => {
    expect(greeting('fr', at(8), 'George', 'u1')).toBe(greeting('fr', at(10), 'George', 'u1'));
    const week = new Set(Array.from({ length: 10 }, (_, i) => greeting('en', at(9, 10 + i), 'George', 'u1')));
    expect(week.size).toBeGreaterThan(1);
  });
});

describe('server and rule messages on screen', () => {
  it('shows known messages in the chosen language and keeps the details', () => {
    expect(localizeError('fr', 'This day is already closed. Ask a manager to reopen it.')).toBe('Cette journée est déjà clôturée. Demandez à un responsable de la rouvrir.');
    expect(localizeError('fr', 'HAF-80: sold + kept + lost must equal the 12 held.')).toBe('HAF-80 : vendus + gardés + perdus doit être égal aux 12 en main.');
    expect(localizeError('sw', 'Too many wrong codes. Try again in 15 minutes.')).toBe('Namba nyingi zisizo sahihi. Jaribu tena baada ya dakika 15.');
  });

  it('shows an unknown message as it came, and English unchanged', () => {
    expect(localizeError('fr', 'Something brand new.')).toBe('Something brand new.');
    expect(localizeError('en', 'This day is already closed. Ask a manager to reopen it.')).toBe('This day is already closed. Ask a manager to reopen it.');
  });
});

describe('the language never changes business results', () => {
  function replay() {
    const L = new Ledger();
    L.setUsers(DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
    const records = buildDemo('2026-10-18');
    for (const r of records) expect(L.apply(r.op, null).ok).toBe(true);
    return { L, records };
  }
  function results(L: Ledger) {
    return JSON.stringify({
      vendors: vendorAccounts(L),
      purchases: [...purchaseBalances(L)],
      stock: [...stockByLocation(L)].map(([k, v]) => [k, [...v]]),
      days: workerDays(L),
      profit: profitReport(L, '2026-09-01', '2026-10-31', 'KMF'),
      balances: [...L.balances],
    });
  }

  it('balances, stock, sales days and profit are identical in every language', () => {
    const { L, records } = replay();
    setDisplayLocale('en-GB');
    const base = results(L);
    const ops = JSON.stringify(records.map((r) => r.op));
    const lk = buildLookups(L, DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
    for (const [lang, locale] of [['fr', 'fr-FR'], ['sw', 'sw-KE'], ['en', 'en-GB']] as const) {
      setDisplayLocale(locale);
      // Describe every record in this language (what the screens do).
      for (const r of records) expect(describeOp(r.op, lk, L, makeT(lang)).length).toBeGreaterThan(0);
      expect(results(L)).toBe(base);
    }
    // The records themselves are untouched: same ids, amounts, currency codes.
    expect(JSON.stringify(records.map((r) => r.op))).toBe(ops);
    setDisplayLocale('en-GB');
  });

  it('describes records in French with the stored amount and currency code unchanged', () => {
    const { L, records } = replay();
    const lk = buildLookups(L, DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
    const settle = records.find((r) => r.op.type === 'worker.settle')!.op;
    const fr = describeOp(settle, lk, L, makeT('fr'));
    const enText = describeOp(settle, lk, L);
    expect(fr).toMatch(/a clôturé la journée/);
    const amount = enText.match(/KMF [\d,]+/)?.[0];
    expect(amount).toBeTruthy();
    expect(fr).toContain(amount!);
  });

  it('only the wording of dates changes with the language', () => {
    setDisplayLocale('fr-FR');
    const fr = fmtDate('2026-10-17');
    setDisplayLocale('en-GB');
    const enDate = fmtDate('2026-10-17');
    expect(enDate).toMatch(/17 Oct 2026/);
    expect(fr).toMatch(/17/);
    expect(fr).toMatch(/2026/);
    expect(fr).not.toBe(enDate);
  });
});
