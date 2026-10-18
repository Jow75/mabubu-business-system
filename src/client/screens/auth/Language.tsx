import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { LANGS, suggestedLang, type Lang } from '../../lib/i18n';
import { makeT } from '../../../shared/i18n';
import { Icon } from '../../ui/Icon';
import { AuthLayout } from './Welcome';

/** Shown once per device, before anything else, with the device's language preselected. */
export function LanguageChoice() {
  const [lang, setLang] = useState<Lang>(suggestedLang);
  const t = makeT(lang);
  return (
    <AuthLayout lang={lang}>
      <form
        className="stack"
        style={{ gap: 20 }}
        onSubmit={(e) => {
          e.preventDefault();
          store.setPrefs({ lang });
        }}
      >
        <div>
          <div className="eyebrow">{t('lang.label')}</div>
          <h2 className="page-title" style={{ marginTop: 6 }}>
            {t('lang.title')}
          </h2>
          <p className="soft" style={{ marginTop: 8 }}>
            {t('lang.lead')}
          </p>
        </div>
        <div className="lang-list" role="radiogroup" aria-label={t('lang.label')}>
          {LANGS.map((l) => (
            <button key={l.code} type="button" role="radio" aria-checked={lang === l.code} lang={l.code} className="lang-option" onClick={() => setLang(l.code)}>
              <span>{l.name}</span>
              {lang === l.code && <Icon name="check" size={20} />}
            </button>
          ))}
        </div>
        <button className="btn btn-primary btn-lg">
          {t('lang.continue')} <Icon name="arrowRight" size={18} />
        </button>
      </form>
    </AuthLayout>
  );
}

/** Compact switch for Settings and the Me page. */
export function LanguageSwitch() {
  const { prefs } = useApp();
  const t = makeT(prefs.lang ?? 'en');
  return (
    <div className="seg" role="group" aria-label={t('lang.label')}>
      {LANGS.map((l) => (
        <button key={l.code} type="button" lang={l.code} aria-pressed={(prefs.lang ?? 'en') === l.code} onClick={() => store.setPrefs({ lang: l.code })}>
          {l.name}
        </button>
      ))}
    </div>
  );
}
