// This device's identity (src/client/lib/device.ts) must be made once and then
// reused: a reload, a restart, a second tab or two calls at the same moment must
// never make a second identity — each one would become another "Windows
// computer" row waiting for approval in People & devices.

import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it, vi } from 'vitest';

type DeviceModule = typeof import('../src/client/lib/device');
type DbModule = typeof import('../src/client/lib/db');

/** A fresh copy of the modules = a new page (reload, restart or another tab) on the same browser storage. */
async function page(): Promise<{ device: DeviceModule; db: DbModule }> {
  vi.resetModules();
  const db = await import('../src/client/lib/db');
  const device = await import('../src/client/lib/device');
  return { device, db };
}

async function wipe() {
  const { db } = await page();
  await db.deviceDb.delete();
}

afterEach(async () => {
  vi.restoreAllMocks();
  await wipe();
});

describe('device identity', () => {
  it('two calls at the same moment in one page get the same identity, stored once', async () => {
    const { device, db } = await page();
    const ids = await Promise.all([device.getDevice(), device.getDevice(), device.getDevice()]);
    expect(new Set(ids.map((d) => d.deviceId)).size).toBe(1);
    expect(await db.deviceDb.kv.count()).toBe(1);
  });

  it('a reload or restart reuses the stored identity (same id and secret)', async () => {
    const first = await (await page()).device.getDevice();
    const again = await (await page()).device.getDevice();
    expect(again.deviceId).toBe(first.deviceId);
    expect(again.deviceSecret).toBe(first.deviceSecret);
  });

  it('two tabs opening together on empty storage end up with one identity', async () => {
    const tabA = await page();
    const tabB = await page();
    const [a, b] = await Promise.all([tabA.device.getDevice(), tabB.device.getDevice()]);
    expect(a.deviceId).toBe(b.deviceId);
    const stored = await tabA.db.deviceDb.kv.get('device');
    expect(stored?.deviceId).toBe(a.deviceId);
  });

  it('an identity written by another tab between read and write is adopted, never overwritten', async () => {
    const { device, db } = await page();
    const other = { key: 'device' as const, deviceId: 'other-tab-device-0001', deviceSecret: 'x'.repeat(43), label: 'Windows computer', createdAt: new Date().toISOString() };
    const realGet = db.deviceDb.kv.get.bind(db.deviceDb.kv);
    let first = true;
    vi.spyOn(db.deviceDb.kv, 'get').mockImplementation(((key: string) => {
      if (first) {
        first = false;
        // Our first read sees nothing; meanwhile the other tab stores its identity.
        return db.deviceDb.kv.add(other).then(() => undefined);
      }
      return realGet(key);
    }) as typeof db.deviceDb.kv.get);
    const got = await device.getDevice();
    expect(got.deviceId).toBe(other.deviceId);
    expect((await realGet('device'))?.deviceId).toBe(other.deviceId);
  });

  it('a failed read is reported, and no new identity replaces one that may still exist', async () => {
    const existing = await (await page()).device.getDevice();
    const { device, db } = await page();
    vi.spyOn(db.deviceDb.kv, 'get').mockRejectedValueOnce(new Error('UnknownError: storage read failed'));
    const add = vi.spyOn(db.deviceDb.kv, 'add');
    await expect(device.getDevice()).rejects.toThrow(/storage read failed/);
    expect(add).not.toHaveBeenCalled();
    // The next (working) read still finds the original identity.
    expect((await device.getDevice()).deviceId).toBe(existing.deviceId);
  });
});
