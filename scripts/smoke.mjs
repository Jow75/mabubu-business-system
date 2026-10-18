// End-to-end smoke test against a running server (default: local wrangler dev).
// Usage: node scripts/smoke.mjs [baseUrl] [setupToken]
// Creates real records — run it against a local or throw-away database only.

import { readFileSync } from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';

const base = process.argv[2] ?? 'http://127.0.0.1:8787';
const setupToken = process.argv[3] ?? /SETUP_TOKEN=(.*)/.exec(readFileSync('.dev.vars', 'utf8'))?.[1]?.trim();

const ok = (cond, msg) => {
  if (!cond) {
    console.error('✗', msg);
    process.exitCode = 1;
  } else console.log('✓', msg);
};

async function call(method, path, body, token) {
  const res = await fetch(base + path, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {}
  return { status: res.status, body: json };
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(base + '/api/health');
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('Server did not start');
}

const dev = () => ({ deviceId: randomUUID(), deviceSecret: randomBytes(32).toString('base64url'), deviceLabel: 'smoke' });
let t = Date.now() - 600_000;
const op = (type, payload, actorId, deviceId) => ({
  id: randomUUID(),
  type,
  payload,
  actorId,
  deviceId,
  deviceTime: new Date((t += 1000)).toISOString(),
  tzOffsetMin: 180,
  createdOnline: true,
  v: 1,
});

await waitForServer();
const status = await call('GET', '/api/setup/status');
ok(status.status === 200, `setup status ${JSON.stringify(status.body)}`);

const ownerDev = dev();
const ownerName = `Smoke Owner ${Date.now()}`;
let s = await call('POST', '/api/setup', { setupToken, name: status.body.needsSetup ? ownerName : 'Jowg', pin: '470915', ...ownerDev });
if (!status.body.needsSetup) {
  console.log('Database already set up — run against a fresh local DB to exercise setup.');
  process.exit(0);
}
ok(s.status === 200 && s.body.status === 'ok', 'owner created via setup');
const owner = { token: s.body.token, id: s.body.user.id };
const d = ownerDev.deviceId;
const sfx = Date.now().toString(36);
const loc = `loc-com-${sfx}`;
const gt = `gt-${sfx}`;
let r = await call(
  'POST',
  '/api/sync/push',
  {
    clientNow: new Date().toISOString(),
    ops: [
      op('location.upsert', { id: loc, name: 'Comoros', kind: 'selling', currency: 'KMF', active: true }, owner.id, d),
      op('location.upsert', { id: `loc-msa-${sfx}`, name: 'Mombasa', kind: 'purchasing', currency: 'KES', active: true }, owner.id, d),
      op('garment.upsert', { id: gt, code: 'HAF-EN80', name: 'Elastic-neck', sizeCategoryId: null, vendorId: null, description: '', swatch: '#c2410c', active: true }, owner.id, d),
      op('price.set', { id: `pr-${sfx}`, garmentTypeId: gt, locationId: loc, currency: 'KMF', retail: 1000, wholesale: 850, effectiveFrom: '2026-01-01' }, owner.id, d),
      op('stock.adjust', { locationId: loc, date: new Date().toISOString().slice(0, 10), reason: 'found', lines: [{ garmentTypeId: gt, delta: 100 }], note: 'opening stock' }, owner.id, d),
    ],
  },
  owner.token,
);
ok(r.status === 200 && r.body.results.every((x) => x.status === 'applied'), `catalogue push: ${r.body.results?.map((x) => x.status + (x.error ? ':' + x.error : '')).join(', ')}`);

// Rename a location: an update of an existing entity must pass the version guard on real D1.
r = await call('POST', '/api/sync/push', { clientNow: new Date().toISOString(), ops: [op('location.upsert', { id: loc, name: 'Ngazidja', kind: 'selling', currency: 'KMF', active: true }, owner.id, d)] }, owner.token);
ok(r.status === 200 && r.body.results[0].status === 'applied', `entity update passes version guard (${r.status} ${JSON.stringify(r.body).slice(0, 160)})`);

// Worker
const wDev = dev();
const created = await call('POST', '/api/admin/people', { name: `Amina ${sfx}`, role: 'worker', pin: '4770', locationId: loc, grants: [], revokes: [], allowOnDeviceId: null }, owner.token);
ok(created.status === 201, 'worker created');
let l = await call('POST', '/api/auth/login', { name: `amina ${sfx}`, pin: '4770', ...wDev });
ok(l.status === 202 && l.body.status === 'pending', `new device waits for approval (code ${l.body?.deviceCode})`);
await call('POST', '/api/admin/access', { deviceId: wDev.deviceId, userId: created.body.id, decision: 'approve' }, owner.token);
l = await call('POST', '/api/auth/login', { name: `Amina ${sfx}`, pin: '4770', ...wDev });
ok(l.status === 200, 'worker signs in after approval');
const w = { token: l.body.token, id: l.body.user.id };
const today = new Date(Date.now() + 3 * 3600_000).toISOString().slice(0, 10);
const issue = op('worker.issue', { workerId: w.id, locationId: loc, workDate: today, lines: [{ garmentTypeId: gt, qty: 50 }] }, w.id, wDev.deviceId);
const ret = op('worker.return', { workerId: w.id, locationId: loc, workDate: today, lines: [{ garmentTypeId: gt, qty: 12 }] }, w.id, wDev.deviceId);
const settle = op(
  'worker.settle',
  {
    workerId: w.id,
    locationId: loc,
    workDate: today,
    currency: 'KMF',
    lines: [{ garmentTypeId: gt, held: 38, sold: 38, wholesaleQty: 0, retailPrice: 1000, wholesalePrice: 850, carried: 0, lost: 0 }],
    cash: 38000,
    mobile: 0,
    expenses: [],
    note: '',
  },
  w.id,
  wDev.deviceId,
);
r = await call('POST', '/api/sync/push', { clientNow: new Date().toISOString(), ops: [issue, ret, settle] }, w.token);
ok(r.status === 200 && r.body.results.every((x) => x.status === 'applied'), `worker day push: ${r.body.results?.map((x) => x.status + (x.error ? ':' + x.error : '')).join(', ')}`);
r = await call('POST', '/api/sync/push', { clientNow: new Date().toISOString(), ops: [issue, ret, settle] }, w.token);
ok(r.body.results.every((x) => x.duplicate), 'retry is idempotent');
const p = await call('GET', '/api/sync/pull?since=0', undefined, w.token);
ok(p.status === 200 && p.body.ops.length >= 3, `worker pull returned ${p.body.ops?.length} records`);
const bad = await call('POST', '/api/sync/push', { clientNow: new Date().toISOString(), ops: [op('stock.adjust', { locationId: loc, date: today, reason: 'found', lines: [{ garmentTypeId: gt, delta: 5 }], note: '' }, w.id, wDev.deviceId)] }, w.token);
ok(bad.body.results[0].status === 'rejected', `worker cannot adjust stock: ${bad.body.results[0].error}`);
ok((await call('GET', '/api/admin/people', undefined, w.token)).status === 403, 'worker cannot open people admin');
console.log(process.exitCode ? '\nSMOKE TEST FAILED' : '\nSmoke test passed.');
