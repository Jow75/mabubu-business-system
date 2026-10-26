// Read-only snapshot of a database's business configuration and record
// counts, to compare before and after a deploy or migration (docs/DEPLOY.md).
// Only non-secret columns are read: no codes, PIN hashes, device secrets or
// session tokens. Nothing is written to the database.
//
//   node scripts/data-snapshot.mjs take   production <out.json>
//   node scripts/data-snapshot.mjs compare <before.json> <after.json>
//
// Keep snapshots outside the repository (they name people and vendors).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const DB = { production: ['mabubu', []] };
const WRANGLER = new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function query(target, sql) {
  const [name, extra] = DB[target];
  for (let attempt = 1; ; attempt++) {
    try {
      // Wrangler's own script through Node: no shell, so the SQL stays one argument on Windows too.
      const out = execFileSync(process.execPath, [WRANGLER, 'd1', 'execute', name, '--remote', '--json', ...extra, '--command', sql], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024 });
      return JSON.parse(out.slice(out.indexOf('[')))[0].results;
    } catch (e) {
      // The laptop's connection (a phone hotspot) drops now and then.
      if (attempt >= 3) throw e;
    }
  }
}

const hash = (v) => createHash('sha256').update(JSON.stringify(v)).digest('hex').slice(0, 16);

function take(target) {
  const q = (sql) => query(target, sql);
  // Each set-up record kind, with a fingerprint of every record's full data.
  const entities = q("SELECT key, kind, data FROM entities WHERE kind IN ('loc','size','vendor','gt','price','fx','settings') ORDER BY key");
  const byKind = {};
  for (const e of entities) {
    const d = JSON.parse(e.data);
    (byKind[e.kind] ??= []).push({ key: e.key, name: d.name ?? d.code ?? `${d.from ?? ''}${d.to ? '→' + d.to : ''}`, fingerprint: hash(d) });
  }
  const balances = q('SELECT COUNT(*) AS rows, COALESCE(SUM(qty), 0) AS net, COALESCE(SUM(ABS(qty)), 0) AS gross FROM balances')[0];
  return {
    target,
    takenAt: new Date().toISOString(),
    migrations: q('SELECT name FROM d1_migrations ORDER BY id').map((r) => r.name),
    meta: q("SELECT k, v FROM meta WHERE k IN ('phase', 'ledger') ORDER BY k"),
    people: q('SELECT id, name, role, active, location_id FROM users ORDER BY created_at'),
    devices: q(
      "SELECT d.code, d.revoked_at IS NOT NULL AS blocked, d.retired_at IS NOT NULL AS retired, (SELECT group_concat(u.name || ':' || a.status, ', ') FROM device_access a JOIN users u ON u.id = a.user_id WHERE a.device_id = d.id) AS access FROM devices d ORDER BY d.created_at",
    ),
    setUp: byKind,
    opsByType: q('SELECT type, status, COUNT(*) AS n FROM ops GROUP BY type, status ORDER BY type, status'),
    tables: q(
      'SELECT (SELECT COUNT(*) FROM ops) AS ops, (SELECT COALESCE(MAX(seq), 0) FROM ops) AS maxSeq, (SELECT COUNT(*) FROM entities) AS entities, (SELECT COUNT(*) FROM ops_trial) AS opsTrial, (SELECT COUNT(*) FROM cutovers) AS cutovers, (SELECT COUNT(*) FROM users) AS users, (SELECT COUNT(*) FROM devices) AS devices',
    )[0],
    balances,
  };
}

function compare(a, b) {
  const diffs = [];
  const walk = (x, y, path) => {
    if (JSON.stringify(x) === JSON.stringify(y)) return;
    if (x && y && typeof x === 'object' && typeof y === 'object' && !Array.isArray(x)) {
      for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k], `${path}.${k}`);
      return;
    }
    diffs.push({ path, before: x, after: y });
  };
  for (const k of ['migrations', 'meta', 'people', 'devices', 'setUp', 'opsByType', 'tables', 'balances']) walk(a[k], b[k], k);
  return diffs;
}

const [cmd, x, y] = process.argv.slice(2);
if (cmd === 'take' && DB[x] && y) {
  const snap = take(x);
  writeFileSync(y, JSON.stringify(snap, null, 2));
  const kinds = Object.fromEntries(Object.entries(snap.setUp).map(([k, v]) => [k, v.length]));
  console.log(`${x}: ${snap.people.length} people, ${snap.devices.length} devices, set-up ${JSON.stringify(kinds)}, ${snap.tables.ops} records (max seq ${snap.tables.maxSeq}), migrations ${snap.migrations.length}, written to ${y}`);
} else if (cmd === 'compare' && x && y) {
  const diffs = compare(JSON.parse(readFileSync(x, 'utf8')), JSON.parse(readFileSync(y, 'utf8')));
  if (!diffs.length) console.log('No difference in people, devices, set-up, records, balances or migrations.');
  for (const d of diffs) console.log(`${d.path}\n  before: ${JSON.stringify(d.before)}\n  after:  ${JSON.stringify(d.after)}`);
  process.exitCode = diffs.length ? 1 : 0;
} else {
  console.log('usage: node scripts/data-snapshot.mjs take production <out.json> | compare <before.json> <after.json>');
  process.exitCode = 2;
}
