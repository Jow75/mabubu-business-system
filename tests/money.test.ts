import { describe, expect, it } from 'vitest';
import { convertMinor, editTyped, formatAmount, formatLocalCount, formatMoney, lineTotal, localCount, parseMoney, type Currency } from '../src/shared/money';
import { businessDate } from '../src/shared/time';
import { pinPolicyError, effectiveCapabilities } from '../src/shared/permissions';

describe('Comoros local count (display only)', () => {
  it('KMF 1,000 displays as local count 200 (AT-8)', () => {
    expect(localCount(1000)).toBe(200);
    expect(formatLocalCount(1000)).toBe('200');
  });
  it('KMF 1,750 displays as local count 350 (AT-9)', () => {
    expect(formatLocalCount(1750)).toBe('350');
  });
  it('wholesale 170 local equals KMF 850', () => {
    expect(localCount(850)).toBe(170);
    expect(500 * 1000 - 500 * 850).toBe(75_000);
  });
  it('shows a decimal rather than rounding a non-multiple of five', () => {
    expect(formatLocalCount(1003)).toBe('200.6');
  });
});

describe('money parsing and formatting', () => {
  it('stores KES with cents and KMF in whole francs', () => {
    expect(parseMoney('KES', '80')).toBe(8000);
    expect(parseMoney('KES', '82.5')).toBe(8250);
    expect(parseMoney('KES', '1,000.25')).toBe(100025);
    expect(parseMoney('KES', '1.234')).toBeNull();
    expect(parseMoney('KMF', '1,750')).toBe(1750);
    expect(parseMoney('KMF', '17.5')).toBeNull();
    expect(parseMoney('KMF', '-5')).toBeNull();
    expect(parseMoney('KMF', '')).toBeNull();
  });
  it('formats amounts with their currency', () => {
    expect(formatMoney('KES', 8000)).toBe('KSh 80');
    expect(formatMoney('KES', 8250)).toBe('KSh 82.50');
    expect(formatMoney('KMF', 425000)).toBe('KMF 425,000');
    expect(formatMoney('KMF', -1500)).toBe('−KMF 1,500');
  });
  it('converts only with an explicit rate', () => {
    expect(convertMinor(8000, 'KES', 'KMF', '3.5')).toBe(280);
    expect(convertMinor(280, 'KMF', 'KES', 1 / 3.5)).toBe(8000);
  });
});

