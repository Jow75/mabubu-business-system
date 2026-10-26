import { useState } from 'react';
import { store } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { uuidv7 } from '../../../shared/ids';
import { DEFAULT_PLACES, DEFAULT_SIZES, refKey, toSeed } from '../../lib/seed';
import { errText, useT } from '../../lib/i18n';
import { Icon } from '../../ui/Icon';
import { LOGO } from '../../../shared/brand';
import { toast } from '../../ui/kit';

/** Shown once, after the owner account is first created (never on recovery). */
export function StarterSetup() {
  const lk = useLookups();
  const t = useT();
  // If any default already exists (reached a second time somehow), leave it
  // unticked and labelled so it is never created twice.
  const haveLoc = new Set(lk.locations.map((l) => refKey(l.name)));
  const haveSize = new Set(lk.sizes.map((s) => refKey(s.name)));
  const [places, setPlaces] = useState(DEFAULT_PLACES.map((p) => ({ ...p, on: !haveLoc.has(refKey(p.name)), exists: haveLoc.has(refKey(p.name)) })));
  const [sizes, setSizes] = useState(DEFAULT_SIZES.map((s) => ({ name: s, on: !haveSize.has(refKey(s)), exists: haveSize.has(refKey(s)) })));
  const [busy, setBusy] = useState(false);
  return (
    <main className="main">
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="row">
          <img className="brand-logo" src={LOGO.small} width={44} height={44} alt="" />
          <div>
            <div className="eyebrow">{t('ss.welcome')}</div>
            <h1 className="page-title">{t('ss.title')}</h1>
          </div>
        </div>
        <p className="soft">{t('ss.lead')}</p>
        <section className="card card-pad stack">
          <span className="section-title">{t('ss.places')}</span>
          {places.map((p, i) => (
            <label key={p.name} className="check">
              <input type="checkbox" checked={p.on} onChange={(e) => setPlaces(places.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <span>
                <strong>{p.name}</strong> <span className="muted">· {t(`lbl.locKind.${p.kind}`)} · {p.currency}</span>
                {p.exists && <span className="pill" style={{ marginLeft: 8 }}>{t('ss.alreadyAdded')}</span>}
              </span>
            </label>
          ))}
        </section>
        <section className="card card-pad stack">
          <span className="section-title">{t('ss.sizes')}</span>
          {sizes.map((s, i) => (
            <label key={s.name} className="check">
              <input type="checkbox" checked={s.on} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <span>
                {s.name}
                {s.exists && <span className="pill" style={{ marginLeft: 8 }}>{t('ss.alreadyAdded')}</span>}
              </span>
            </label>
          ))}
        </section>
        <div className="row">
          <button
            className="btn btn-primary btn-lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              // Never create a second copy: skip any default whose name already exists.
              for (const p of toSeed(lk.locations, places.filter((x) => x.on))) {
                const r = await store.submit('location.upsert', { id: uuidv7(), name: p.name, kind: p.kind, currency: p.currency, active: true });
                if (!r.ok) toast(errText(r.error), 'error');
              }
              let n = lk.sizes.reduce((m, s) => Math.max(m, s.sort), 0);
              for (const s of toSeed(lk.sizes, sizes.filter((x) => x.on))) {
                const r = await store.submit('size.upsert', { id: uuidv7(), name: s.name, sort: ++n, active: true });
                if (!r.ok) toast(errText(r.error), 'error');
              }
              store.dismissFirstRun();
              window.location.hash = '/catalogue';
              toast(t('ss.ready'));
            }}
          >
            <Icon name="check" /> {t('ss.create')}
          </button>
          <button className="btn btn-ghost" onClick={() => store.dismissFirstRun()}>
            {t('ss.skip')}
          </button>
        </div>
      </div>
    </main>
  );
}
