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
import { SWATCHES } from '../../lib/labels';
import { rich, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import { catalogueReport } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';
import { DownloadButton } from '../../ui/Reporting';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Sheet, save } from '../../ui/kit';

type Tab = 'garments' | 'prices' | 'sizes' | 'places';

export function CataloguePage() {
  const { query } = useRoute();
  const t = useT();
  const tab = (query.get('tab') as Tab) ?? 'garments';
  const tabs: { id: Tab; label: Key }[] = [
    { id: 'garments', label: 'cat.tab.garments' },
    { id: 'prices', label: 'cat.tab.prices' },
    { id: 'sizes', label: 'cat.tab.sizes' },
    { id: 'places', label: 'cat.tab.places' },
  ];
  return (
    <div className="page">
      <PageHead
        title={t('nav.catalogue')}
        lead={t('cat.lead')}
        actions={<DownloadButton label={t('cat.download')} build={() => catalogueReport(reportCtx(), businessDate())} />}
      />
      <div className="tabs" role="tablist">
        {tabs.map((tb) => (
          <button key={tb.id} role="tab" aria-selected={tab === tb.id} onClick={() => navigate(`/catalogue?tab=${tb.id}`)}>
            {t(tb.label)}
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
  const t = useT();
  const [edit, setEdit] = useState<GarmentType | 'new' | null>(null);
  return (
    <>
      {can.catalog && (
        <div>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={18} /> {t('cat.addGarment')}
          </button>
        </div>
      )}
      <section className="card">
        {lk.garments.length === 0 ? (
          <Empty icon="tag" title={t('cat.noGarments')}>{t('cat.noGarmentsBody')}</Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('c.garment')}</th>
                  <th>{t('cat.sizeGroup')}</th>
                  <th>{t('cat.usualVendor')}</th>
                  <th>{t('cat.notes')}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {lk.garments.map((g) => (
                  <tr key={g.id} style={g.active ? undefined : { opacity: 0.55 }}>
                    <td>
                      <GarmentLabel g={g} />
                      {!g.active && <span className="pill" style={{ marginLeft: 8 }}>{t('cat.notInUse')}</span>}
                    </td>
                    <td>{lk.size(g.sizeCategoryId)?.name ?? '—'}</td>
                    <td>{lk.vendor(g.vendorId)?.name ?? '—'}</td>
                    <td className="muted">{g.description}</td>
                    <td>
                      {can.catalog && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setEdit(g)}>
                          {t('cat.edit')}
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
  const t = useT();
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
      title={g ? t('cat.editCode', { code: g.code }) : t('cat.addGarment')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!codeOk || dupe || !name.trim()}
            onClick={async () => {
              const ok = await save(
                () => store.submit('garment.upsert', { id: g?.id ?? uuidv7(), code, name: name.trim(), sizeCategoryId: size || null, vendorId: vendor || null, description: description.trim(), swatch, active }),
                t('cat.garmentSaved'),
              );
              if (ok) onClose();
            }}
          >
            {t('c.save')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('cat.shortCode')} hint={dupe ? t('cat.codeUsed') : t('cat.codeHint')}>
          <input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 16))} />
        </Field>
        <Field label={t('pp.name')}>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('cat.namePh')} />
        </Field>
        <Field label={t('cat.sizeGroup')}>
          <select className="select" value={size} onChange={(e) => setSize(e.target.value)}>
            <option value="">—</option>
            {lk.sizes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('cat.usualVendor')}>
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
      <Field label={t('cat.recognise')} hint={t('cat.recogniseHint')}>
        <textarea className="textarea" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <Field label={t('cat.colour')}>
        <div className="row">
          {SWATCHES.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={t('cat.colourN', { c })}
              aria-pressed={swatch === c}
              onClick={() => setSwatch(c)}
              className="swatch"
              style={{ width: 30, height: 30, borderRadius: 8, background: c, border: 0, cursor: 'pointer', outline: swatch === c ? '3px solid var(--ink)' : 'none', outlineOffset: 2 }}
            />
          ))}
        </div>
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('cat.inUseWorkers')}
      </label>
    </Sheet>
  );
}

function Prices() {
  const { ledger } = useApp();
  const lk = useLookups();
  const can = useCan();
  const t = useT();
  const [edit, setEdit] = useState<{ g: GarmentType; l: Location } | null>(null);
  const today = businessDate();
  const places = lk.locations.filter((l) => l.kind === 'selling' && l.active);
  if (!places.length) return <Empty icon="pin" title={t('cat.noSelling')}>{t('cat.noSellingBody')}</Empty>;
  return (
    <>
      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('c.garment')}</th>
                {places.map((l) => (
                  <th key={l.id} className="n">
                    {t('cat.retailWholesale', { place: l.name })}
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
                            <span className="pill red">{t('cat.noPrice')}</span>
                          )}
                          {can.pricing && (
                            <button className="btn btn-ghost btn-sm" onClick={() => setEdit({ g, l })}>
                              {t('cat.set')}
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
      <p className="hint">{t('cat.priceHint')}</p>
      {edit && <PriceSheet g={edit.g} l={edit.l} onClose={() => setEdit(null)} />}
    </>
  );
}

function PriceSheet({ g, l, onClose }: { g: GarmentType; l: Location; onClose: () => void }) {
  const { ledger } = useApp();
  const t = useT();
  const cur = priceFor((k) => ledger.get(k), g.id, l.id, businessDate());
  const [retail, setRetail] = useState<number | null>(cur?.retail ?? null);
  const [wholesale, setWholesale] = useState<number | null>(cur?.wholesale ?? null);
  const [from, setFrom] = useState(businessDate());
  return (
    <Sheet
      title={t('cat.priceOf', { code: g.code, place: l.name })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!retail}
            onClick={async () => {
              if (await save(() => store.submit('price.set', { id: uuidv7(), garmentTypeId: g.id, locationId: l.id, currency: l.currency, retail: retail ?? 0, wholesale: wholesale || null, effectiveFrom: from }), t('cat.priceSaved'))) onClose();
            }}
          >
            {t('cat.savePrice')}
          </button>
        </>
      }
    >
      {cur && (
        <div className="info-box">
          {rich(t('cat.current', { date: fmtDate(cur.effectiveFrom) }), { amount: <Money amount={cur.retail} currency={cur.currency} /> })}
        </div>
      )}
      <Field label={t('cat.retail', { currency: l.currency })} hint={t('cat.retailHint')}>
        <MoneyInput big currency={l.currency as Currency} value={retail} onChange={setRetail} />
      </Field>
      <Field label={t('cat.wholesale')}>
        <MoneyInput currency={l.currency as Currency} value={wholesale} onChange={setWholesale} />
      </Field>
      {l.currency === 'KMF' && retail ? (
        <p className="hint">
          {wholesale ? t('cat.localBoth', { retail: formatLocalCount(retail), wholesale: formatLocalCount(wholesale) }) : t('cat.localRetail', { retail: formatLocalCount(retail) })}
        </p>
      ) : null}
      <Field label={t('cat.startsOn')}>
        <input type="date" className="input" value={from} onChange={(e) => setFrom(e.target.value)} />
      </Field>
    </Sheet>
  );
}

function Sizes() {
  const lk = useLookups();
  const can = useCan();
  const t = useT();
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
            <Icon name="plus" size={18} /> {t('cat.addSize')}
          </button>
        </div>
      )}
      <section className="card list">
        {lk.sizes.length === 0 && <div className="list-item muted">{t('cat.noSizes')}</div>}
        {lk.sizes.map((s) => (
          <div key={s.id} className="list-item">
            <span style={{ flex: 1 }}>{s.name}</span>
            {!s.active && <span className="pill">{t('cat.notInUse')}</span>}
            {can.catalog && (
              <button className="btn btn-ghost btn-sm" onClick={() => open(s)}>
                {t('cat.edit')}
              </button>
            )}
          </div>
        ))}
      </section>
      {edit && (
        <Sheet
          title={edit === 'new' ? t('cat.addSize') : t('cat.editSize')}
          onClose={() => setEdit(null)}
          footer={
            <button
              className="btn btn-primary"
              disabled={!name.trim()}
              onClick={async () => {
                const ok = await save(
                  () => store.submit('size.upsert', { id: edit === 'new' ? uuidv7() : edit.id, name: name.trim(), sort: edit === 'new' ? lk.sizes.length + 1 : edit.sort, active }),
                  t('pp.saved'),
                );
                if (ok) setEdit(null);
              }}
            >
              {t('c.save')}
            </button>
          }
        >
          <Field label={t('pp.name')} hint={t('cat.sizeHint')}>
            <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </Field>
          <label className="check">
            <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('cat.inUse')}
          </label>
        </Sheet>
      )}
    </>
  );
}

