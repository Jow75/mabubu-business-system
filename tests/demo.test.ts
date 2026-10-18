import { describe, expect, it } from 'vitest';
import { buildDemo, DEMO_USERS } from '../src/shared/demo-data';
import { Ledger } from '../src/shared/ledger';
import { A } from '../src/shared/model';
import { profitReport, stockByLocation } from '../src/shared/queries';
import { canSee } from '../src/shared/visibility';

describe('demo data', () => {
  it('is a valid history that replays cleanly through the engine', () => {
    const records = buildDemo('2026-10-18');
    expect(records.length).toBeGreaterThan(60);
    const L = new Ledger();
    L.setUsers(DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
    for (const r of records) expect(L.apply(r.op, null).ok).toBe(true);
    // Every physical stock account stays at or above zero.
    for (const [k, v] of L.balances) {
      if (/^(avail|worker|transit|insp|rej|await)\|/.test(k)) expect(v, k).toBeGreaterThanOrEqual(0);
    }
    expect(L.balance(A.worker('loc-com', 'demo-amina'), 'gt-haf-en80')).toBe(40);
    expect(stockByLocation(L).get('loc-com')).toBeDefined();
    const r = profitReport(L, '2026-09-01', '2026-10-31', 'KMF');
    expect(r.salesValue).toBeGreaterThan(0);
    expect(r.missingRates).toEqual([]);
  });

  it.each(DEMO_USERS.map((u) => [u.role, u.name, u] as const))('replays cleanly for a %s (%s) who only receives the records they may see', (_role, _name, user) => {
    const records = buildDemo('2026-10-18');
    const byId = new Map(records.map((r) => [r.op.id, r.op]));
    const visible = records.filter((r) => canSee(r.op, 'applied', user, (id) => byId.get(id)));
    const L = new Ledger();
    // Workers only receive themselves in the directory, exactly like the server.
    const dir = user.role === 'worker' ? DEMO_USERS.filter((u) => u.id === user.id) : DEMO_USERS;
    L.setUsers(dir.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
    const failures = visible.map((r) => ({ type: r.op.type, res: L.apply(r.op, null) })).filter((x) => !x.res.ok);
    expect(failures.map((f) => `${f.type}: ${(f.res as { error: string }).error}`)).toEqual([]);
    if (user.role === 'worker') {
      expect(L.list('gt').length).toBe(5);
      expect(visible.some((r) => r.op.type === 'purchase.record' || r.op.type === 'vendor.upsert')).toBe(false);
    }
  });
});
