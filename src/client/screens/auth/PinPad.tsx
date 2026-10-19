import { useEffect, useState } from 'react';
import { MAX_PIN_LENGTH, MIN_PIN_LENGTH, type Role } from '../../../shared/permissions';
import { useT } from '../../lib/i18n';

/**
 * Code entry. When the role is known (a saved profile), the dots and hint show
 * that role's minimum. When it is not known yet (someone typing their name on a
 * new device), we show the general rule and name the owner/manager range, so an
 * owner is never left thinking a 6-digit code is rejected because four circles
 * appeared. A dashed circle after the minimum shows more digits are allowed.
 */
export function PinPad({ onSubmit, busy, error, role }: { onSubmit: (pin: string) => void; busy?: boolean; error?: string | null; role?: Role | null }) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);
  const minLength = role ? MIN_PIN_LENGTH[role] : MIN_PIN_LENGTH.worker;

  useEffect(() => {
    if (error) {
      setShake(true);
      setPin('');
      const t = setTimeout(() => setShake(false), 400);
      return () => clearTimeout(t);
    }
  }, [error]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (busy) return;
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < MAX_PIN_LENGTH ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= minLength) onSubmit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, busy, minLength, onSubmit]);

  const press = (d: string) => !busy && setPin((p) => (p.length < MAX_PIN_LENGTH ? p + d : p));
  const ready = pin.length >= minLength;
  // Dots: at least the role minimum, growing as the person types; a dashed
  // circle once the minimum is reached (and below the maximum) makes clear that
  // a longer code is accepted — six digits are never "too many".
  const base = Math.max(minLength, pin.length);
  const showOptional = ready && base < MAX_PIN_LENGTH;
  const slots = base + (showOptional ? 1 : 0);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-label={t('pin.digits', { n: pin.length })}>
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : showOptional && i === slots - 1 ? 'opt' : ''} />
        ))}
      </div>
      <p className="hint" style={{ textAlign: 'center', marginTop: -6 }}>
        {role ? t('pin.lenHint', { min: minLength, max: MAX_PIN_LENGTH }) : t('pin.lenAny', { w: MIN_PIN_LENGTH.worker, o: MIN_PIN_LENGTH.owner, max: MAX_PIN_LENGTH })}
      </p>
      {error && (
        <div className="error-box" role="alert" style={{ textAlign: 'center' }}>
          {error}
        </div>
      )}
      <div className="pinpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button key={d} type="button" onClick={() => press(d)}>
            {d}
          </button>
        ))}
        <button type="button" className="fn" onClick={() => setPin((p) => p.slice(0, -1))} aria-label={t('pin.deleteLast')}>
          {t('pin.delete')}
        </button>
        <button type="button" onClick={() => press('0')}>
          0
        </button>
        <button
          type="button"
          className="fn"
          style={{ background: ready ? 'var(--indigo)' : undefined, color: ready ? 'var(--on-indigo)' : undefined, borderRadius: 16 }}
          disabled={busy || !ready}
          onClick={() => onSubmit(pin)}
        >
          {busy ? '…' : t('pin.enter')}
        </button>
      </div>
    </div>
  );
}