function Places() {
  const lk = useLookups();
  const can = useCan();
  const t = useT();
  const [edit, setEdit] = useState<Location | 'new' | null>(null);
  return (
    <>
      {can.catalog && (
        <div>
          <button className="btn btn-primary" onClick={() => setEdit('new')}>
            <Icon name="plus" size={18} /> {t('cat.addPlace')}
          </button>
        </div>
      )}
      <section className="card list">
        {lk.locations.length === 0 && <div className="list-item muted">{t('cat.noPlaces')}</div>}
        {lk.locations.map((l) => (
          <div key={l.id} className="list-item">
            <Icon name="pin" />
            <span style={{ flex: 1 }}>
              <strong>{l.name}</strong>
              <div className="hint">
                {t('cat.moneyIn', { kind: t(`lbl.locKind.${l.kind}`), currency: l.currency })}
              </div>
            </span>
            {!l.active && <span className="pill">{t('cat.notInUse')}</span>}
            {can.catalog && (
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(l)}>
                {t('cat.edit')}
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
  const t = useT();
  const [name, setName] = useState(l?.name ?? '');
  const [kind, setKind] = useState<(typeof LOCATION_KINDS)[number]>(l?.kind ?? 'selling');
  const [currency, setCurrency] = useState<Currency>(l?.currency ?? 'KMF');
  const [active, setActive] = useState(l?.active ?? true);
  return (
    <Sheet
      title={l ? t('cat.editCode', { code: l.name }) : t('cat.addPlace')}
      onClose={onClose}
      footer={
        <button
          className="btn btn-primary"
          disabled={!name.trim()}
          onClick={async () => {
            if (await save(() => store.submit('location.upsert', { id: l?.id ?? uuidv7(), name: name.trim(), kind, currency, active }), t('cat.placeSaved'))) onClose();
          }}
        >
          {t('c.save')}
        </button>
      }
    >
      <Field label={t('pp.name')}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label={t('cat.usedFor')}>
        <select className="select" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
          {LOCATION_KINDS.map((k) => (
            <option key={k} value={k}>
              {t(`lbl.locKind.${k}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t('cat.moneyHere')} hint={l ? t('cat.moneyHint') : undefined}>
        <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
          {CURRENCY_CODES.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('cat.inUse')}
      </label>
    </Sheet>
  );
}
