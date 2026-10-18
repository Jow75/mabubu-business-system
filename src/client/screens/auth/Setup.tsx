import { useState } from 'react';
import { store } from '../../lib/store';
import { ApiError } from '../../lib/api';
import { pinPolicyError } from '../../../shared/permissions';
import { Icon } from '../../ui/Icon';
import { Field } from '../../ui/kit';
import { AuthLayout } from './Welcome';

/** First setup (creates the owner) or owner recovery, using the server's SETUP_TOKEN. */
export function Setup() {
  const [token, setToken] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
            setError(err instanceof ApiError ? err.message : 'Setup failed.');
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => store.goTo('welcome')}>
          <Icon name="left" size={17} /> Back
        </button>
        <div>
          <div className="eyebrow">Owner setup</div>
          <h2 className="page-title" style={{ marginTop: 6 }}>
            Set up the business
          </h2>
          <p className="soft" style={{ marginTop: 8 }}>
            Enter the setup key that was saved on the server. This creates the owner account and approves this device. The same key recovers the owner account if a phone is lost.
          </p>
        </div>
        <Field label="Setup key" htmlFor="tok">
          <input id="tok" className="input mono" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" required />
        </Field>
        <Field label="Your name" htmlFor="nm" hint="For recovery, enter the existing owner’s name.">
          <input id="nm" className="input" value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <div className="form-grid">
          <Field label="Owner code (6–8 digits)" htmlFor="p1" hint={policy ?? 'Do not use your phone PIN or birth year.'}>
            <input id="p1" className="input" inputMode="numeric" type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} required />
          </Field>
          <Field label="Repeat the code" htmlFor="p2" hint={mismatch ? 'The codes do not match.' : undefined}>
            <input id="p2" className="input" inputMode="numeric" type="password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/\D/g, '').slice(0, 8))} required />
          </Field>
        </div>
        {error && <div className="error-box">{error}</div>}
        <button className="btn btn-primary btn-lg" disabled={busy || !token || !name || !pin || Boolean(policy) || pin !== pin2}>
          {busy ? 'Setting up…' : 'Create owner account'}
        </button>
      </form>
    </AuthLayout>
  );
}
