import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { store, useApp } from '../../lib/store';
import { ApiError } from '../../lib/api';
import type { Profile } from '../../lib/db';
import { DEMO_USERS } from '../../../shared/demo-data';
import { MIN_PIN_LENGTH } from '../../../shared/permissions';
import { ROLE_LABEL } from '../../lib/labels';
import { DeraMark, Icon } from '../../ui/Icon';
import { Monogram } from '../../ui/kit';
import { PinPad } from './PinPad';

export function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="brand" style={{ padding: 0 }}>
          <DeraMark size={38} />
          <span className="brand-word">mabubu</span>
        </div>
        <RouteArt />
        <div className="stack" style={{ position: 'relative', gap: 14 }}>
          <h1>Every dera, from Mombasa to Ngazidja.</h1>
          <p>Purchases, shipments, the day’s sales and the cash — recorded where it happens, even without internet, and seen by the family wherever they are.</p>
        </div>
      </aside>
      <main className="auth-panel">{children}</main>
    </div>
  );
}

/** The trade route drawn as a stitched line: Mombasa → Dar es Salaam → Moroni. */
function RouteArt() {
  return (
    <svg className="route-line" viewBox="0 0 600 420" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <path d="M440 90 C 410 170, 370 200, 320 230 S 200 310, 150 360" fill="none" stroke="#e0a13a" strokeWidth="2.5" strokeDasharray="9 7" opacity="0.85" />
      {[
        [440, 90, 'Mombasa'],
        [320, 230, 'Dar es Salaam'],
        [150, 360, 'Moroni'],
      ].map(([x, y, n]) => (
        <g key={n as string} transform={`translate(${x} ${y})`}>
          <circle r="7" fill="#232c6b" stroke="#fbf8f2" strokeWidth="2.5" />
          <text x="16" y="5" fill="#fbf8f2" opacity="0.75" fontSize="15" fontFamily="var(--font-ui)" fontWeight="600">
            {n}
          </text>
        </g>
      ))}
    </svg>
  );
}

type Mode = { kind: 'list' } | { kind: 'pin'; profile: Profile } | { kind: 'other' } | { kind: 'pending'; name: string; pin: string; code: string } | { kind: 'demo' };

export function Welcome() {
  const { profiles, online } = useApp();
  const real = profiles.filter((p) => !p.demo);
  const [mode, setMode] = useState<Mode>(real.length ? { kind: 'list' } : { kind: 'other' });

  return (
    <AuthLayout>
      {mode.kind === 'list' && (
        <div className="stack" style={{ gap: 20 }}>
          <div>
            <div className="eyebrow">Karibu</div>
            <h2 className="page-title" style={{ marginTop: 6 }}>
              Who is working?
            </h2>
          </div>
          <div className="profiles">
            {real.map((p) => (
              <button key={p.userId} className="profile" onClick={() => setMode({ kind: 'pin', profile: p })}>
                <Monogram name={p.name} id={p.userId} />
                <strong>{p.name}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {ROLE_LABEL[p.role]}
                </span>
                {p.needsOnline && <span className="pill saffron">Sign in online</span>}
              </button>
            ))}
            <button className="profile" onClick={() => setMode({ kind: 'other' })}>
              <span className="monogram" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>
                <Icon name="plus" size={22} />
              </span>
              <strong>Someone else</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                First time here
              </span>
            </button>
          </div>
          <FooterLinks online={online} onDemo={() => setMode({ kind: 'demo' })} />
        </div>
      )}
      {mode.kind === 'pin' && <PinStep profile={mode.profile} onBack={() => setMode({ kind: 'list' })} onPending={(name, pin, code) => setMode({ kind: 'pending', name, pin, code })} />}
      {mode.kind === 'other' && (
        <OtherStep
          onBack={real.length ? () => setMode({ kind: 'list' }) : null}
          onPending={(name, pin, code) => setMode({ kind: 'pending', name, pin, code })}
          onDemo={() => setMode({ kind: 'demo' })}
        />
      )}
      {mode.kind === 'pending' && <PendingStep {...mode} onBack={() => setMode(real.length ? { kind: 'list' } : { kind: 'other' })} />}
      {mode.kind === 'demo' && <DemoStep onBack={() => setMode(real.length ? { kind: 'list' } : { kind: 'other' })} />}
    </AuthLayout>
  );
}

function FooterLinks({ online, onDemo }: { online: boolean; onDemo: () => void }) {
  return (
    <div className="row-between" style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDemo}>
        <Icon name="eye" size={17} /> Explore the demo
      </button>
      <span className="pill">
        <span className="dot" style={{ color: online ? 'var(--mangrove)' : 'var(--ink-3)' }} />
        {online ? 'Online' : 'Offline'}
      </span>
    </div>
  );
}

function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.offline) return 'No internet. Signing in on a new device needs a connection once.';
    if (e.body.attemptsLeft) return `${e.message} ${e.body.attemptsLeft} tries left before a short lock.`;
    return e.message;
  }
  return 'Something went wrong. Try again.';
}

