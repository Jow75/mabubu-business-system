import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { navigate, useRoute } from '../../lib/router';
import { uuidv7 } from '../../../shared/ids';
import { priceFor } from '../../../shared/engine';
import type { GarmentType, Location, SizeCategory } from '../../../shared/model';
import { CURRENCY_CODES, formatLocalCount, type Currency } from '../../../shared/money';
import { LOCATION_KINDS } from '../../../shared/ops';
import { businessDate, fmtDate } from '../../../shared/time';
import { LOCATION_KIND_LABEL, SWATCHES } from '../../lib/labels';
import { catalogueReport } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';
import { DownloadButton } from '../../ui/Reporting';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Sheet, save } from '../../ui/kit';

type Tab = 'garments' | 'prices' | 'sizes' | 'places';

export function CataloguePage() {
  const { query } = useRoute();
  const tab = (query.get('tab') as Tab) ?? 'garments';
  const tabs: { id: Tab; label: string }[] = [
    { id: 'garments', label: 'Garments' },
    { id: 'prices', label: 'Selling prices' },
    { id: 'sizes', label: 'Size groups' },
    { id: 'places', label: 'Places' },
  ];
  return (
    <div className="page">
      <PageHead
        title="Garments & prices"
        lead="Each garment type has its own identity — two garments with the same purchase price are still different stock if they differ in size, cut or vendor."
        actions={<DownloadButton label="Download garments, sizes & prices" build={() => catalogueReport(reportCtx(), businessDate())} />}
      />
      <div className="tabs" role="tablist">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => navigate(`/catalogue?tab=${t.id}`)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'garments' && <Garments />}
      {tab === 'prices' && <Prices />}
      {tab === 'sizes' && <Sizes />}
      {tab === 'places' && <Places />}
    </div>
  );
}

function useCan() {
  const { user } = useApp();
  return { catalog: user!.caps.includes('catalog.manage'), pricing: user!.caps.includes('pricing.manage') };
}

