import { useState } from 'react';
import { promptInstall, useInstall } from '../lib/install';
import { useApp } from '../lib/store';
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
              {howText(platform(), t)}
            </p>
          )}
        </>
      )}
      <p className="hint" style={{ margin: 0 }}>
        {t('inst.facts')}
      </p>
    </section>
  );
}

type Platform = 'android' | 'ios' | 'computer';
function platform(): Platform {
  const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
  if (/Android/i.test(ua)) return 'android';
  if (/iPhone|iPad|iPod/.test(ua)) return 'ios';
  return 'computer';
}

function readDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * The offer to install, shown after sign-in (overview and the worker's Today)
 * until it is installed or the person taps Later — that choice is remembered on
 * this device and the same help stays under Me. When the browser has offered an
 * install, the button opens the browser's own dialog; otherwise "How to install"
 * shows the steps for this kind of device. Never blocks anything, and never
 * claims that installing keeps the device's identity safe from a data clear.
 */
export function InstallBanner() {
  const { canInstall, installed } = useInstall();
  const { tempUntil } = useApp();
  const t = useT();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [how, setHow] = useState(false);
  // Never offered on a temporary sign-in (ADR-006): that computer is not one of the owner's devices.
  if (installed || dismissed || tempUntil) return null;
  const kind = platform();
  const later = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable: the offer just returns next time */
    }
    toast(t('inst.laterNote'));
  };
  return (
    <section className="info-box install-offer stack-sm" aria-label={t('inst.title')}>
      <strong>{kind === 'computer' ? t('inst.bannerComputer') : t('inst.bannerPhone')}</strong>
      <span>{t('inst.bannerBody')}</span>
      {how && <span className="hint">{howText(kind, t)}</span>}
      <span className="row" style={{ gap: 6, flexWrap: 'wrap' }}>
        {canInstall ? (
          <button className="btn btn-sm btn-primary" onClick={() => void install(t)}>
            <Icon name="plus" size={16} /> {t('inst.button')}
          </button>
        ) : (
          !how && (
            <button className="btn btn-sm btn-primary" onClick={() => setHow(true)}>
              {t('inst.howButton')}
            </button>
          )
        )}
        <button className="btn btn-sm btn-ghost" onClick={later}>
          {t('inst.later')}
        </button>
      </span>
    </section>
  );
}

function howText(kind: Platform, t: ReturnType<typeof useT>): string {
  return kind === 'android' ? t('inst.howAndroid') : kind === 'ios' ? t('inst.howIos') : t('inst.how');
}
