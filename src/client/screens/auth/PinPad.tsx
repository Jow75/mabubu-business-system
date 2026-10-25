import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, type Role } from '../../../shared/permissions';
import { useT } from '../../lib/i18n';
import { nextPin, pastedPin, pinAction, type PinAction } from '../../lib/pin-keys';

/** Typing into a real field (a name, a note, a search) must never feed the code. */
function typingInField(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el || typeof el.closest !== 'function') return false;
  return Boolean(el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]'));
}

/**
 * Code entry, by tapping the numbers or typing on a keyboard (see pin-keys.ts).
 * When the role is known (a saved profile), the dots and hint show that role's
 * minimum. When it is not known yet (someone typing their name on a new
 * device), we show the general rule and name the owner/manager range, so an
 * owner is never left thinking a 6-digit code is rejected because four circles
 * appeared. A dashed circle after the minimum shows more digits are allowed,
 * which is why the code is never sent by itself at six digits: Enter (or the
 * Enter button) sends it, so seven- and eight-digit codes still work.
 */
export function PinPad({
  onSubmit,
  busy,
  error,
  role,
  onCancel,
}: {
  onSubmit: (pin: string) => void;
  busy?: boolean;
  error?: string | null;
  role?: Role | null;
  /** Escape on an empty code: go back a step. */
  onCancel?: () => void;
}) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const minLength = role ? MIN_PIN_LENGTH[role] : MIN_PIN_LENGTH.worker;
  // The latest code and state for the key handler, and whether this code was
  // already sent: a held-down key, a double tap or Enter on a focused button
  // must never send the same sign-in twice.
  const pinRef = useRef('');
  const sent = useRef(false);
  const live = useRef({ busy, minLength, onSubmit, onCancel });
  live.current = { busy, minLength, onSubmit, onCancel };

  const update = useCallback((next: string) => {
    pinRef.current = next;
    sent.current = false;
    setPin(next);
  }, []);

  useEffect(() => {
    if (!busy) sent.current = false;
  }, [busy]);

  useEffect(() => {
    if (error) {
      setShake(true);
      update('');
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error, update]);

  // Nothing of the code stays in memory once the screen closes.
  useEffect(() => () => void (pinRef.current = ''), []);

  const act = useCallback(
    (a: PinAction) => {
      const { busy, minLength, onSubmit, onCancel } = live.current;
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

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || typingInField(e.target)) return;
      const a = pinAction(e);
      if (!a) return;
      // Handled here, so a focused keypad button does not also act on Enter.
      e.preventDefault();
      act(a);
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
  }, [act, update]);

  const press = (d: string) => act({ kind: 'digit', digit: d });
  const ready = pin.length >= minLength;
  // Dots: at least the role minimum, growing as the person types; a dashed
  // circle once the minimum is reached (and below the maximum) makes clear that
  // a longer code is accepted — six digits are never "too many".
  const base = Math.max(minLength, pin.length);
  const showOptional = ready && base < MAX_PIN_LENGTH;
  const slots = base + (showOptional ? 1 : 0);
  return (
    <div className="pin-entry stack">
      <div className={`pin-dots ${shake ? 'shake' : ''}`} role="status" aria-live="polite" aria-label={t('pin.digits', { n: pin.length })}>
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : showOptional && i === slots - 1 ? 'opt' : ''} />
        ))}
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
          <button key={d} type="button" onClick={() => press(d)} disabled={busy}>
            {d}
          </button>
        ))}
        <button type="button" className="fn" onClick={() => act({ kind: 'back' })} disabled={busy || !pin} aria-label={t('pin.deleteLast')}>
          {t('pin.delete')}
        </button>
        <button type="button" onClick={() => press('0')} disabled={busy}>
          0
        </button>
        <button type="button" className={`fn pin-enter${ready ? ' ready' : ''}`} disabled={busy || !ready} onClick={() => act({ kind: 'submit' })}>
          {busy ? '…' : t('pin.enter')}
        </button>
      </div>
      <p className="hint pin-kbd">{t('pin.keyboardHint')}</p>
    </div>
  );
}
