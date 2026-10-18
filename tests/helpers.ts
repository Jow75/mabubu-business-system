import { Ledger } from '../src/shared/ledger';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from '../src/shared/ops';
import { effectiveCapabilities, type Role } from '../src/shared/permissions';
import type { Actor } from '../src/shared/engine';
import type { UserRef } from '../src/shared/model';

export const USERS: Record<string, UserRef> = {
  owner: { id: 'u-owner', name: 'Jowg', role: 'owner', active: true, locationId: null },
  manager: { id: 'u-manager', name: 'Mama', role: 'manager', active: true, locationId: null },
  amina: { id: 'u-amina', name: 'Amina', role: 'worker', active: true, locationId: 'loc-com' },
  said: { id: 'u-said', name: 'Said', role: 'worker', active: true, locationId: 'loc-com' },
};

export function actor(who: keyof typeof USERS): Actor {
  const u = USERS[who]!;
  return { id: u.id, caps: effectiveCapabilities(u.role as Role) };
}

let n = 0;
let clock = Date.parse('2026-10-17T05:00:00.000Z');

/** Build a validated operation. Throws if the payload does not match its schema. */
export function op<T extends OpType>(type: T, payload: PayloadOf<T>, who: keyof typeof USERS = 'owner'): AnyOp {
  n += 1;
  clock += 60_000;
  const raw = {
    id: `op-${String(n).padStart(5, '0')}`,
    type,
    payload,
    actorId: USERS[who]!.id,
    deviceId: 'dev-test',
    deviceTime: new Date(clock).toISOString(),
    tzOffsetMin: 180,
    createdOnline: true,
    v: ENGINE_VERSION,
  };
  const r = parseOp(raw);
  if (!r.ok) throw new Error(`Invalid test op ${type}: ${r.error}`);
  return r.op!;
}

/** Apply and assert success; returns the effects. */
export function ok(ledger: Ledger, o: AnyOp, who: keyof typeof USERS | null = 'owner') {
  const r = ledger.apply(o, who ? actor(who) : null);
  if (!r.ok) throw new Error(`Expected ${o.type} to succeed, got: ${r.error}`);
  return r.effects;
}

export function fails(ledger: Ledger, o: AnyOp, who: keyof typeof USERS | null = 'owner') {
  const r = ledger.apply(o, who ? actor(who) : null);
  if (r.ok) throw new Error(`Expected ${o.type} to fail`);
  return r;
}

export const IDS = {
  msa: 'loc-msa',
  dar: 'loc-dar',
  com: 'loc-com',
  small: 'size-baby',
  child: 'size-child',
  hafsa: 'ven-hafsa',
  yasmin: 'ven-yasmin',
  hafsaElastic80: 'gt-haf-en80',
  yasminPlain80: 'gt-yas-pl80',
  yasminLong150: 'gt-yas-lg150',
};

/** A ledger with locations, vendors, garment types and Comoros prices. */
export function seeded(): Ledger {
  const L = new Ledger();
  L.setUsers(Object.values(USERS));
  ok(L, op('location.upsert', { id: IDS.msa, name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true }));
  ok(L, op('location.upsert', { id: IDS.dar, name: 'Dar es Salaam', kind: 'transit', currency: 'TZS', active: true }));
  ok(L, op('location.upsert', { id: IDS.com, name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }));
  ok(L, op('size.upsert', { id: IDS.small, name: 'Baby', sort: 1, active: true }));
  ok(L, op('size.upsert', { id: IDS.child, name: 'Child', sort: 2, active: true }));
  ok(L, op('vendor.upsert', { id: IDS.hafsa, name: 'Hafsa', phone: '', notes: '', active: true }));
  ok(L, op('vendor.upsert', { id: IDS.yasmin, name: 'Mama Yasmin', phone: '', notes: '', active: true }));
  ok(
    L,
    op('garment.upsert', {
      id: IDS.hafsaElastic80,
      code: 'HAF-EN80',
      name: 'Elastic-neck baby dera',
      sizeCategoryId: IDS.small,
      vendorId: IDS.hafsa,
      description: 'Smaller, elastic neck',
      swatch: '#c2410c',
      active: true,
    }),
  );
  ok(
    L,
    op('garment.upsert', {
      id: IDS.yasminPlain80,
      code: 'YAS-PL80',
      name: 'Plain dera',
      sizeCategoryId: IDS.child,
      vendorId: IDS.yasmin,
      description: 'Taller, no elastic',
      swatch: '#1d4ed8',
      active: true,
    }),
  );
  ok(
    L,
    op('garment.upsert', {
      id: IDS.yasminLong150,
      code: 'YAS-LG150',
      name: 'Long dera with extra design',
      sizeCategoryId: IDS.child,
      vendorId: IDS.yasmin,
      description: '',
      swatch: '#15803d',
      active: true,
    }),
  );
  for (const gt of [IDS.hafsaElastic80, IDS.yasminPlain80]) {
    ok(L, op('price.set', { id: `pr-${gt}`, garmentTypeId: gt, locationId: IDS.com, currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }));
  }
  ok(L, op('price.set', { id: 'pr-long', garmentTypeId: IDS.yasminLong150, locationId: IDS.com, currency: 'KMF', retail: 1750, wholesale: null, effectiveFrom: '2026-01-01' }));
  return L;
}
