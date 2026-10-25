// The owner's temporary sign-in (ADR-006): always marked as such, with Sign
// out at hand. Signing out while records are still waiting to send asks
// first: on a temporary sign-in they exist only in this page.

import { useState } from 'react';
import { store, useApp } from '../lib/store';
import { useT } from '../lib/i18n';
import { fmtTime } from '../../shared/time';
import { Icon } from './Icon';
import { Sheet } from './kit';

export function SignOutButton({ className }: { className?: string }) {
  const { sync } = useApp();
  const t = useT();
  const [confirm, setConfirm] = useState(false);
  return (
    <>
      <button className={className} onClick={() => store.signOut() || setConfirm(true)}>
        <Icon name="lock" size={17} /> {t('temp.signOut')}
      </button>
      {confirm && (
        <Sheet
          title={t('temp.unsentTitle', { n: sync.pending })}
          onClose={() => setConfirm(false)}
          footer={
            <>
              <button className="btn" onClick={() => setConfirm(false)}>
                {t('temp.wait')}
              </button>
              <button className="btn btn-danger" onClick={() => store.signOut(true)}>
                {t('temp.signOutAnyway')}
              </button>
            </>
          }
        >
          <p className="soft">{t('temp.unsentBody')}</p>
        </Sheet>
      )}
    </>
  );
}

export function TemporaryRibbon() {
  const { tempUntil } = useApp();
  const t = useT();
  if (!tempUntil) return null;
  return (
    <div className="temp-ribbon" role="status">
      <span>{t('temp.ribbon', { time: fmtTime(tempUntil) })}</span>
      <SignOutButton />
    </div>
  );
}
