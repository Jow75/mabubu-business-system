// Fails the build if the app could not start without internet: every script
// and stylesheet that index.html loads at start-up — and everything those
// scripts import statically — must be in the service worker's offline cache.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist/client';
const html = readFileSync(join(dir, 'index.html'), 'utf8');
const sw = readFileSync(join(dir, 'sw.js'), 'utf8');
const cached = new Set([...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]));

const start = [...html.matchAll(/(?:src|href)="\/?(assets\/[^"]+\.(?:js|css))"/g)].map((m) => m[1]);
const seen = new Set();
const queue = [...start];
while (queue.length) {
  const file = queue.shift();
  if (seen.has(file)) continue;
  seen.add(file);
  if (!file.endsWith('.js')) continue;
  const code = readFileSync(join(dir, file), 'utf8');
  // Static imports only (import ... from "./x.js" and import "./x.js"); dynamic import() is allowed to be optional.
  for (const m of code.matchAll(/(?:^|[;}\s])import(?:[^"'()]*?from)?\s*["'](\.\/[^"']+\.js)["']/g)) queue.push(`assets/${m[1].slice(2)}`);
}

const missing = [...seen].filter((f) => !cached.has(f));
if (missing.length) {
  console.error(`Offline check failed: needed at start-up but not cached for offline use:\n  ${missing.join('\n  ')}`);
  process.exit(1);
}
console.log(`Offline check: ${seen.size} start-up files, all cached.`);

// A new version must take over without waiting for every tab to close (phones
// rarely close one); otherwise old app code can run for days. See src/client/lib/update.ts.
const swCode = readFileSync(join(dir, 'sw.js'), 'utf8');
if (!/self\.skipWaiting\(\),\s*\w+\.clientsClaim\(\)/.test(swCode)) {
  console.error('Update check failed: sw.js does not skip waiting and claim clients on install.');
  process.exit(1);
}
console.log('Update check: new versions take over at once.');
