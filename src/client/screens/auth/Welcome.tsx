import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { store, useApp } from '../../lib/store';
import { ApiError } from '../../lib/api';
import type { Profile } from '../../lib/db';
import { DEMO_USERS } from '../../../shared/demo-data';
import { TEMP_SIGNIN } from '../../../shared/api';
import { MIN_PIN_LENGTH, type Role } from '../../../shared/permissions';
import { DeraMark, Icon } from '../../ui/Icon';
import { Monogram } from '../../ui/kit';
import { PinPad } from './PinPad';
import { errText, useT } from '../../lib/i18n';
import { makeT, type Lang, type T } from '../../../shared/i18n';

export function AuthLayout({ children, lang }: { children: ReactNode; lang?: Lang }) {
  const own = useT();
  const t = lang ? makeT(lang) : own;
  return (
    <div className="auth">
      <aside className="auth-art">
        <div className="brand" style={{ padding: 0 }}>
          <DeraMark size={38} />
          <span className="brand-word">mabubu</span>
        </div>
        <RouteArt />
        <div className="stack" style={{ position: 'relative', gap: 14 }}>
          <h1>{t('auth.tagline')}</h1>
          <p>{t('auth.blurb')}</p>
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

type Mode = { kind: 'list' } | { kind: 'pin'; profile: Profile } | { kind: 'other' } | { kind: 'pending'; name: string; pin: string; code: string; role: Role } | { kind: 'demo' };

export function Welcome() {
  const { profiles, online } = useApp();
  const real = profiles.filter((p) => !p.demo);
  const [mode, setMode] = useState<Mode>(real.length ? { kind: 'list' } : { kind: 'other' });
  const t = useT();

  return (
    <AuthLayout>
      {(mode.kind === 'list' || mode.kind === 'other') && <SignInNotices />}
      {mode.kind === 'list' && (
        <div className="stack" style={{ gap: 20 }}>
          <div>
            <div className="eyebrow">{t('auth.welcome')}</div>
            <h2 className="page-title" style={{ marginTop: 6 }}>
              {t('auth.who')}
            </h2>
          </div>
          <div className="profiles">
            {real.map((p) => (
              <button key={p.userId} className="profile" onClick={() => setMode({ kind: 'pin', profile: p })}>
                <Monogram name={p.name} id={p.userId} />
                <strong>{p.name}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {t(`role.${p.role}`)}
                </span>
                {p.blocked ? <span className="pill red wrap">{t('auth.notAllowedHere')}</span> : p.needsOnline && <span className="pill saffron">{t('auth.signInOnline')}</span>}
              </button>
            ))}
            <button className="profile" onClick={() => setMode({ kind: 'other' })}>
              <span className="monogram" style={{ background: 'var(--paper-2)', color: 'var(--ink-2)' }}>
                <Icon name="plus" size={22} />
              </span>
              <strong>{t('auth.someoneElse')}</strong>
              <span className="muted" style={{ fontSize: 12.5 }}>
                {t('auth.firstTime')}
              </span>
            </button>
          </div>
          <FooterLinks online={online} onDemo={() => setMode({ kind: 'demo' })} />
        </div>
      )}
      {mode.kind === 'pin' && <PinStep profile={mode.profile} onBack={() => setMode({ kind: 'list' })} onPending={(name, pin, code, role) => setMode({ kind: 'pending', name, pin, code, role })} />}
      {mode.kind === 'other' && (
        <OtherStep
          onBack={real.length ? () => setMode({ kind: 'list' }) : null}
          onPending={(name, pin, code, role) => setMode({ kind: 'pending', name, pin, code, role })}
          onDemo={() => setMode({ kind: 'demo' })}
        />
      )}
      {mode.kind === 'pending' && <PendingStep {...mode} onBack={() => setMode(real.length ? { kind: 'list' } : { kind: 'other' })} />}
      {mode.kind === 'demo' && <DemoStep onBack={() => setMode(real.length ? { kind: 'list' } : { kind: 'other' })} />}
    </AuthLayout>
  );
}

/** What just happened on this device's sign-in: a temporary sign-in ended, or someone was taken off the list. */
function SignInNotices() {
  const { tempEnded, removedNames } = useApp();
  const t = useT();
  if (!tempEnded && !removedNames.length) return null;
  return (
    <div className="stack-sm">
      {tempEnded && (
        <div className={tempEnded.unsent ? 'error-box stack-sm' : 'note-box'} role="status">
          <span>{tempEnded.message ? errText(tempEnded.message) : t('auth.tempSignedOut')}</span>
          {tempEnded.unsent > 0 && <span>{t('auth.tempCarry', { n: tempEnded.unsent })}</span>}
        </div>
      )}
      {removedNames.map((name) => (
        <div key={name} className="note-box" role="status">
          {t('auth.profileRemoved', { name })}
        </div>
      ))}
    </div>
  );
}

function FooterLinks({ online, onDemo }: { online: boolean; onDemo: () => void }) {
  const t = useT();
  return (
    <div className="row-between" style={{ marginTop: 8 }}>
      <button type="button" className="btn btn-ghost btn-sm" onClick={onDemo}>
        <Icon name="eye" size={17} /> {t('auth.demo')}
      </button>
      <span className="pill">
        <span className="dot" style={{ color: online ? 'var(--mangrove)' : 'var(--ink-3)' }} />
        {online ? t('c.online') : t('c.offline')}
      </span>
    </div>
  );
}

function errorText(e: unknown, t: T): string {
  if (e instanceof ApiError) {
    if (e.offline) return t('auth.noInternetNew');
    if (e.body.attemptsLeft) return t('auth.triesLeft', { message: errText(e.message), n: e.body.attemptsLeft });
    return errText(e.message);
  }
  return t('c.somethingWrong');
}

/** The code itself was not the problem (no connection, a server fault): the digits stay so Enter can try again. */
function keepsCode(e: unknown): boolean {
  return !(e instanceof ApiError) || e.offline || e.status >= 500;
}

type PinError = { text: string; keep: boolean } | null;

type OnPending = (name: string, pin: string, code: string, role: Role) => void;

function PinStep({ profile, onBack, onPending }: { profile: Profile; onBack: () => void; onPending: OnPending }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PinError>(null);
  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await store.unlock(profile, pin);
        if (r?.status === 'pending') onPending(profile.name, pin, r.deviceCode, r.role);
      } catch (e) {
        setError({ text: errorText(e, t), keep: keepsCode(e) });
      } finally {
        setBusy(false);
      }
    },
    [profile, onPending, t],
  );
  return (
    <div className="stack pin-step">
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="left" size={17} /> {t('c.back')}
      </button>
      <div className="pin-who">
        <Monogram name={profile.name} id={profile.userId} />
        <h2 className="page-title">{profile.name}</h2>
        <span className="muted">{profile.needsOnline ? t('auth.enterCodeOnline', { reason: errText(profile.needsOnline) }) : t('auth.enterCode')}</span>
      </div>
      <PinPad onSubmit={submit} busy={busy} error={error?.text} keepOnError={error?.keep} role={profile.role} onCancel={onBack} />
      <RemoveProfile profile={profile} onRemoved={onBack} />
    </div>
  );
}

