// Keyboard entry on the code screen (src/client/lib/pin-keys.ts): the owner can
// type 456789 and press Enter instead of clicking each digit.

import { describe, expect, it } from 'vitest';
import { nextPin, pastedPin, pinAction, type PinKeyEvent } from '../src/client/lib/pin-keys';
import { MAX_PIN_LENGTH } from '../src/shared/permissions';

const type = (keys: PinKeyEvent[], start = '') => keys.reduce((pin, k) => {
  const a = pinAction(k);
  return a ? nextPin(pin, a) : pin;
}, start);
const row = (s: string) => [...s].map((d) => ({ key: d, code: `Digit${d}` }));

describe('PIN keyboard entry', () => {
  it('number-row digits build the code', () => {
    expect(type(row('456789'))).toBe('456789');
  });

  it('numeric keypad digits work with NumLock on and off', () => {
    expect(type([{ key: '4', code: 'Numpad4' }, { key: '5', code: 'Numpad5' }])).toBe('45');
    // NumLock off: the keypad sends navigation keys, but its code still names the digit.
    expect(type([{ key: 'ArrowLeft', code: 'Numpad4' }, { key: 'Clear', code: 'Numpad5' }, { key: 'Insert', code: 'Numpad0' }])).toBe('450');
  });

  it('Backspace removes the last digit; Delete clears the whole code', () => {
    expect(type([...row('4567'), { key: 'Backspace', code: 'Backspace' }])).toBe('456');
    expect(type([...row('4567'), { key: 'Delete', code: 'Delete' }])).toBe('');
    expect(type([{ key: 'Backspace' }])).toBe('');
  });

  it('never goes past the longest allowed code', () => {
    expect(type(row('1234567890'))).toBe('12345678');
    expect(type(row('1234567890')).length).toBe(MAX_PIN_LENGTH);
  });

  it('Enter (main or keypad) asks to sign in once; a held-down Enter does not repeat', () => {
    expect(pinAction({ key: 'Enter', code: 'Enter' })).toEqual({ kind: 'submit' });
    expect(pinAction({ key: 'Enter', code: 'NumpadEnter' })).toEqual({ kind: 'submit' });
    expect(pinAction({ key: 'Enter', code: 'Enter', repeat: true })).toBeNull();
  });

  it('Escape means cancel (the screen clears the code, or goes back when it is empty)', () => {
    expect(pinAction({ key: 'Escape' })).toEqual({ kind: 'cancel' });
  });

  it('browser shortcuts and other keys are left alone', () => {
    expect(pinAction({ key: '5', ctrlKey: true })).toBeNull();
    expect(pinAction({ key: 'r', metaKey: true })).toBeNull();
    expect(pinAction({ key: '1', altKey: true })).toBeNull();
    expect(pinAction({ key: 'a' })).toBeNull();
    expect(pinAction({ key: 'Tab' })).toBeNull();
    expect(pinAction({ key: ' ' })).toBeNull();
  });

  it('switching between the on-screen keys and the keyboard edits the same code', () => {
    // On-screen taps go through the same nextPin as keys.
    let pin = nextPin('', { kind: 'digit', digit: '4' });
    pin = type(row('56'), pin);
    pin = nextPin(pin, { kind: 'back' });
    pin = type(row('6789'), pin);
    expect(pin).toBe('456789');
  });

  it('pasting keeps only digits, up to the maximum', () => {
    expect(pastedPin('', ' 456-789 ')).toBe('456789');
    expect(pastedPin('12', '3456789999')).toBe('12345678');
  });
});
