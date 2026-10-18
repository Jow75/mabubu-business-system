// Sample business history for demo mode. Clearly sample data: names follow
// the examples the owner gave, but every quantity, price and exchange rate
// here is illustrative and must never be copied into real records.

import { Ledger } from './ledger';
import { ENGINE_VERSION, parseOp, type AnyOp, type OpType, type PayloadOf } from './ops';
import { effectiveCapabilities, type Role } from './permissions';
import { addDays, businessDate } from './time';
import type { SessionUser } from './api';
import { A } from './model';

export interface DemoUser extends SessionUser {
  pinHint: string;
}

function demoUser(id: string, name: string, role: Role, locationId: string | null): DemoUser {
  return { id, name, role, caps: effectiveCapabilities(role), locationId, pinHint: role === 'worker' ? '2580' : '135790' };
}

export const DEMO_USERS: DemoUser[] = [
  demoUser('demo-owner', 'Jowg', 'owner', null),
  demoUser('demo-manager', 'Mama', 'manager', null),
  demoUser('demo-amina', 'Amina', 'worker', 'loc-com'),
  demoUser('demo-said', 'Said', 'worker', 'loc-com'),
];

export interface DemoRecord {
  op: AnyOp;
  seq: number;
  serverTime: string;
  actorName: string;
}

