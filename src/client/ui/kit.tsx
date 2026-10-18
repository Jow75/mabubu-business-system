import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatLocalCount, formatMoney, parseMoney, type Currency, CURRENCIES } from '../../shared/money';
import type { GarmentType } from '../../shared/model';
import { store, useApp } from '../lib/store';
import { personColor } from '../lib/labels';
import { Icon, type IconName } from './Icon';

/* ---------------- Money ---------------- */

/** Shows an amount; for KMF it follows the KMF ⇄ local-count switch. */
export function Money({ amount, currency, signed, strong }: { amount: number; currency: string; signed?: boolean; strong?: boolean }) {
  const { prefs, ledger } = useApp();
  const cur = currency as Currency;
  const label = (ledger.get('settings:app') as { localCountLabel?: string } | undefined)?.localCountLabel ?? 'local count';
  if (cur === 'KMF' && prefs.localCount) {
    const sign = amount < 0 ? '−' : signed && amount > 0 ? '+' : '';
    return (
      <span className="money-main" title={formatMoney('KMF', amount)}>
        <span style={strong ? { fontWeight: 700 } : undefined}>
          {sign}
          {formatLocalCount(Math.abs(amount))}
        </span>{' '}
        <span className="local">{label}</span>
      </span>
    );
  }
  return (
    <span className="money-main" style={strong ? { fontWeight: 700 } : undefined}>
      {formatMoney(cur, amount, { signed })}
    </span>
  );
}

export function LocalCountToggle() {
  const { prefs } = useApp();
  return (
    <div className="seg" role="group" aria-label="How to show Comorian francs">
      <button type="button" aria-pressed={!prefs.localCount} onClick={() => store.setPrefs({ localCount: false })}>
        KMF
      </button>
      <button type="button" aria-pressed={prefs.localCount} onClick={() => store.setPrefs({ localCount: true })}>
        Local ÷5
      </button>
    </div>
  );
}

/** Money input in minor units. Always official currency; KMF shows the local count beside it. */
export function MoneyInput({
  value,
  onChange,
  currency,
  big,
  id,
  placeholder,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  currency: Currency;
  big?: boolean;
  id?: string;
  placeholder?: string;
}) {
  const exp = CURRENCIES[currency].exp;
  const toText = (v: number | null) => (v === null ? '' : exp ? String(v / 10 ** exp) : String(v));
  const [text, setText] = useState(toText(value));
  const last = useRef(value);
  useEffect(() => {
    if (value !== last.current) {
      setText(toText(value));
      last.current = value;
    }
  });
  const parsed = parseMoney(currency, text);
  return (
    <div className="stack-sm">
      <div style={{ position: 'relative' }}>
        <input
          id={id}
          className={`input ${big ? 'big' : ''}`}
          inputMode={exp ? 'decimal' : 'numeric'}
          value={text}
          placeholder={placeholder ?? '0'}
          onChange={(e) => {
            setText(e.target.value);
            const v = parseMoney(currency, e.target.value);
            last.current = v;
            onChange(v);
          }}
          style={{ paddingRight: 64 }}
        />
        <span className="muted" style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontWeight: 650, fontSize: 13 }}>
          {CURRENCIES[currency].prefix}
        </span>
      </div>
      {text !== '' && parsed === null && <span className="hint" style={{ color: 'var(--hibiscus)' }}>Not a valid amount</span>}
      {currency === 'KMF' && parsed !== null && parsed > 0 && (
        <span className="hint">
          = <span className="local">{formatLocalCount(parsed)} local</span> (shown only to help counting)
        </span>
      )}
    </div>
  );
}

/* ---------------- Quantities ---------------- */

export function Stepper({ value, onChange, max, big, label }: { value: number; onChange: (v: number) => void; max?: number; big?: boolean; label?: string }) {
  const clamp = (v: number) => Math.max(0, Math.min(max ?? 1_000_000, Math.floor(v || 0)));
  return (
    <div className={`stepper ${big ? 'big' : ''}`}>
      <button type="button" aria-label={`Less${label ? ` ${label}` : ''}`} onClick={() => onChange(clamp(value - 1))}>
        −
      </button>
      <input
        inputMode="numeric"
        aria-label={label ?? 'Quantity'}
        value={value === 0 ? '' : String(value)}
        placeholder="0"
        onChange={(e) => onChange(clamp(Number(e.target.value.replace(/\D/g, ''))))}
        onFocus={(e) => e.target.select()}
      />
      <button type="button" aria-label={`More${label ? ` ${label}` : ''}`} onClick={() => onChange(clamp(value + 1))}>
        +
      </button>
    </div>
  );
}

export function Qty({ n, unit = 'pcs' }: { n: number; unit?: string }) {
  return (
    <span className={`num ${n === 0 ? 'zero' : ''}`}>
      {n.toLocaleString('en-US')}
      {unit ? <span className="muted"> {unit}</span> : null}
    </span>
  );
}