function Garments() {
  const lk = useLookups();
  const can = useCan();
  const [edit, setEdit] = useState<GarmentType | 'new' | null>(null);
  return (
    <>
      {can.catalog && (
        <div>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={18} /> Add garment type
          </button>
        </div>
      )}
      <section className="card">
        {lk.garments.length === 0 ? (
          <Empty icon="tag" title="No garment types yet">Add the first one — for example “Elastic-neck dera from Hafsa”.</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Garment</th>
                  <th>Size group</th>
                  <th>Usual vendor</th>
                  <th>Notes</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lk.garments.map((g) => (
                  <tr key={g.id} style={g.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <GarmentLabel g={g} />
                      {!g.active && <span className="pill" style={{ marginLeft: 8 }}>not in use</span>}
                    </td>
                    <td>{lk.size(g.sizeCategoryId)?.name ?? '—'}</td>
                    <td>{lk.vendor(g.vendorId)?.name ?? '—'}</td>
                    <td className="muted">{g.description}</td>
                    <td>
                      {can.catalog && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdit(g)}>
                          Edit
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {edit && <GarmentSheet g={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function GarmentSheet({ g, onClose }: { g: GarmentType | null; onClose: () => void }) {
  const lk = useLookups();
  const [code, setCode] = useState(g?.code ?? '');
  const [name, setName] = useState(g?.name ?? '');
  const [size, setSize] = useState(g?.sizeCategoryId ?? '');
  const [vendor, setVendor] = useState(g?.vendorId ?? '');
  const [description, setDescription] = useState(g?.description ?? '');
  const [swatch, setSwatch] = useState(g?.swatch ?? SWATCHES[lk.garments.length % SWATCHES.length]!);
  const [active, setActive] = useState(g?.active ?? true);
  const dupe = lk.garments.some((x) => x.code === code && x.id !== g?.id);
  const codeOk = /^[A-Z0-9][A-Z0-9-]{0,15}$/.test(code);
  return (
    <Sheet
      title={g ? `Edit ${g.code}` : 'Add garment type'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!codeOk || dupe || !name.trim()}
            onClick={async () => {
              const ok = await save(
                () => store.submit('garment.upsert', { id: g?.id ?? uuidv7(), code, name: name.trim(), sizeCategoryId: size || null, vendorId: vendor || null, description: description.trim(), swatch, active }),
                'Garment saved',
              );
              if (ok) onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Short code" hint={dupe ? 'Already used by another garment.' : 'e.g. HAF-EN80 — vendor, style, price'}>
          <input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16))} />
        </Field>
        <Field label="Name">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Elastic-neck dera" />
        </Field>
        <Field label="Size group">
          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">—</option>
            {lk.sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Usual vendor">
          <select className="select" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">—</option>
            {lk.vendors.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="How to recognise it" hint="Cut, length, neck, fabric — what makes it different from similar garments.">
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label="Colour tag (helps workers spot it in lists)">
        <div className="row">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Colour ${c}`}
              aria-pressed={swatch === c}
              onClick={() => setSwatch(c)}
              className="swatch"
              style={{ width: 30, height: 30, borderRadius: 8, background: c, border: 0, cursor: 'pointer', outline: swatch === c ? '3px solid var(--ink)' : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use (shown to workers)
      </label>
    </Sheet>
  );
}

function Prices() {
  const { ledger } = useApp();
  const lk = useLookups();
  const can = useCan();
  const [edit, setEdit] = useState<{ g: GarmentType; l: Location } | null>(null);
  const today = businessDate();
  const places = lk.locations.filter((l) => l.kind === 'selling' && l.active);
  if (!places.length) return <Empty icon="pin" title="No selling place yet">Add a place of kind “Selling” first.</Empty>;
  return (
    <>
      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Garment</th>
                {places.map((l) => (
                  <th key={l.id} className="n">
                    {l.name}: retail · wholesale
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lk.activeGarments.map((g) => (
                <tr key={g.id}>
                  <td>
                    <GarmentLabel g={g} />
                  </td>
                  {places.map((l) => {
                    const p = priceFor((k) => ledger.get(k), g.id, l.id, today);
                    return (
                      <td key={l.id} className="n">
                        <span className="row" style={{ justifyContent: 'flex-end', gap: 8 }}>
                          {p ? (
                            <span>
                              <Money amount={p.retail} currency={p.currency} />
                              <span className="muted"> · {p.wholesale ? <Money amount={p.wholesale} currency={p.currency} /> : '—'}</span>
                            </span>
                          ) : (
                            <span className="pill red">No price</span>
                          )}
                          {can.pricing && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ g, l })}>
                              Set
                            </button>
                          )}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <p className="hint">A new price starts on the date you choose. Old prices stay in the history, so past days keep the prices they were sold at.</p>
      {edit && <PriceSheet g={edit.g} l={edit.l} onClose={() => setEdit(null)} />}
    </>
  );
}

function PriceSheet({ g, l, onClose }: { g: GarmentType; l: Location; onClose: () => void }) {
  const { ledger } = useApp();
  const cur = priceFor((k) => ledger.get(k), g.id, l.id, businessDate());
  const [retail, setRetail] = useState<number | null>(cur?.retail ?? null);
  const [wholesale, setWholesale] = useState<number | null>(cur?.wholesale ?? null);
  const [from, setFrom] = useState(businessDate());
  return (
    <Sheet
      title={`Price of ${g.code} in ${l.name}`}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!retail}
            onClick={async () => {
              if (await save(() => store.submit('price.set', { id: uuidv7(), garmentTypeId: g.id, locationId: l.id, currency: l.currency, retail: retail ?? 0, wholesale: wholesale || null, effectiveFrom: from }), 'Price saved')) onClose();
            }}
          >
            Save price
          </button>
        </>
      }
    >
      {cur && (
        <div className="info-box">
          Current: <Money amount={cur.retail} currency={cur.currency} /> since {fmtDate(cur.effectiveFrom)}
        </div>
      )}
      <Field label={`Retail price (${l.currency})`} hint="Always the official amount, e.g. KMF 1,000 — not the local count.">
        <MoneyInput big currency={l.currency as Currency} value={retail} onChange={setRetail} />
      </Field>
      <Field label="Wholesale price (optional)">
        <MoneyInput currency={l.currency as Currency} value={wholesale} onChange={setWholesale} />
      </Field>
      {l.currency === 'KMF' && retail ? (
        <p className="hint">
          Local count: {formatLocalCount(retail)}
          {wholesale ? ` retail · ${formatLocalCount(wholesale)} wholesale` : ''}
        </p>
      ) : null}
      <Field label="Starts on">
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
    </Sheet>
  );
}

function Sizes() {
  const lk = useLookups();
  const can = useCan();
  const [edit, setEdit] = useState<SizeCategory | 'new' | null>(null);
  const [name, setName] = useState('');
  const [active, setActive] = useState(true);
  const open = (s: SizeCategory | 'new') => {
    setEdit(s);
    setName(s === 'new' ? '' : s.name);
    setActive(s === 'new' ? true : s.active);
  };
  return (
    <>
      {can.catalog && (
        <div>
          <button className="btn btn-primary" onClick={() => open('new')}>
            <Icon name="plus" size={18} /> Add size group
          </button>
        </div>
      )}
      <section className="card list">
        {lk.sizes.length === 0 && <div className="list-item muted">No size groups yet.</div>}
        {lk.sizes.map((s) => (
          <div key={s.id} className="list-item">
            <span style={{ flex: 1 }}>{s.name}</span>
            {!s.active && <span className="pill">not in use</span>}
            {can.catalog && (
              <button className="btn btn-ghost btn-sm" onClick={() => open(s)}>
                Edit
              </button>
            )}
          </div>
        ))}
      </section>
      {edit && (
        <Sheet
          title={edit === 'new' ? 'Add size group' : 'Edit size group'}
          onClose={() => setEdit(null)}
          footer={
            <button
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={async () => {
                const ok = await save(
                  () => store.submit('size.upsert', { id: edit === 'new' ? uuidv7() : edit.id, name: name.trim(), sort: edit === 'new' ? lk.sizes.length + 1 : edit.sort, active }),
                  'Saved',
                );
                if (ok) setEdit(null);
              }}
            >
              Save
            </button>
          }
        >
          <Field label="Name" hint="e.g. Newborn & baby, Child, Between child & adult, Small adult">
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use
          </label>
        </Sheet>
      )}
    </>
  );
}

function Places() {
  const lk = useLookups();
  const can = useCan();
  const [edit, setEdit] = useState<Location | 'new' | null>(null);
  return (
    <>
      {can.catalog && (
        <div>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={18} /> Add place
          </button>
        </div>
      )}
      <section className="card list">
        {lk.locations.length === 0 && <div className="list-item muted">No places yet.</div>}
        {lk.locations.map((l) => (
          <div key={l.id} className="list-item">
            <Icon name="pin" />
            <span style={{ flex: 1 }}>
              <strong>{l.name}</strong>
              <div className="hint">
                {LOCATION_KIND_LABEL[l.kind]} · money in {l.currency}
              </div>
            </span>
            {!l.active && <span className="pill">not in use</span>}
            {can.catalog && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(l)}>
                Edit
              </button>
            )}
          </div>
        ))}
      </section>
      {edit && <PlaceSheet l={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function PlaceSheet({ l, onClose }: { l: Location | null; onClose: () => void }) {
  const [name, setName] = useState(l?.name ?? '');
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>(l?.kind ?? 'selling');
  const [currency, setCurrency] = useState<Currency>(l?.currency ?? 'KMF');
  const [active, setActive] = useState(l?.active ?? true);
  return (
    <Sheet
      title={l ? `Edit ${l.name}` : 'Add place'}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={async () => {
            if (await save(() => store.submit('location.upsert', { id: l?.id ?? uuidv7(), name: name.trim(), kind, currency, active }), 'Place saved')) onClose();
          }}
        >
          Save
        </button>
      }
    >
      <Field label="Name">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Used for">
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {LOCATION_KIND_LABEL[k]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Money used here" hint={l ? 'Changing this does not convert old records.' : undefined}>
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCY_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> In use
      </label>
    </Sheet>
  );
}
