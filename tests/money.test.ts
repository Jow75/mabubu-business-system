import { describe, expect, it } from 'vitest';
import { convertMinor, formatLocalCount, formatMoney, localCount, parseMoney } from '../src/shared/money';
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
