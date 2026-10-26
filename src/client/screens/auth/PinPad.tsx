import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, type Role } from '../../../shared/permissions';
import { useT } from '../../lib/i18n';
import { fieldPin, nextPin, pastedPin, pinAction, type PinAction } from '../../lib/pin-keys';
import { useHoldReload } from '../../lib/update';

/** Typing into a real field (a name, a note, a search) must never feed the code. */
function typingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/** A phone or tablet: the big on-screen keypad is the way in, so the code field never opens the phone's own keyboard. */
function touchFirst(): boolean {
  try {
    return matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/**
 * Code entry, by tapping the numbers or typing on a keyboard (see pin-keys.ts).
 *
 * The code lives in a real field laid over the dots: on a computer it has the
 * focus as soon as the screen opens (with a visible ring), so the laptop's own
 * keys — number row or numeric keypad — type into it, and clicking a keypad
 * button keeps the focus there. On a phone the field asks for no keyboard
 * (`inputMode="none"`), so the on-screen keypad is the only way in and no digit
 * arrives twice. Keys pressed while the focus is somewhere neutral (the page,
 * a button) still reach the code; keys typed into another field never do.
 *
 * When the role is known (a saved profile), the dots and hint show that role's
 * minimum. When it is not known yet (someone typing their name on a new
 * device), we show the general rule and name the owner/manager range. A dashed
 * circle after the minimum shows more digits are allowed, which is why the
 * code is never sent by itself at six digits: Enter (or the Enter button)
 * sends it, so seven- and eight-digit codes still work.
 */
export function PinPad({
  onSubmit,
  busy,
  error,
  keepOnError,
  role,
  onCancel,
}: {
  onSubmit: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
  /** The error was not about the code (no connection, server unreachable): keep the digits so Enter can try again. */
  keepOnError?: boolean;
  role?: Role | null;
  /** Escape on an empty code: go back a step. */
  onCancel?: () => void;
}) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const [touch] = useState(touchFirst);
  const field = useRef<HTMLInputElement>(null);
  const minLength = role ? MIN_PIN_LENGTH[role] : MIN_PIN_LENGTH.worker;
  // The latest code and state for the key handler, and whether this code was
  // already sent: a held-down key, a double tap or Enter on a focused button
  // must never send the same sign-in twice.
  const pinRef = useRef('');
  const sent = useRef(false);
  const live = useRef({ busy, minLength, onSubmit, onCancel });
  live.current = { busy, minLength, onSubmit, onCancel };
  // A new version never reloads the page while digits are typed (lib/update.ts).
  useHoldReload(pin.length > 0);

  const update = useCallback((next: string) => {
    pinRef.current = next;
    sent.current = false;
    setPin(next);
  }, []);

  const focusField = useCallback(() => {
    if (!touch) field.current?.focus({ preventScroll: true });
  }, [touch]);

  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy]);

  // On a computer the keyboard types into the code at once.
  useEffect(focusField, [focusField]);

  useEffect(() => {
    if (error) {
      setShake(true);
      if (!keepOnError) update('');
      focusField();
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error, keepOnError, update, focusField]);

  // Nothing of the code stays in memory once the screen closes.
  useEffect(() => () => void (pinRef.current = ''), []);

  const act = useCallback(
    (a: PinAction) => {
      const { busy, minLength, onSubmit, onCancel } = live.current;
      if (a.kind === 'ignore') return;
      if (a.kind === 'submit') {
        if (busy || sent.current || pinRef.current.length < minLength) return;
        sent.current = true;
        onSubmit(pinRef.current);
      } else if (a.kind === 'cancel') {
        if (pinRef.current) update('');
        else onCancel?.();
      } else if (!busy) update(nextPin(pinRef.current, a));
    },
    [update],
  );

  // Keys and paste while the focus is not in any field (the page, a keypad button).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typingInField(e.target)) return;
      const a = pinAction(e);
      if (!a) return;
      // Handled here, so a focused keypad button does not also act on Enter.
      e.preventDefault();
      act(a);
      focusField();
    };
    const onPaste = (e: ClipboardEvent) => {
      if (typingInField(e.target) || live.current.busy) return;
      const text = e.clipboardData?.getData('text') ?? '';
      if (!/\d/.test(text)) return;
      e.preventDefault();
      update(pastedPin(pinRef.current, text));
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('paste', onPaste);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('paste', onPaste);
    };
  }, [act, update, focusField]);

  const press = (d: string) => act({ kind: 'digit', digit: d });
  // A click on a keypad button leaves the focus in the code, so the keyboard keeps working.
  const keepFocus = touch ? undefined : (e: MouseEvent) => e.preventDefault();
  const ready = pin.length >= minLength;
  // Dots: at least the role minimum, growing as the person types; a dashed
  // circle once the minimum is reached (and below the maximum) makes clear that
  // a longer code is accepted — six digits are never "too many".
  const base = Math.max(minLength, pin.length);
  const showOptional = ready && base < MAX_PIN_LENGTH;
  const slots = base + (showOptional ? 1 : 0);
  return (
    <div className="pin-entry stack">
      <div className="pin-display">
        <div className={`pin-dots ${shake ? 'shake' : ''}`} role="status" aria-live="polite" aria-label={t('pin.digits', { n: pin.length })}>
          {Array.from({ length: slots }, (_, i) => (
            <span key={i} className={i < pin.length ? 'on' : showOptional && i === slots - 1 ? 'opt' : ''} />
          ))}
        </div>
        <input
          ref={field}
          className="pin-field"
          type="text"
          inputMode={touch ? 'none' : 'numeric'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          enterKeyHint="go"
          aria-label={t('pin.field')}
          value={pin}
          readOnly={busy}
          onKeyDown={(e) => {
            const a = pinAction(e.nativeEvent);
            if (!a) return;
            e.preventDefault();
            act(a);
          }}
          // A phone keyboard, paste or autofill: whatever arrives, only its digits count.
          onChange={(e) => {
            if (!busy) update(fieldPin(e.target.value));
          }}
        />
      </div>
      <p className="hint pin-hint">
        {role ? t('pin.lenHint', { min: minLength, max: MAX_PIN_LENGTH }) : t('pin.lenAny', { w: MIN_PIN_LENGTH.worker, o: MIN_PIN_LENGTH.owner, max: MAX_PIN_LENGTH })}
      </p>
      {error && (
        <div className="error-box" role="alert" style={{ textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div className="pinpad" role="group" aria-label={t('pin.keypad')}>
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onMouseDown={keepFocus} onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button type="button" className="fn" onMouseDown={keepFocus} onClick={() => act({ kind: 'back' })} disabled={busy || !pin} aria-label={t('pin.deleteLast')}>
          {t('pin.delete')}
        </button>
        <button type="button" onMouseDown={keepFocus} onClick={() => press('0')} disabled={busy}>
          0
        </button>
        <button type="button" className={`fn pin-enter${ready ? ' ready' : ''}`} onMouseDown={keepFocus} disabled={busy || !ready} onClick={() => act({ kind: 'submit' })}>
          {busy ? '…' : t('pin.enter')}
        </button>
      </div>
      <p className="hint pin-kbd">{t('pin.keyboardHint')}</p>
    </div>
  );
}