/** Removing a person from this device asks first, and warns before unsent records are lost. */
function RemoveProfile({ profile, onRemoved }: { profile: Profile; onRemoved: () => void }) {
  const t = useT();
  const [unsent, setUnsent] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  if (unsent === null) {
    return (
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'center' }} onClick={() => void store.unsentCount(profile.userId).then(setUnsent)}>
        {t('auth.removeProfile', { name: profile.name })}
      </button>
    );
  }
  return (
    <div className={unsent > 0 ? 'error-box stack-sm' : 'note-box stack-sm'} role="alert">
      <span>{unsent > 0 ? t('auth.removeUnsent', { name: profile.name, n: unsent }) : t('auth.removeConfirm', { name: profile.name })}</span>
      <div className="row">
        <button
          className={unsent > 0 ? 'btn btn-sm btn-danger' : 'btn btn-sm'}
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await store.removeProfile(profile.userId);
            onRemoved();
          }}
        >
          {unsent > 0 ? t('auth.removeAnyway') : t('auth.removeYes')}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setUnsent(null)}>
          {t('c.cancel')}
        </button>
      </div>
    </div>
  );
}

function OtherStep({ onBack, onPending, onDemo }: { onBack: (() => void) | null; onPending: OnPending; onDemo: () => void }) {
  const { online, tempEnded } = useApp();
  const t = useT();
  // After a temporary sign-in ended with records still unsent, its name is filled in to send them quickly.
  const [name, setName] = useState(tempEnded?.unsent ? tempEnded.name : '');
  const [stage, setStage] = useState<'name' | 'pin'>('name');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<PinError>(null);
  const submit = useCallback(
    async (pin: string) => {
      setBusy(true);
      setError(null);
      try {
        const r = await store.signIn(name.trim(), pin);
        if (r.status === 'pending') onPending(name.trim(), pin, r.deviceCode, r.role);
      } catch (e) {
        setError({ text: errorText(e, t), keep: keepsCode(e) });
      } finally {
        setBusy(false);
      }
    },
    [name, onPending, t],
  );
  return (
    <div className="stack" style={{ gap: 20 }}>
      {onBack && (
        <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={stage === 'pin' ? () => setStage('name') : onBack}>
          <Icon name="left" size={17} /> {t('c.back')}
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
            <div className="eyebrow">{t('auth.signIn')}</div>
            <h2 className="page-title" style={{ marginTop: 6 }}>
              {t('auth.yourNameQ')}
            </h2>
            <p className="soft" style={{ marginTop: 8 }}>
              {t('auth.nameHelp')}
            </p>
          </div>
          <input className="input big" style={{ fontSize: 20 }} autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('auth.yourName')} autoComplete="username" />
          <button className="btn btn-primary btn-lg" disabled={!name.trim()}>
            {t('c.continue')} <Icon name="arrowRight" size={18} />
          </button>
          {!online && <div className="note-box">{t('auth.offlineFirst')}</div>}
          <FooterLinks online={online} onDemo={onDemo} />
          <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => store.goTo('setup')}>
            <Icon name="key" size={17} /> {t('auth.setupLink')}
          </button>
        </form>
      ) : (
        <div className="stack" style={{ gap: 18 }}>
          <div className="stack" style={{ alignItems: 'center', gap: 6 }}>
            <h2 className="page-title">{name}</h2>
            <span className="muted">{t('auth.enterCode')}</span>
          </div>
          <PinPad onSubmit={submit} busy={busy} error={error?.text} keepOnError={error?.keep} role={null} onCancel={() => setStage('name')} />
        </div>
      )}
    </div>
  );
}

