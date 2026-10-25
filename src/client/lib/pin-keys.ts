// What a key press means on the code (PIN) screen. Kept apart from the
// component so the rules are tested on their own (tests/pin-keys.test.ts).
//
//   0–9 on the number row or the numeric keypad (NumLock on or off) → a digit
//   Backspace → remove the last digit      Delete → clear the whole code
//   Enter (either Enter key) → sign in, once, when the code is long enough
//   Escape → clear the code; if it is already empty, go back
//
// The number row counts by the key's place, not the character it types: on a
// French (AZERTY) keyboard those keys type & é " ' ( - è _ ç à without Shift.
// Shortcuts with Ctrl, Alt or ⌘ are left to the browser, and a held-down Enter
// does not send the code again.

import { MAX_PIN_LENGTH } from '../../shared/permissions';

export interface PinKeyEvent {
  key: string;
  code?: string;
  repeat?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type PinAction = { kind: 'digit'; digit: string } | { kind: 'back' } | { kind: 'clear' } | { kind: 'submit' } | { kind: 'cancel' };

export function pinAction(e: PinKeyEvent): PinAction | null {
  if (e.ctrlKey || e.metaKey || e.altKey) return null;
  // The key's place: the number row on any layout (AZERTY included), and the
  // keypad with NumLock off, where the key reads Insert/End/… but the code still names the digit.
  const place = /^(?:Digit|Numpad)(\d)$/.exec(e.code ?? '');
  if (place) return { kind: 'digit', digit: place[1]! };
  if (/^\d$/.test(e.key)) return { kind: 'digit', digit: e.key };
  switch (e.key) {
    case 'Backspace':
      return { kind: 'back' };
    case 'Delete':
      return { kind: 'clear' };
    case 'Enter':
      return e.repeat ? null : { kind: 'submit' };
    case 'Escape':
      return { kind: 'cancel' };
    default:
      return null;
  }
}

/** The code after a digit, Backspace or Delete. Submit and cancel are the screen's business. */
export function nextPin(pin: string, a: PinAction): string {
  switch (a.kind) {
    case 'digit':
      return pin.length < MAX_PIN_LENGTH ? pin + a.digit : pin;
    case 'back':
      return pin.slice(0, -1);
    case 'clear':
      return '';
    default:
      return pin;
  }
}

/** Digits from pasted text (a password manager, or a code copied from a note), up to the maximum length. */
export function pastedPin(pin: string, text: string): string {
  return (pin + text.replace(/\D/g, '')).slice(0, MAX_PIN_LENGTH);
}
