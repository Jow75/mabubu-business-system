import { useState } from 'react';
import { store } from '../../lib/store';
import { uuidv7 } from '../../../shared/ids';
import type { Currency } from '../../../shared/money';
import { LOCATION_KIND_LABEL } from '../../lib/labels';
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
  return (
    <main className="main">
      <div className="page" style={{ maxWidth: 680 }}>
        <div className="row">
          <DeraMark size={40} />
          <div>
            <div className="eyebrow">Welcome</div>
            <h1 className="page-title">Let’s set up the basics</h1>
          </div>
        </div>
        <p className="soft">Pick what to create now. Everything can be renamed or changed later in Garments &amp; prices.</p>
        <section className="card card-pad stack">
          <span className="section-title">Places</span>
          {places.map((p, i) => (
            <label key={p.name} className="check">
              <input type="checkbox" checked={p.on} onChange={(e) => setPlaces(places.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))} />
              <span>
                <strong>{p.name}</strong> <span className="muted">· {LOCATION_KIND_LABEL[p.kind]} · {p.currency}</span>
              </span>
            </label>
          ))}
        </section>
        <section className="card card-pad stack">
          <span className="section-title">Size groups</span>
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
                if (!r.ok) toast(r.error, 'error');
              }
              let n = 0;
              for (const s of sizes.filter((x) => x.on)) await store.submit('size.upsert', { id: uuidv7(), name: s.name, sort: ++n, active: true });
              store.dismissFirstRun();
              window.location.hash = '/catalogue';
              toast('Ready. Next: add vendors and garment types.');
            }}
          >
            <Icon name="check" /> Create and continue
          </button>
          <button className="btn btn-ghost" onClick={() => store.dismissFirstRun()}>
            Skip
          </button>
        </div>
      </div>
    </main>
  );
}