/** How often the waiting screen re-checks: often at first, then gently, then it stops. */
const POLL_FAST_MS = 8_000;
const POLL_SLOW_MS = 30_000;
const POLL_FAST_FOR_MS = 5 * 60_000;
const POLL_STOP_AFTER_MS = 30 * 60_000;

function PendingStep({ name, pin, code, role, onBack }: { name: string; pin: string; code: string; role: Role; onBack: () => void }) {
  const t = useT();
  const [msg, setMsg] = useState<string | null>(null);
  const [stopped, setStopped] = useState(false);
  const [busy, setBusy] = useState(false);
  const started = useRef(Date.now());
  const owner = role === 'owner';
  const check = useCallback(async () => {
    try {
      const r = await store.signIn(name, pin);
      if (r.status === 'pending') setMsg(t('auth.stillWaiting'));
    } catch (e) {
      setMsg(errorText(e, t));
    }
  }, [name, pin, t]);
  // The owner's temporary sign-in (ADR-006): in at once, nothing kept, this computer not approved.
  const temporary = async () => {
    setBusy(true);
    setMsg(null);
    try {
      await store.signInTemporary(name, pin);
    } catch (e) {
      setMsg(errorText(e, t));
      setBusy(false);
    }
  };
  useEffect(() => {
    if (stopped || busy) return;
    let timer: ReturnType<typeof setTimeout>;
    const next = () => {
      const age = Date.now() - started.current;
      if (age > POLL_STOP_AFTER_MS) {
        setStopped(true);
        return;
      }
      timer = setTimeout(
        () => {
          if (document.visibilityState === 'visible') void check();
          next();
        },
        age < POLL_FAST_FOR_MS ? POLL_FAST_MS : POLL_SLOW_MS,
      );
    };
    next();
    return () => clearTimeout(timer);
  }, [check, stopped, busy]);
  const recheck = () => {
    started.current = Date.now();
    setStopped(false);
    void check();
  };
  if (owner) {
    return (
      <div className="stack" style={{ gap: 18 }}>
        <div>
          <div className="eyebrow">{t('auth.newDevice')}</div>
          <h2 className="page-title" style={{ marginTop: 6 }}>
            {t('auth.ownerChoiceTitle')}
          </h2>
          <p className="soft" style={{ marginTop: 8 }}>
            {t('auth.ownerChoiceBody')}
          </p>
        </div>
        <section className="card card-pad selvedge stack-sm" style={{ paddingLeft: 22 }}>
          <strong>{t('auth.tempTitle')}</strong>
          <span className="soft">{t('auth.tempBody', { idle: TEMP_SIGNIN.idleMinutes, hours: TEMP_SIGNIN.maxHours })}</span>
          <button type="button" className="btn btn-primary btn-lg btn-wrap" disabled={busy} onClick={() => void temporary()}>
            {busy ? t('c.opening') : t('auth.tempButton')}
          </button>
        </section>
        <section className="card card-pad stack-sm">
          <strong>{t('auth.ownTitle')}</strong>
          <span className="soft">{t('auth.ownBody')}</span>
          <div className="device-code">{code}</div>
          <div className="row" style={{ flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-wrap" disabled={busy} onClick={() => store.goTo('setup', { name, pin })}>
              <Icon name="key" size={18} /> {t('auth.useRecoveryKey')}
            </button>
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={recheck}>
              <Icon name="refresh" size={18} /> {t('auth.checkAgain')}
            </button>
          </div>
          <p className="hint">{stopped ? t('auth.autoCheckStopped') : t('auth.ownerAutoCheck')}</p>
        </section>
        {msg && <div className="note-box">{msg}</div>}
        <button type="button" className="btn btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
          {t('c.cancel')}
        </button>
        <p className="hint">{t('auth.whyNewDevice')}</p>
      </div>
    );
  }
  return (
    <div className="stack" style={{ gap: 20 }}>
      <div>
        <div className="eyebrow">{t('auth.newDevice')}</div>
        <h2 className="page-title" style={{ marginTop: 6 }}>
          {t('auth.waitingOwner')}
        </h2>
        <p className="soft" style={{ marginTop: 8 }}>
          {t('auth.pendingBody')}
        </p>
      </div>
      <div className="device-code">{code}</div>
      <div className="row">
        <button className="btn btn-primary" onClick={recheck}>
          <Icon name="refresh" size={18} /> {t('auth.checkAgain')}
        </button>
        <button className="btn btn-ghost" onClick={onBack}>
          {t('c.cancel')}
        </button>
      </div>
      {msg && <div className="note-box">{msg}</div>}
      <p className="hint">{stopped ? t('auth.autoCheckStopped') : t('auth.autoCheck')}</p>
      <p className="hint">{t('auth.whyNewDevice')}</p>
    </div>
  );
}

/** Shown when the browser will not let the app keep anything on this device. */
export function StorageBlocked() {
  const t = useT();
  return (
    <AuthLayout>
      <div className="stack" style={{ gap: 16 }}>
        <div className="eyebrow">{t('auth.storageBlockedEyebrow')}</div>
        <h2 className="page-title">{t('auth.storageBlockedTitle')}</h2>
        <p className="soft">{t('auth.storageBlockedBody')}</p>
        <button type="button" className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => location.reload()}>
          <Icon name="refresh" size={18} /> {t('auth.tryAgain')}
        </button>
      </div>
    </AuthLayout>
  );
}

function DemoStep({ onBack }: { onBack: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const t = useT();
  return (
    <div className="stack" style={{ gap: 20 }}>
      <button className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={onBack}>
        <Icon name="left" size={17} /> {t('c.back')}
      </button>
      <div>
        <div className="eyebrow">{t('auth.demoEyebrow')}</div>
        <h2 className="page-title" style={{ marginTop: 6 }}>
          {t('auth.seeAs')}
        </h2>
        <p className="soft" style={{ marginTop: 8 }}>
          {t('auth.demoBody')}
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
              {t(`role.${u.role}`)}
              {u.role === 'worker' ? ` · ${t('auth.comoros')}` : ''}
            </span>
            {busy === u.id && <span className="pill indigo">{t('c.opening')}</span>}
          </button>
        ))}
      </div>
      <p className="hint">{t('auth.pinRule', { w: MIN_PIN_LENGTH.worker, o: MIN_PIN_LENGTH.owner })}</p>
    </div>
  );
}
