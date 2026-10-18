import { randomToken, uuidv7 } from '../../shared/ids';
import { deviceDb, type DeviceRecord } from './db';
import { base64url } from '../../shared/ids';

function guessLabel(): string {
  const ua = navigator.userAgent;
  const android = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/.exec(ua);
  if (android?.[1]) return `${android[1].trim()} (Android)`;
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua)) return 'iPad';
  if (/Windows/.test(ua)) return 'Windows computer';
  if (/Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux computer';
  return 'This device';
}

/** This device's identity, created once and kept in IndexedDB. */
export async function getDevice(): Promise<DeviceRecord> {
  const existing = await deviceDb.kv.get('device');
  if (existing) return existing;
  const rec: DeviceRecord = {
    key: 'device',
    deviceId: uuidv7(),
    deviceSecret: randomToken(32),
    label: guessLabel(),
    createdAt: new Date().toISOString(),
  };
  await deviceDb.kv.put(rec);
  return rec;
}

/* ------------------------------------------------------------------ */
/* Offline unlock: PBKDF2 check of the access code                      */
/* ------------------------------------------------------------------ */

const ITERATIONS = 310_000;

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations }, key, 256);
  return base64url(new Uint8Array(bits));
}

function fromB64(s: string): Uint8Array {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

export async function makeVerifier(pin: string) {
  const salt = new Uint8Array(16);
  crypto.getRandomValues(salt);
  return { salt: base64url(salt), hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS };
}

export async function checkVerifier(pin: string, v: { salt: string; hash: string; iterations: number }): Promise<boolean> {
  const h = await derive(pin, fromB64(v.salt), v.iterations);
  let diff = h.length ^ v.hash.length;
  for (let i = 0; i < Math.max(h.length, v.hash.length); i++) diff |= (h.charCodeAt(i) || 0) ^ (v.hash.charCodeAt(i) || 0);
  return diff === 0;
}