export function GarmentLabel({ g, showName = true, stacked }: { g: GarmentType | undefined; showName?: boolean; stacked?: boolean }) {
  if (!g) return <span className="muted">Unknown garment</span>;
  if (stacked)
    return (
      <span className="stack-sm" style={{ gap: 2, minWidth: 0 }}>
        <span className="gt">
          <span className="swatch" style={{ background: g.swatch }} />
          <span className="gt-code">{g.code}</span>
        </span>
        <span style={{ fontWeight: 600, lineHeight: 1.25 }}>{g.name}</span>
      </span>
    );
  return (
    <span className="gt">
      <span className="swatch" style={{ background: g.swatch }} />
      <span className="gt-code">{g.code}</span>
      {showName && <span className="gt-name">{g.name}</span>}
    </span>
  );
}

/* ---------------- Layout bits ---------------- */

export function PageHead({ title, lead, eyebrow, actions }: { title: ReactNode; lead?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        {eyebrow && <div className="eyebrow" style={{ marginBottom: 6 }}>{eyebrow}</div>}
        <h1 className="page-title">{title}</h1>
        {lead && <div className="lead">{lead}</div>}
      </div>
      {actions && <div className="head-actions">{actions}</div>}
    </div>
  );
}

export function Empty({ icon = 'box', title, children }: { icon?: IconName; title: string; children?: ReactNode }) {
  return (
    <div className="empty">
      <Icon name={icon} size={36} />
      <strong>{title}</strong>
      {children && <div style={{ maxWidth: '46ch' }}>{children}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'saffron' | 'lagoon' | 'red' | 'green' }) {
  const color = tone === 'red' ? 'var(--hibiscus)' : tone === 'green' ? 'var(--mangrove)' : tone === 'lagoon' ? 'var(--lagoon)' : tone === 'saffron' ? 'var(--saffron-ink)' : undefined;
  return (
    <div className="card stat">
      <span className="eyebrow">{label}</span>
      <span className="stat-value" style={color ? { color } : undefined}>
        {value}
      </span>
      {sub && <span className="stat-sub">{sub}</span>}
    </div>
  );
}

export function Monogram({ name, id, small }: { name: string; id: string; small?: boolean }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className={`monogram ${small ? 'sm' : ''}`} style={{ background: personColor(id) }} aria-hidden="true">
      {initials}
    </span>
  );
}

export function Field({ label, hint, children, htmlFor }: { label: string; hint?: ReactNode; children: ReactNode; htmlFor?: string }) {
  return (
    <div className="field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </div>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; label?: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ---------------- Sheet ---------------- */

export function Sheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);
  return createPortal(
    <>
      <div className="scrim" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined}>
        <div className="sheet-head">
          <h2 className="section-title" style={{ fontSize: 17 }}>
            {title}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <Icon name="x" />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>,
    document.body,
  );
}

/* ---------------- Toasts ---------------- */

type ToastItem = { id: number; text: string; kind: 'ok' | 'error' };
let toastListeners: ((t: ToastItem[]) => void)[] = [];
let toasts: ToastItem[] = [];
let toastId = 0;

export function toast(text: string, kind: 'ok' | 'error' = 'ok') {
  const t = { id: ++toastId, text, kind };
  toasts = [...toasts, t];
  toastListeners.forEach((l) => l(toasts));
  setTimeout(
    () => {
      toasts = toasts.filter((x) => x.id !== t.id);
      toastListeners.forEach((l) => l(toasts));
    },
    kind === 'error' ? 6000 : 3200,
  );
}

export function Toasts() {
  const [items, setItems] = useState<ToastItem[]>([]);
  useEffect(() => {
    toastListeners.push(setItems);
    return () => {
      toastListeners = toastListeners.filter((l) => l !== setItems);
    };
  }, []);
  return (
    <div className="toasts" role="status" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'error' : ''}`}>
          <Icon name={t.kind === 'error' ? 'alert' : 'check'} />
          <span>{t.text}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Sync badge ---------------- */

export function SyncBadge({ onClick }: { onClick?: () => void }) {
  const { sync, demo } = useApp();
  let cls = 'ok';
  let text = 'Synced';
  if (demo) {
    cls = 'pending';
    text = 'Demo — this device only';
  } else if (sync.state === 'syncing') {
    cls = 'busy';
    text = 'Syncing…';
  } else if (sync.rejected > 0) {
    cls = 'bad';
    text = `${sync.rejected} need attention`;
  } else if (sync.state === 'offline') {
    cls = sync.pending ? 'pending' : 'off';
    text = sync.pending ? `Offline · ${sync.pending} saved on this device` : 'Offline';
  } else if (sync.pending > 0) {
    cls = 'pending';
    text = `${sync.pending} waiting to sync`;
  } else if (sync.state === 'error') {
    cls = 'bad';
    text = 'Sync problem';
  }
  return (
    <button type="button" className={`sync ${cls}`} onClick={onClick} title={sync.lastError ?? undefined}>
      <span className="dot" />
      {text}
    </button>
  );
}

/** Submit helper: runs a store submission and shows a toast. */
export async function save(fn: () => Promise<{ ok: boolean; error?: string }>, okText: string): Promise<boolean> {
  const r = await fn();
  if (r.ok) {
    toast(okText);
    return true;
  }
  toast(r.error ?? 'Could not save.', 'error');
  return false;
}