/** Deterministic pseudo-random numbers so the demo looks the same each time. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

export function buildDemo(today: string = businessDate()): DemoRecord[] {
  const L = new Ledger();
  L.setUsers(DEMO_USERS.map((u) => ({ id: u.id, name: u.name, role: u.role, active: true, locationId: u.locationId })));
  const out: DemoRecord[] = [];
  const rand = rng(17);
  let n = 0;

  const at = (daysAgo: number, hhmm: string) => {
    const [h, m] = hhmm.split(':').map(Number) as [number, number];
    const d = addDays(today, -daysAgo);
    return new Date(Date.parse(`${d}T00:00:00Z`) + ((h - 3) * 60 + m) * 60_000).toISOString();
  };

  function add<T extends OpType>(who: string, time: string, type: T, payload: PayloadOf<T>, delayMin = 2): AnyOp {
    const user = DEMO_USERS.find((u) => u.id === who)!;
    n++;
    const r = parseOp({
      id: `demo-${String(n).padStart(4, '0')}`,
      type,
      payload,
      actorId: who,
      deviceId: `demo-device-${who}`,
      deviceTime: time,
      tzOffsetMin: 180,
      createdOnline: delayMin < 60,
      v: ENGINE_VERSION,
    });
    if (!r.ok || !r.op) throw new Error(`Demo op ${type} invalid: ${r.error}`);
    const res = L.apply(r.op, { id: user.id, caps: user.caps });
    if (!res.ok) throw new Error(`Demo op ${type} failed: ${res.error}`);
    out.push({ op: r.op, seq: n, serverTime: new Date(Date.parse(time) + delayMin * 60_000).toISOString(), actorName: user.name });
    return r.op;
  }

  const O = 'demo-owner';
  const M = 'demo-manager';
  const day = (ago: number) => addDays(today, -ago);

  // Reference data
  add(O, at(21, '20:10'), 'settings.set', { businessName: 'Mabubu' });
  add(O, at(21, '20:11'), 'location.upsert', { id: 'loc-msa', name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true });
  add(O, at(21, '20:11'), 'location.upsert', { id: 'loc-dar', name: 'Dar es Salaam', kind: 'transit', currency: 'TZS', active: true });
  add(O, at(21, '20:12'), 'location.upsert', { id: 'loc-com', name: 'Comoros', kind: 'selling', currency: 'KMF', active: true });
  const sizes: [string, string][] = [
    ['size-baby', 'Newborn & baby'],
    ['size-small', 'Small child'],
    ['size-child', 'Child'],
    ['size-mid', 'Between child & adult'],
    ['size-adult', 'Small adult'],
  ];
  sizes.forEach(([id, name], i) => add(O, at(21, '20:14'), 'size.upsert', { id, name, sort: i + 1, active: true }));
  add(O, at(21, '20:16'), 'vendor.upsert', { id: 'ven-hafsa', name: 'Hafsa', phone: '', notes: 'Elastic-neck and baby garments', active: true });
  add(O, at(21, '20:16'), 'vendor.upsert', { id: 'ven-yasmin', name: 'Mama Yasmin', phone: '', notes: 'Plain garments; longer cut with extra design', active: true });
  add(O, at(21, '20:17'), 'vendor.upsert', { id: 'ven-wanyama', name: 'Mzee wa Wanyama', phone: '', notes: 'Shiny animal-print garments ("shine-shine")', active: true });

  const garments = [
    { id: 'gt-haf-en80', code: 'HAF-EN80', name: 'Elastic-neck dera', size: 'size-small', vendor: 'ven-hafsa', swatch: '#c8553d', desc: 'Shorter cut with elastic neck' },
    { id: 'gt-haf-bb60', code: 'HAF-BB60', name: 'Baby dera, short', size: 'size-baby', vendor: 'ven-hafsa', swatch: '#e0a13a', desc: '' },
    { id: 'gt-yas-pl80', code: 'YAS-PL80', name: 'Plain dera, tall cut', size: 'size-child', vendor: 'ven-yasmin', swatch: '#2e3a87', desc: 'Taller than HAF-EN80, no elastic' },
    { id: 'gt-yas-ex150', code: 'YAS-EX150', name: 'Long dera, extra design', size: 'size-mid', vendor: 'ven-yasmin', swatch: '#1f7a78', desc: 'Extension of the plain design' },
    { id: 'gt-mzw-sh100', code: 'MZW-SH100', name: 'Shiny animal-print dera', size: 'size-child', vendor: 'ven-wanyama', swatch: '#7a4a8c', desc: 'Printed animals, shiny fabric' },
  ];
  for (const g of garments) {
    add(O, at(21, '20:20'), 'garment.upsert', { id: g.id, code: g.code, name: g.name, sizeCategoryId: g.size, vendorId: g.vendor, description: g.desc, swatch: g.swatch, active: true });
  }
  const prices: [string, number, number | null][] = [
    ['gt-haf-en80', 1000, 850],
    ['gt-haf-bb60', 1000, 850],
    ['gt-yas-pl80', 1000, 850],
    ['gt-yas-ex150', 1750, 1500],
    ['gt-mzw-sh100', 1000, 850],
  ];
  for (const [gt, retail, wholesale] of prices) {
    add(O, at(21, '20:25'), 'price.set', { id: `price-${gt}`, garmentTypeId: gt, locationId: 'loc-com', currency: 'KMF', retail, wholesale, effectiveFrom: day(21) });
  }
  add(O, at(21, '20:30'), 'fx.set', { id: 'fx-kes-kmf', from: 'KES', to: 'KMF', rate: '3.5', date: day(21), source: 'DEMO RATE — not a real quote' });
  add(O, at(21, '20:30'), 'fx.set', { id: 'fx-usd-kmf', from: 'USD', to: 'KMF', rate: '450', date: day(21), source: 'DEMO RATE — not a real quote' });

  // Purchasing in Mombasa
  add(M, at(18, '11:05'), 'purchase.record', {
    id: 'pur-hafsa-1',
    vendorId: 'ven-hafsa',
    locationId: 'loc-msa',
    date: day(18),
    currency: 'KES',
    intake: 'collected',
    lines: [
      { garmentTypeId: 'gt-haf-en80', qty: 300, unitCost: 8000 },
      { garmentTypeId: 'gt-haf-bb60', qty: 200, unitCost: 6000 },
    ],
    note: 'Paid and picked up the same day',
  });
  add(M, at(18, '11:07'), 'vendor.payment', { vendorId: 'ven-hafsa', purchaseId: 'pur-hafsa-1', date: day(18), amount: 3_600_000, currency: 'KES', method: 'mpesa', reference: 'QJH7X2LM', note: '' });
  add(M, at(17, '15:40'), 'purchase.record', {
    id: 'pur-yasmin-1',
    vendorId: 'ven-yasmin',
    locationId: 'loc-msa',
    date: day(17),
    currency: 'KES',
    intake: 'awaiting',
    lines: [
      { garmentTypeId: 'gt-yas-pl80', qty: 400, unitCost: 8000 },
      { garmentTypeId: 'gt-yas-ex150', qty: 100, unitCost: 15000 },
    ],
    note: 'Ordered by phone; she will call when ready',
  });
  add(M, at(17, '15:42'), 'vendor.payment', { vendorId: 'ven-yasmin', purchaseId: 'pur-yasmin-1', date: day(17), amount: 3_000_000, currency: 'KES', method: 'cash', reference: '', note: 'Deposit' });
  add(M, at(16, '10:20'), 'purchase.collect', { purchaseId: 'pur-yasmin-1', date: day(16), lines: [{ garmentTypeId: 'gt-yas-pl80', qty: 400 }, { garmentTypeId: 'gt-yas-ex150', qty: 60 }], note: '40 long ones not ready yet' });
  add(M, at(16, '17:30'), 'purchase.record', {
    id: 'pur-wanyama-1',
    vendorId: 'ven-wanyama',
    locationId: 'loc-msa',
    date: day(16),
    currency: 'KES',
    intake: 'inspection',
    lines: [{ garmentTypeId: 'gt-mzw-sh100', qty: 500, unitCost: 10000 }],
    note: 'Sack delivered to the house before payment',
  });
  add(M, at(15, '09:15'), 'purchase.inspect', { purchaseId: 'pur-wanyama-1', date: day(15), lines: [{ garmentTypeId: 'gt-mzw-sh100', accepted: 300, rejected: 200, reason: 'Loose stitching, faded print' }], note: '' });
  add(M, at(14, '12:00'), 'purchase.return', { purchaseId: 'pur-wanyama-1', date: day(14), lines: [{ garmentTypeId: 'gt-mzw-sh100', qty: 200 }], note: 'Returned to his shop' });
  add(M, at(14, '12:05'), 'vendor.payment', { vendorId: 'ven-wanyama', purchaseId: 'pur-wanyama-1', date: day(14), amount: 3_000_000, currency: 'KES', method: 'mpesa', reference: 'QJK2P9RT', note: 'For the 300 accepted' });
  add(M, at(13, '18:00'), 'expense.record', { locationId: 'loc-msa', date: day(13), category: 'food_lodging', description: 'Lunch and transport on buying day', amount: 150_000, currency: 'KES', shipmentId: null });

  // Shipments
  add(M, at(14, '06:30'), 'shipment.dispatch', {
    id: 'shp-air-01',
    code: 'AIR-01',
    fromLocationId: 'loc-msa',
    toLocationId: 'loc-com',
    method: 'air',
    carrier: 'Checked baggage',
    packages: [
      { label: 'Bag 1', weightKg: 23 },
      { label: 'Bag 2', weightKg: 23 },
      { label: 'Bag 3', weightKg: 22.5 },
    ],
    lines: [
      { garmentTypeId: 'gt-haf-en80', qty: 250 },
      { garmentTypeId: 'gt-haf-bb60', qty: 150 },
      { garmentTypeId: 'gt-yas-pl80', qty: 300 },
      { garmentTypeId: 'gt-yas-ex150', qty: 50 },
      { garmentTypeId: 'gt-mzw-sh100', qty: 250 },
    ],
    date: day(14),
    expectedDate: day(13),
    note: '',
  });
  add(M, at(14, '06:40'), 'shipment.cost', { shipmentId: 'shp-air-01', category: 'air_baggage', description: 'Two extra baggage allowances', amount: 20_000, currency: 'USD', status: 'actual', date: day(14), reference: '', supersedesId: null });
  add(M, at(14, '06:41'), 'shipment.cost', { shipmentId: 'shp-air-01', category: 'local_transport', description: 'Taxi to the airport', amount: 100_000, currency: 'KES', status: 'actual', date: day(14), reference: '', supersedesId: null });
  // Said saves a take-out by mistake and cancels it straight away — corrections keep history.
  const mistaken = add('demo-said', at(12, '16:20'), 'worker.issue', { workerId: 'demo-said', locationId: 'loc-com', workDate: day(12), lines: [{ garmentTypeId: 'gt-haf-en80', qty: 1 }] });
  add('demo-said', at(12, '16:22'), 'op.void', { targetId: mistaken.id, reason: 'Pressed save by mistake, stock not received yet' });
  add(M, at(12, '17:05'), 'shipment.receive', {
    shipmentId: 'shp-air-01',
    date: day(12),
    lines: [
      { garmentTypeId: 'gt-haf-en80', received: 250, missing: 0 },
      { garmentTypeId: 'gt-haf-bb60', received: 150, missing: 0 },
      { garmentTypeId: 'gt-yas-pl80', received: 298, missing: 2 },
      { garmentTypeId: 'gt-yas-ex150', received: 50, missing: 0 },
      { garmentTypeId: 'gt-mzw-sh100', received: 250, missing: 0 },
    ],
    note: 'Two plain deras missing from Bag 2',
  });

  add(M, at(10, '07:15'), 'shipment.dispatch', {
    id: 'shp-bus-02',
    code: 'BUS-02',
    fromLocationId: 'loc-msa',
    toLocationId: 'loc-dar',
    method: 'bus',
    carrier: 'Coast bus',
    packages: [{ label: 'Sack', weightKg: 23 }],
    lines: [
      { garmentTypeId: 'gt-yas-pl80', qty: 100 },
      { garmentTypeId: 'gt-haf-en80', qty: 50 },
    ],
    date: day(10),
    expectedDate: day(9),
    note: 'To wait in Dar es Salaam',
  });
  const est = add(M, at(10, '07:16'), 'shipment.cost', { shipmentId: 'shp-bus-02', category: 'conductor_border', description: 'Conductor / border', amount: 100_000, currency: 'KES', status: 'estimated', date: day(10), reference: '', supersedesId: null });
  add(M, at(10, '07:17'), 'shipment.cost', { shipmentId: 'shp-bus-02', category: 'bus_fare', description: 'Bus booking for the sack', amount: 30_000, currency: 'KES', status: 'actual', date: day(10), reference: '', supersedesId: null });
  add(M, at(9, '20:30'), 'shipment.cost', { shipmentId: 'shp-bus-02', category: 'conductor_border', description: 'Conductor / border (paid)', amount: 120_000, currency: 'KES', status: 'actual', date: day(10), reference: '', supersedesId: est.id });
  add(M, at(9, '20:35'), 'shipment.receive', {
    shipmentId: 'shp-bus-02',
    date: day(9),
    lines: [
      { garmentTypeId: 'gt-yas-pl80', received: 100, missing: 0 },
      { garmentTypeId: 'gt-haf-en80', received: 50, missing: 0 },
    ],
    note: 'Left with cousin in Dar',
  });

  add(M, at(3, '05:50'), 'shipment.dispatch', {
    id: 'shp-air-03',
    code: 'AIR-03',
    fromLocationId: 'loc-msa',
    toLocationId: 'loc-com',
    method: 'air',
    carrier: 'Checked baggage',
    packages: [{ label: 'Bag 1', weightKg: 21 }],
    lines: [
      { garmentTypeId: 'gt-mzw-sh100', qty: 50 },
      { garmentTypeId: 'gt-yas-ex150', qty: 10 },
    ],
    date: day(3),
    expectedDate: day(1),
    note: '',
  });
  add(M, at(3, '05:55'), 'shipment.cost', { shipmentId: 'shp-air-03', category: 'air_baggage', description: 'Extra baggage allowance', amount: 10_000, currency: 'USD', status: 'estimated', date: day(3), reference: '', supersedesId: null });

  // Worker days in the Comoros
  const sellable = ['gt-haf-en80', 'gt-haf-bb60', 'gt-yas-pl80', 'gt-yas-ex150', 'gt-mzw-sh100'];
  const priceOf = Object.fromEntries(prices.map(([g, r, w]) => [g, { r, w: w ?? r }]));
  const workers = ['demo-amina', 'demo-said'];
  for (let ago = 8; ago >= 1; ago--) {
    for (const w of workers) {
      if (rand() < 0.15) continue; // a day off now and then
      const date = day(ago);
      const picks = sellable.filter(() => rand() < 0.55).slice(0, 3);
      if (!picks.length) picks.push('gt-yas-pl80');
      const takeH = 7 + Math.floor(rand() * 2);
      const issue = picks
        .map((g) => ({ garmentTypeId: g, qty: Math.min(10 + Math.floor(rand() * 4) * 5, L.balance(A.avail('loc-com'), g)) }))
        .filter((l) => l.qty >= 5);
      if (!issue.length) continue;
      const late = w === 'demo-said' && ago === 5; // recorded offline, synced the next morning
      add(w, at(ago, `${String(takeH).padStart(2, '0')}:${String(10 + Math.floor(rand() * 40)).padStart(2, '0')}`), 'worker.issue', { workerId: w, locationId: 'loc-com', workDate: date, lines: issue }, late ? 14 * 60 : 1);
      const ret = issue.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: Math.floor(rand() * Math.min(8, l.qty)) })).filter((l) => l.qty > 0);
      if (ret.length) add(w, at(ago, '17:40'), 'worker.return', { workerId: w, locationId: 'loc-com', workDate: date, lines: ret }, late ? 13 * 60 : 1);
      const wholesaleDay = w === 'demo-said' && ago === 4;
      const lines = issue.map((l) => {
        const held = l.qty - (ret.find((r) => r.garmentTypeId === l.garmentTypeId)?.qty ?? 0);
        const wq = wholesaleDay && l.garmentTypeId === issue[0]!.garmentTypeId ? held : 0;
        return { garmentTypeId: l.garmentTypeId, held, sold: held, wholesaleQty: wq, retailPrice: priceOf[l.garmentTypeId]!.r, wholesalePrice: priceOf[l.garmentTypeId]!.w, carried: 0, lost: 0 };
      });
      const expected = lines.reduce((s, l) => s + (l.sold - l.wholesaleQty) * l.retailPrice + l.wholesaleQty * l.wholesalePrice, 0);
      const expenses = rand() < 0.4 ? [{ description: 'Transport to the market', amount: 500 }] : [];
      const spent = expenses.reduce((s, e) => s + e.amount, 0);
      const short = w === 'demo-amina' && ago === 3 ? 2000 : 0;
      const mobile = rand() < 0.3 ? 5000 : 0;
      add(w, at(ago, '18:05'), 'worker.settle', {
        workerId: w,
        locationId: 'loc-com',
        workDate: date,
        currency: 'KMF',
        lines,
        cash: expected - spent - short - mobile,
        mobile,
        expenses,
        note: wholesaleDay ? 'One shop owner bought all of them at the wholesale price' : short ? 'I think I gave wrong change' : '',
      }, late ? 13 * 60 : 1);
      if (ago >= 5) add(M, at(ago - 1, '08:30'), 'worker.review', { workerId: w, workDate: date, decision: 'approved', note: '' });
      if (short) add(M, at(ago - 1, '08:35'), 'worker.review', { workerId: w, workDate: date, decision: 'queried', note: 'KMF 2,000 short — please explain' });
    }
  }
  add(M, at(2, '13:00'), 'expense.record', { locationId: 'loc-com', date: day(2), category: 'market_fees', description: 'Market stall fee', amount: 2000, currency: 'KMF', shipmentId: null });
  add(M, at(2, '13:10'), 'stock.adjust', { locationId: 'loc-com', date: day(2), reason: 'damaged', lines: [{ garmentTypeId: 'gt-haf-bb60', delta: -2 }], note: 'Water damage in storage' });

  // Today: Amina is out selling.
  add('demo-amina', at(0, '07:42'), 'worker.issue', {
    workerId: 'demo-amina',
    locationId: 'loc-com',
    workDate: today,
    lines: [
      { garmentTypeId: 'gt-haf-en80', qty: 40 },
      { garmentTypeId: 'gt-mzw-sh100', qty: 20 },
    ],
  });
  return out;
}
