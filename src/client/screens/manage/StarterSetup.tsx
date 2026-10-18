import { useState } from 'react';
import { store } from '../../lib/store';
import { uuidv7 } from '../../../shared/ids';
import type { Currency } from '../../../shared/money';
import { errText, useT } from '../../lib/i18n';
import { DeraMark, Icon } from '../../ui/Icon';
import { toast } from '../../ui/kit';

const PLACES: { name: string; kind: 'purchasing' | 'transit' | 'selling'; currency: Currency }[] = [
  { name: 'Mombasa', kind: 'purchasing', currency: 'KES' },
  { name: 'Dar es Salaam', kind: 'transit', currency: 'TZS' },
  { name: 'Comoros', kind: 'selling', currency: 'KMF' },
];
const SIZES = ['Newborn & baby', 'Small child', 'Child', 'Between child & adult', 'Small adult'];

/** Shown once after the owner account is created. */
export function StarterSetup() {
  const [places, setPlaces] = useState(PLACES.map((p) => ({ ...p, on: true })));
  const [sizes, setSizes] = useState(SIZES.map((s) => ({ name: s, on: true })));
  const [busy, setBusy] = useState(false);
  const t = useT();
  return (
    <main className="main">
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="row">
          <DeraMark size={40} />
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
              </span>
            </label>
          ))}
        </section>
        <section className="card card-pad stack">
          <span className="section-title">{t('ss.sizes')}</span>
          {sizes.map((s, i) => (
            <label key={s.name} className="check">
              <input type="checkbox" checked={s.on} onChange={(e) => setSizes(sizes.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              {s.name}
            </label>
          ))}
        </section>
        <div className="row">
          <button
            className="btn btn-primary btn-lg"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              for (const p of places.filter((x) => x.on)) {
                const r = await store.submit('location.upsert', { id: uuidv7(), name: p.name, kind: p.kind, currency: p.currency, active: true });
                if (!r.ok) toast(errText(r.error), 'error');
              }
              let n = 0;
              for (const s of sizes.filter((x) => x.on)) await store.submit('size.upsert', { id: uuidv7(), name: s.name, sort: ++n, active: true });
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