function PinStep({ profile, onBack, onPending }: { profile: Profile; onBack: () => void; onPending: (name: string, pin: string, code: string) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await store.unlock(profile, pin);
        if (r?.status === 'pending') onPending(profile.name, pin, r.deviceCode);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [profile, onPending],
  );
  return (
    <div className="stack" style={{ gap: 20, alignItems: 'stretch' }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="left" size={17} /> Back
      </button>
      <div className="stack" style={{ alignItems: 'center', gap: 8 }}>
        <Monogram name={profile.name} id={profile.userId} />
        <h2 className="page-title">{profile.name}</h2>
        <span className="muted">{profile.needsOnline ? profile.needsOnline + ' Enter your code to sign in online.' : 'Enter your code'}</span>
      </div>
      <PinPad onSubmit={submit} busy={busy} error={error} minLength={4} />
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center' }} onClick={() => void store.removeProfile(profile.userId)}>
        Remove {profile.name} from this device
      </button>
    </div>
  );
}

function OtherStep({ onBack, onPending, onDemo }: { onBack: (() => void) | null; onPending: (name: string, pin: string, code: string) => void; onDemo: () => void }) {
  const { online } = useApp();
  const [name, setName] = useState('');
  const [stage, setStage] = useState<'name' | 'pin'>('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await store.signIn(name.trim(), pin);
        if (r.status === 'pending') onPending(name.trim(), pin, r.deviceCode);
      } catch (e) {
        setError(errorText(e));
      } finally {
        setBusy(false);
      }
    },
    [name, onPending],
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      {onBack && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={stage === 'pin' ? () => setStage('name') : onBack}>
          <Icon name="left" size={17} /> Back
        </button>
      )}
      {stage === 'name' ? (
        <form
          className="stack"
          style={{ gap: 18 }}
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) setStage('pin');
          }}
        >
          <div>
            <div className="eyebrow">Sign in</div>
            <h2 className="page-title" style={{ marginTop: 6 }}>
              What is your name?
            </h2>
            <p className="soft" style={{ marginTop: 8 }}>
              Use the name the owner gave your account. The first time on a new phone or laptop, the owner approves it once.
            </p>
          </div>
          <input className="input big" style={{ fontSize: 20 }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="username" />
          <button className="btn btn-primary btn-lg" disabled={!name.trim()}>
            Continue <Icon name="arrowRight" size={18} />
          </button>
          {!online && <div className="note-box">You are offline. A first sign-in on this device needs internet.</div>}
          <FooterLinks online={online} onDemo={onDemo} />
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => store.goTo('setup')}>
            <Icon name="key" size={17} /> First setup or owner recovery
          </button>
        </form>
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <h2 className="page-title">{name}</h2>
            <span className="muted">Enter your code</span>
          </div>
          <PinPad onSubmit={submit} busy={busy} error={error} />
        </div>
      )}
    </div>
  );
}

function PendingStep({ name, pin, code, onBack }: { name: string; pin: string; code: string; onBack: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const check = useCallback(async () => {
    try {
      const r = await store.signIn(name, pin);
      if (r.status === 'pending') setMsg('Still waiting for approval.');
    } catch (e) {
      setMsg(errorText(e));
    }
  }, [name, pin]);
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === 'visible') void check();
    }, 8000);
    return () => clearInterval(t);
  }, [check]);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="eyebrow">New device</div>
        <h2 className="page-title" style={{ marginTop: 6 }}>
          Waiting for the owner
        </h2>
        <p className="soft" style={{ marginTop: 8 }}>
          Your code is correct. Because this is a new device, the owner must allow it once. Ask them to open <strong>People &amp; devices</strong> and approve the request with this code:
        </p>
      </div>
      <div className="device-code">{code}</div>
      <div className="row">
        <button className="btn btn-primary" onClick={() => void check()}>
          <Icon name="refresh" size={18} /> Check again
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          Cancel
        </button>
      </div>
      {msg && <div className="note-box">{msg}</div>}
      <p className="hint">This page checks by itself every few seconds.</p>
    </div>
  );
}

function DemoStep({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  return (
    <div className="stack" style={{ gap: 20 }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="left" size={17} /> Back
      </button>
      <div>
        <div className="eyebrow">Demo</div>
        <h2 className="page-title" style={{ marginTop: 6 }}>
          See it as…
        </h2>
        <p className="soft" style={{ marginTop: 8 }}>
          Three weeks of <strong>sample</strong> records, kept only on this device and never sent anywhere. Each person sees exactly what their role allows.
        </p>
      </div>
      <div className="profiles">
        {DEMO_USERS.map((u) => (
          <button
            key={u.id}
            className="profile"
            disabled={busy !== null}
            onClick={async () => {
              setBusy(u.id);
              await store.openDemo(u);
            }}
          >
            <Monogram name={u.name} id={u.id} />
            <strong>{u.name}</strong>
            <span className="muted" style={{ fontSize: 12.5 }}>
              {ROLE_LABEL[u.role]}
              {u.role === 'worker' ? ' · Comoros' : ''}
            </span>
            {busy === u.id && <span className="pill indigo">Opening…</span>}
          </button>
        ))}
      </div>
      <p className="hint">Real sign-in uses a {MIN_PIN_LENGTH.worker}-digit code for workers and {MIN_PIN_LENGTH.owner} digits for the owner and managers.</p>
    </div>
  );
}
