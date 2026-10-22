import { useState } from 'react';
import { promptInstall, useInstall } from '../lib/install';
import { useT } from '../lib/i18n';
import { fmtDate } from '../../shared/time';
import { Icon } from './Icon';
import { toast } from './kit';

const DISMISS_KEY = 'mabubu.installBannerDismissed';

async function install(t: ReturnType<typeof useT>) {
  if ((await promptInstall()) === 'accepted') toast(t('inst.started'));
}

/** Under Me: how this device runs Mabubu, the browser's own install offer when there is one, and the version. */
export function InstallSection() {
  const { canInstall, installed } = useInstall();
  const t = useT();
  return (
    <section className="card card-pad stack">
      <span className="section-title">{t('inst.title')}</span>
      <dl className="kv">
        <dt>{t('inst.app')}</dt>
        <dd>{installed ? t('inst.installed') : t('inst.browser')}</dd>
        <dt>{t('inst.version')}</dt>
        <dd>{t('inst.versionValue', { version: __APP_VERSION__, date: fmtDate(__BUILD_TIME__.slice(0, 10)) })}</dd>
      </dl>
      {!installed && (
        <>
          <p className="soft" style={{ margin: 0 }}>
            {t('inst.lead')}
          </p>
          {canInstall ? (
            <button className="btn btn-primary" style={{ alignSelf: 'flex-start' }} onClick={() => void install(t)}>
              <Icon name="plus" size={18} /> {t('inst.button')}
            </button>
          ) : (
            <p className="hint" style={{ margin: 0 }}>
              {t('inst.how')}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** A one-line, dismissible offer on the overview, shown only when the browser can install right now. */
export function InstallBanner() {
  const { canInstall, installed } = useInstall();
  const t = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === '1';
    } catch {
      return false;
    }
  });
  if (!canInstall || installed || dismissed) return null;
  return (
    <div className="info-box row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
      <span>{t('inst.title')}</span>
      <span className="row" style={{ gap: 6 }}>
        <button className="btn btn-sm btn-primary" onClick={() => void install(t)}>
          {t('inst.button')}
        </button>
        <button
          className="btn btn-sm btn-ghost"
          onClick={() => {
            setDismissed(true);
            try {
              localStorage.setItem(DISMISS_KEY, '1');
            } catch {
              /* storage unavailable: the banner just returns next time */
            }
          }}
        >
          {t('inst.notNow')}
        </button>
      </span>
    </div>
  );
}