describe('typing an amount: thousands separators are display only (owner request, 27 Oct 2026)', () => {
  /** Type one character at the cursor, as a browser does, then apply the field's rule. */
  const typeAt = (c: Currency, f: { text: string; caret: number }, ch: string) => {
    const raw = f.text.slice(0, f.caret) + ch + f.text.slice(f.caret);
    const r = editTyped(c, f.text, raw, f.caret + ch.length, 'insertText');
    return { text: r.text, caret: r.caret ?? f.caret + ch.length };
  };
  const typeAll = (c: Currency, keys: string) => [...keys].reduce((f, ch) => typeAt(c, f, ch), { text: '', caret: 0 });
  /** Backspace (or Delete) with the cursor at `caret`, as a browser does, then apply the field's rule. */
  const erase = (c: Currency, text: string, caret: number, forward = false) => {
    const i = forward ? caret : caret - 1;
    const raw = text.slice(0, i) + text.slice(i + 1);
    const r = editTyped(c, text, raw, i, forward ? 'deleteContentForward' : 'deleteContentBackward');
    return { text: r.text, caret: r.caret };
  };

  it('20880 shows as 20,880, 17000 as 17,000 and 1500 as 1,500 — in every currency', () => {
    for (const c of ['KES', 'KMF', 'TZS', 'USD', 'EUR'] as const) {
      expect(typeAll(c, '20880').text).toBe('20,880');
      expect(typeAll(c, '17000').text).toBe('17,000');
      expect(typeAll(c, '1500').text).toBe('1,500');
      expect(typeAll(c, '999').text).toBe('999');
      expect(typeAll(c, '1234567').text).toBe('1,234,567');
    }
  });

  it('the amount is the same number with or without the commas (stored value unchanged)', () => {
    expect(parseMoney('KES', '20,880')).toBe(parseMoney('KES', '20880'));
    expect(parseMoney('KES', '20,880')).toBe(2_088_000);
    expect(parseMoney('KMF', '17,000')).toBe(17_000);
    expect(parseMoney('KMF', '1,500')).toBe(1_500);
    // Any whole amount, typed digit by digit, saves exactly what the digits say.
    for (let i = 0; i < 400; i++) {
      const n = Math.floor(Math.random() * 10 ** (1 + (i % 12)));
      for (const c of ['KES', 'KMF'] as const) {
        const shown = typeAll(c, String(n)).text;
        expect(shown.replace(/,/g, '')).toBe(String(n));
        expect(parseMoney(c, shown)).toBe(parseMoney(c, String(n)));
      }
    }
  });

  it('groups while typing, one digit at a time, with the cursor at the end', () => {
    const steps: string[] = [];
    [...'20880'].reduce((f, ch) => {
      const next = typeAt('KES', f, ch);
      steps.push(`${next.text}|${next.caret}`);
      return next;
    }, { text: '', caret: 0 });
    expect(steps).toEqual(['2|1', '20|2', '208|3', '2,088|5', '20,880|6']);
  });

  it('adds no decimals the person did not type, and keeps the ones they did', () => {
    expect(typeAll('KES', '20880').text).toBe('20,880');
    expect(typeAll('KES', '20880.').text).toBe('20,880.');
    expect(typeAll('KES', '20880.5').text).toBe('20,880.5');
    expect(parseMoney('KES', typeAll('KES', '20880.5').text)).toBe(2_088_050);
    expect(typeAll('KES', '20880.50').text).toBe('20,880.50');
  });

  it('an amount opened for editing shows grouped, and reads back the same', () => {
    expect(formatAmount('KES', 2_088_000)).toBe('20,880');
    expect(formatAmount('KES', 2_088_050)).toBe('20,880.50');
    expect(formatAmount('KMF', 227_400)).toBe('227,400');
    for (const [c, v] of [['KES', 2_088_000], ['KES', 2_088_050], ['KES', 100_100], ['KMF', 227_400], ['TZS', 1_500]] as const) expect(parseMoney(c, formatAmount(c, v))).toBe(v);
  });

  it('inserting a digit in the middle keeps the cursor beside it', () => {
    // 20,8|80 → type 1 → 208,1|80
    expect(typeAt('KES', { text: '20,880', caret: 4 }, '1')).toEqual({ text: '208,180', caret: 5 });
    // |20,880 → type 1 → 1|20,880
    expect(typeAt('KES', { text: '20,880', caret: 0 }, '1')).toEqual({ text: '120,880', caret: 1 });
    // 20,|880 → type 5 → 205,|880 (cursor after the 5, before the comma)
    expect(typeAt('KMF', { text: '20,880', caret: 3 }, '5')).toEqual({ text: '205,880', caret: 3 });
  });

  it('Backspace or Delete next to a comma deletes the digit beside it (the comma alone would come straight back)', () => {
    // 20,|880 Backspace → 2|,880
    expect(erase('KES', '20,880', 3)).toEqual({ text: '2,880', caret: 1 });
    // 20|,880 Delete → 2,0|80
    expect(erase('KES', '20,880', 2, true)).toEqual({ text: '2,080', caret: 3 });
    // 20,880| Backspace → 2,088|
    expect(erase('KES', '20,880', 6)).toEqual({ text: '2,088', caret: 5 });
    // 2|,088 Backspace → |88 (leading zero dropped)
    expect(erase('KMF', '2,088', 1)).toEqual({ text: '88', caret: 0 });
    // Deleting every digit leaves an empty field.
    let f: { text: string; caret: number | null } = { text: '1,500', caret: 5 };
    for (let i = 0; i < 6 && f.text; i++) f = erase('KMF', f.text, f.caret!);
    expect(f.text).toBe('');
  });

  it('paste, select-all and retype, clear', () => {
    // Paste into an empty field: with or without separators, or spaces.
    for (const p of ['20880', '20,880', '20 880']) expect(editTyped('KES', '', p, p.length, 'insertFromPaste')).toEqual({ text: '20,880', caret: 6 });
    // Select all and type a digit: the browser leaves just that digit.
    expect(editTyped('KES', '20,880', '7', 1, 'insertText')).toEqual({ text: '7', caret: 1 });
    // Clear (cut or delete everything).
    expect(editTyped('KES', '20,880', '', 0, 'deleteByCut')).toEqual({ text: '', caret: 0 });
    expect(parseMoney('KES', '')).toBeNull();
  });

  it('text that is not a plain amount is left exactly as typed, so the field can say it is not valid', () => {
    expect(editTyped('KES', '20,88', '20,88a', 6, 'insertText')).toEqual({ text: '20,88a', caret: null });
    expect(parseMoney('KES', '20,88a')).toBeNull();
    expect(editTyped('KMF', '17', '17.5', 4, 'insertText')).toEqual({ text: '17.5', caret: null }); // KMF has no decimals
    expect(editTyped('KES', '1.23', '1.234', 5, 'insertText')).toEqual({ text: '1.234', caret: null }); // KES has two
    expect(editTyped('KES', '', 'KSh 500', 7, 'insertFromPaste')).toEqual({ text: 'KSh 500', caret: null });
    expect(editTyped('KES', '', '-500', 4, 'insertFromPaste')).toEqual({ text: '-500', caret: null }); // amounts are never negative here
  });

  it('drops leading zeros', () => {
    expect(typeAll('KMF', '007').text).toBe('7');
    expect(typeAll('KMF', '0').text).toBe('0');
    expect(typeAll('KES', '0.5').text).toBe('0.5');
  });

  it('a purchase typed with separators costs exactly the same as one typed without (lines and total)', () => {
    // e.g. 341 × KSh 60 and 580 × KSh 80; a slip such as 1001 for 100 now shows as "1,001" (easy to spot).
    const typed = ['60', '80', '1001'].map((p) => typeAll('KES', p).text);
    expect(typed).toEqual(['60', '80', '1,001']);
    const unit = typed.map((p) => parseMoney('KES', p)!);
    expect(unit).toEqual([6000, 8000, 100100]);
    expect(lineTotal(341, unit[0]!) + lineTotal(580, unit[1]!)).toBe(lineTotal(341, 6000) + lineTotal(580, 8000));
    expect(lineTotal(341, unit[0]!) + lineTotal(580, unit[1]!)).toBe(6_686_000); // KSh 66,860
  });
});

describe('business time', () => {
  it('uses UTC+3 for the business date', () => {
    expect(businessDate('2026-10-17T20:59:00Z')).toBe('2026-10-17');
    expect(businessDate('2026-10-17T21:00:00Z')).toBe('2026-10-18');
  });
});

describe('access codes and capabilities', () => {
  it('enforces PIN length by role and blocks trivial codes', () => {
    expect(pinPolicyError('worker', '4770')).toBeNull();
    expect(pinPolicyError('worker', '1234')).not.toBeNull();
    expect(pinPolicyError('worker', '7777')).not.toBeNull();
    expect(pinPolicyError('manager', '4770')).not.toBeNull();
    expect(pinPolicyError('owner', '470915')).toBeNull();
    expect(pinPolicyError('worker', '12a4')).not.toBeNull();
  });
  it('never grants owner-only capabilities to others, and the owner keeps them', () => {
    expect(effectiveCapabilities('manager', ['users.manage'])).not.toContain('users.manage');
    expect(effectiveCapabilities('worker', ['expenses'])).toContain('expenses');
    expect(effectiveCapabilities('owner', [], ['users.manage'])).toContain('users.manage');
    expect(effectiveCapabilities('manager', [], ['costs.view'])).not.toContain('costs.view');
  });
});
