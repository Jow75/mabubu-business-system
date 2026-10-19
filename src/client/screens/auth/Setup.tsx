import { useEffect, useState } from 'react';
import { store } from '../../lib/store';
import { api, ApiError } from '../../lib/api';
import { pinPolicyError } from '../../../shared/permissions';
import { Icon } from '../../ui/Icon';
import { Field } from '../../ui/kit';
import { AuthLayout } from './Welcome';
import { errText, useT } from '../../lib/i18n';

/**
 * First setup (creates the owner) or owner recovery, using the server's
 * SETUP_TOKEN. The server decides which one happened — this screen only reframes
 * the wording. When an owner already exists (`needsSetup === false`), entering
 * the key re-links and approves this device; it never creates a second owner and
 * never re-seeds the starter data.
 */
export function Setup() {
  const t = useT();
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // null while unknown (offline or still loading): fall back to the neutral,
  // both-purpose wording rather than guessing.
  const [recover, setRecover] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    api<{ needsSetup: boolean }>('GET', '/setup/status')
      .then((s) => alive && setRecover(!s.needsSetup))
      .catch(() => alive && setRecover(null));
    return () => {
      alive = false;
    };
  }, []);
  const isRecover = recover === true;
  const policy = pin ? pinPolicyError('owner', pin) : null;
  const mismatch = pin2 && pin !== pin2;
  return (
    <AuthLayout>
      <form
        className="stack"
        style={{ gap: 18 }}
        onSubmit={async (e) => {
          e.preventDefault();
          if (policy || mismatch) return;
          setBusy(true);
          setError(null);
          try {
            await store.setup(token.trim(), name.trim(), pin);
          } catch (err) {
            setError(err instanceof ApiError ? errText(err.message) : t('setup.failed'));
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => store.goTo('welcome')}>
          <Icon name="left" size={17} /> {t('c.back')}
        </button>
        <div>
          <div className="eyebrow">{isRecover ? t('setup.recoverEyebrow') : t('setup.eyebrow')}</div>
          <h2 className="page-title" style={{ marginTop: 6 }}>
            {isRecover ? t('setup.recoverTitle') : t('setup.title')}
          </h2>
          <p className="soft" style={{ marginTop: 8 }}>
            {isRecover ? t('setup.recoverLead') : t('setup.lead')}
          </p>
        </div>
        <Field label={t('setup.key')} htmlFor="tok">
          <input id="tok" className="input mono" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
        </Field>
        <Field label={t('auth.yourName')} htmlFor="nm" hint={t('setup.recoveryHint')}>
          <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label={t('setup.code')} htmlFor="p1" hint={policy ? errText(policy) : t('setup.codeHint')}>
            <input id="p1" className="input" inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} required />
          </Field>
          <Field label={t('setup.repeat')} htmlFor="p2" hint={mismatch ? t('setup.mismatch') : undefined}>
            <input id="p2" className="input" inputMode="numeric" type="password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))} required />
          </Field>
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !token || !name || !pin || Boolean(policy) || pin !== pin2}>
          {busy ? t('setup.busy') : isRecover ? t('setup.recoverCreate') : t('setup.create')}
        </button>
      </form>
    </AuthLayout>
  );
}
