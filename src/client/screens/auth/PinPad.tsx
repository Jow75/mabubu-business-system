import { useEffect, useState } from 'react';
import { useT } from '../../lib/i18n';

export function PinPad({ onSubmit, busy, error, minLength = 4 }: { onSubmit: (pin: string) => void; busy?: boolean; error?: string | null; minLength?: number }) {
  const t = useT();
  const [pin, setPin] = useState('');
  const [shake, setShake] = useState(false);

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
      if (/^\d$/.test(e.key)) setPin((p) => (p.length < 8 ? p + e.key : p));
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter' && pin.length >= minLength) onSubmit(pin);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pin, busy, minLength, onSubmit]);

  const press = (d: string) => !busy && setPin((p) => (p.length < 8 ? p + d : p));
  const slots = Math.max(minLength, pin.length);
  return (
    <div className="stack" style={{ gap: 18 }}>
      <div className={`pin-dots ${shake ? 'shake' : ''}`} aria-label={t('pin.digits', { n: pin.length })}>
        {Array.from({ length: slots }, (_, i) => (
          <span key={i} className={i < pin.length ? 'on' : ''} />
        ))}
      </div>
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
          style={{ background: pin.length >= minLength ? 'var(--indigo)' : undefined, color: pin.length >= minLength ? 'var(--on-indigo)' : undefined, borderRadius: 16 }}
          disabled={busy || pin.length < minLength}
          onClick={() => onSubmit(pin)}
        >
          {busy ? '…' : t('pin.enter')}
        </button>
      </div>
    </div>
  );
}
