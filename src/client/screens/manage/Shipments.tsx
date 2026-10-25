import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { uuidv7 } from '../../../shared/ids';
import { A, K, type Shipment, type ShipmentCost } from '../../../shared/model';
import { CURRENCY_CODES, type Currency } from '../../../shared/money';
import { SHIPMENT_COST_CATEGORIES, SHIPMENT_METHODS } from '../../../shared/ops';
import { businessDate, fmtDate, fmtDateShort, fmtDateTime } from '../../../shared/time';
import { rich, useT } from '../../lib/i18n';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Seg, Sheet, Stepper, save } from '../../ui/kit';
import { LinesEditor, type EditLine } from '../../ui/LinesEditor';
import { VoidButton } from '../../ui/VoidButton';
import { DownloadButton } from '../../ui/Reporting';
import { selectShipments, shipmentsReport, type ShipmentFilter } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';
import { useHoldReload } from '../../lib/update';

const STATUS: Record<Shipment['status'], { tone: string }> = {
  in_transit: { tone: 'lagoon' },
  partial: { tone: 'saffron' },
  received: { tone: 'green' },
  voided: { tone: '' },
};

const pieces = (s: Shipment) => s.lines.reduce((a, l) => a + l.qty, 0);
const activeCosts = (s: Shipment) => s.costs.filter((c) => !c.voided && !c.supersededBy);

function CostSummary({ costs }: { costs: ShipmentCost[] }) {
  const by = new Map<Currency, number>();
  for (const c of costs) by.set(c.currency, (by.get(c.currency) ?? 0) + c.amount);
  if (!by.size) return <span className="muted">—</span>;
  return (
    <span className="stack-sm" style={{ gap: 0, alignItems: 'flex-end' }}>
      {[...by].map(([cur, amt]) => (
        <Money key={cur} amount={amt} currency={cur} />
      ))}
    </span>
  );
}

export function ShipmentsPage() {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [filter, setFilter] = useState<ShipmentFilter>('open');
  const list = useMemo(() => selectShipments(ledger, filter), [ledger, version, filter]);
  const showCosts = user!.caps.includes('costs.view') || user!.caps.includes('shipments');
  return (
    <div className="page">
      <PageHead
        title={t('nav.shipments')}
        lead={t('sh.lead')}
        actions={
          <>
            <Seg value={filter} onChange={setFilter} options={[{ value: 'open', label: t('sh.f.open') }, { value: 'received', label: t('sh.f.received') }, { value: 'all', label: t('range.allShort') }]} />
            <DownloadButton build={() => shipmentsReport(reportCtx(), filter)} />
            {user!.caps.includes('shipments') && (
              <a className="btn btn-primary" href={href('/shipments/new')}>
                <Icon name="plus" size={18} /> {t('sh.dispatch')}
              </a>
            )}
          </>
        }
      />
      <section className="card">
        {list.length === 0 ? (
          <Empty icon="ship" title={filter === 'open' ? t('sh.nothingOnWay') : filter === 'received' ? t('sh.nothingReceived') : t('sh.none')} />
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('sh.label')}</th>
                  <th>{t('sh.route')}</th>
                  <th>{t('sh.how')}</th>
                  <th>{t('sh.sent')}</th>
                  <th className="n">{t('sh.pieces')}</th>
                  {showCosts && <th className="n">{t('sh.costs')}</th>}
                  <th>{t('sh.status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="clickable" onClick={() => navigate(`/shipments/${s.id}`)}>
                    <td className="mono" style={{ fontWeight: 650 }}>
                      {s.code}
                    </td>
                    <td className="nowrap">
                      {lk.locName(s.fromLocationId)} → {lk.locName(s.toLocationId)}
                    </td>
                    <td className="muted">{t(`lbl.method.${s.method}`)}</td>
                    <td className="nowrap">{fmtDateShort(s.date)}</td>
                    <td className="n">{pieces(s)}</td>
                    {showCosts && (
                      <td className="n">
                        <CostSummary costs={activeCosts(s)} />
                      </td>
                    )}
                    <td>
                      <span className={`pill ${STATUS[s.status].tone}`}>{t(`sh.st.${s.status}`)}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function NewShipment() {
  const { ledger } = useApp();
  const lk = useLookups();
  const t = useT();
  const [from, setFrom] = useState(lk.locations.find((l) => l.kind === 'purchasing')?.id ?? lk.locations[0]?.id ?? '');
  const [to, setTo] = useState(lk.locations.find((l) => l.kind === 'selling')?.id ?? lk.locations[1]?.id ?? '');
  const [method, setMethod] = useState<(typeof SHIPMENT_METHODS)[number]>('bus');
  const [code, setCode] = useState('');
  const [carrier, setCarrier] = useState('');
  const [date, setDate] = useState(businessDate());
  const [expected, setExpected] = useState('');
  const [packages, setPackages] = useState<{ label: string; weightKg: string }[]>(() => [{ label: t('sh.sack', { n: 1 }), weightKg: '' }]);
  const [lines, setLines] = useState<EditLine[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  useHoldReload(lines.length > 0 || note !== '' || code !== '' || carrier !== '');
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const autoCode = `${method.toUpperCase()}-${date.slice(5).replace('-', '')}`;
  const valid = from && to && from !== to && lines.length > 0 && lines.every((l) => l.qty > 0);
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHead eyebrow={<a href={href('/shipments')}>{t('sh.back')}</a>} title={t('sh.newTitle')} lead={t('sh.newLead')} />
      <section className="card card-pad stack">
        <div className="form-grid">
          <Field label={t('cv.from')}>
            <select className="select" value={from} onChange={(e) => setFrom(e.target.value)}>
              {lk.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('cv.to')}>
            <select className="select" value={to} onChange={(e) => setTo(e.target.value)}>
              {lk.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('sh.sentOn')}>
            <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('sh.expected')}>
            <input type="date" className="input" value={expected} min={date} onChange={(e) => setExpected(e.target.value)} />
          </Field>
        </div>
        <Field label={t('sh.how')}>
          <Seg value={method} onChange={setMethod} options={SHIPMENT_METHODS.map((m) => ({ value: m, label: t(`lbl.method.${m}`) }))} />
        </Field>
        <div className="form-grid">
          <Field label={t('sh.label')} hint={t('sh.labelHint', { code: autoCode })}>
            <input className="input mono" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder={autoCode} />
          </Field>
          <Field label={t('sh.carrier')}>
            <input className="input" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
          </Field>
        </div>
        {from === to && <div className="error-box">{t('sh.twoPlaces')}</div>}
      </section>
      <section className="card card-pad stack">
        <div className="row-between">
          <span className="section-title">{t('sh.packages')}</span>
          <button className="btn btn-sm" onClick={() => setPackages([...packages, { label: t('sh.sack', { n: packages.length + 1 }), weightKg: '' }])}>
            <Icon name="plus" size={16} /> {t('sh.package')}
          </button>
        </div>
        {packages.map((p, i) => (
          <div key={i} className="row" style={{ flexWrap: 'nowrap' }}>
            <input className="input" value={p.label} onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
            <input className="input" style={{ width: 120 }} inputMode="decimal" placeholder="kg" value={p.weightKg} onChange={(e) => setPackages(packages.map((x, j) => (j === i ? { ...x, weightKg: e.target.value.replace(/[^\d.]/g, '') } : x)))} />
            <button className="icon-btn" aria-label={t('sh.removePackage')} onClick={() => setPackages(packages.filter((_, j) => j !== i))}>
              <Icon name="x" />
            </button>
          </div>
        ))}
      </section>
      <section className="stack">
        <span className="section-title">{t('sh.garmentsIn')}</span>
        <LinesEditor garments={lk.garments} lines={lines} onChange={setLines} available={(gt) => ledger.balance(A.avail(from), gt)} />
      </section>
      <Field label={t('stk.note')}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="sticky-foot">
        <div style={{ fontWeight: 700 }}>{t('c.nPcs', { n: total })}</div>
        <button
          className="btn btn-accent btn-lg"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const id = uuidv7();
            const ok = await save(
              () =>
                store.submit('shipment.dispatch', {
                  id,
                  code: code.trim() || autoCode,
                  fromLocationId: from,
                  toLocationId: to,
                  method,
                  carrier: carrier.trim(),
                  packages: packages.filter((p) => p.label.trim()).map((p) => ({ label: p.label.trim(), weightKg: p.weightKg ? Number(p.weightKg) : null })),
                  lines: lines.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: l.qty })),
                  date,
                  expectedDate: expected || null,
                  note: note.trim(),
                }),
              t('sh.dispatched'),
            );
            setBusy(false);
            if (ok) navigate(`/shipments/${id}`);
          }}
        >
          <Icon name="ship" /> {t('sh.dispatch')}
        </button>
      </div>
    </div>
  );
}

export function ShipmentDetail({ id }: { id: string }) {
  const { ledger, version, user, records } = useApp();
  const lk = useLookups();
  const t = useT();
  const [sheet, setSheet] = useState<'receive' | 'cost' | ShipmentCost | null>(null);
  const s = ledger.get(K.shipment(id)) as Shipment | undefined;
  const history = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.status !== 'rejected' && ((r.op.type === 'shipment.dispatch' && r.op.payload.id === id) || ((r.op.type === 'shipment.receive' || r.op.type === 'shipment.cost') && r.op.payload.shipmentId === id)))
        .sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime)),
    [ledger, version, id],
  );
  if (!s) return <Empty title={t('sh.notFound')} />;
  const can = user!.caps.includes('shipments') && s.status !== 'voided';
  const outstanding = s.lines.reduce((a, l) => a + l.qty - l.received - l.missing, 0);
  const showCosts = user!.caps.includes('costs.view') || user!.caps.includes('shipments');
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/shipments')}>{t('sh.back')}</a>}
        title={
          <span className="row" style={{ gap: 12 }}>
            <span className="mono" style={{ fontSize: '0.8em' }}>
              {s.code}
            </span>
            <span className={`pill ${STATUS[s.status].tone}`}>{t(`sh.st.${s.status}`)}</span>
          </span>
        }
        lead={t('sh.detailLead', {
          from: lk.locName(s.fromLocationId),
          to: lk.locName(s.toLocationId),
          method: t(`lbl.method.${s.method}`),
          carrier: s.carrier ? ` (${s.carrier})` : '',
          date: fmtDate(s.date),
          expected: s.expectedDate ? t('sh.expectedOn', { date: fmtDate(s.expectedDate) }) : '',
        })}
        actions={
          <>
            {can && outstanding > 0 && (
              <button className="btn btn-primary" onClick={() => setSheet('receive')}>
                <Icon name="check" size={18} /> {t('sh.recordArrival')}
              </button>
            )}
            {can && (
              <button className="btn" onClick={() => setSheet('cost')}>
                <Icon name="receipt" size={18} /> {t('sh.addCost')}
              </button>
            )}
          </>
        }
      />
      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('c.garment')}</th>
                <th className="n">{t('sh.sent')}</th>
                <th className="n">{t('sh.arrived')}</th>
                <th className="n">{t('sh.missing')}</th>
                <th className="n">{t('sh.stillExpected')}</th>
              </tr>
            </thead>
            <tbody>
              {s.lines.map((l) => (
                <tr key={l.garmentTypeId}>
                  <td>
                    <GarmentLabel g={lk.garment(l.garmentTypeId)} />
                  </td>
                  <td className="n">{l.qty}</td>
                  <td className="n">{l.received}</td>
                  <td className="n" style={l.missing ? { color: 'var(--hibiscus)', fontWeight: 700 } : undefined}>
                    {l.missing}
                  </td>
                  <td className="n">{l.qty - l.received - l.missing}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <div className="grid cols-2">
        {s.packages.length > 0 && (
          <section className="card">
            <div className="card-head">
              <span className="section-title">{t('sh.packages')}</span>
              <span className="muted">{s.packages.reduce((a, p) => a + (p.weightKg ?? 0), 0) || '—'} kg</span>
            </div>
            <div className="list" style={{ marginTop: 8 }}>
              {s.packages.map((p, i) => (
                <div key={i} className="list-item">
                  <span style={{ flex: 1 }}>{p.label}</span>
                  <span className="muted">{p.weightKg ? `${p.weightKg} kg` : ''}</span>
                </div>
              ))}
            </div>
          </section>
        )}
        {showCosts && (
          <section className="card">
            <div className="card-head">
              <span className="section-title">{t('sh.costs')}</span>
              <CostSummary costs={activeCosts(s)} />
            </div>
            <div className="list" style={{ marginTop: 8 }}>
              {s.costs.length === 0 && <div className="list-item muted">{t('sh.noCosts')}</div>}
              {s.costs.map((c) => (
                <div key={c.id} className="list-item" style={c.voided || c.supersededBy ? { opacity: 0.5 } : undefined}>
                  <span style={{ flex: 1 }}>
                    {t(`lbl.shipCost.${c.category}`)}
                    {c.description && <span className="muted"> · {c.description}</span>}
                    <div className="row" style={{ gap: 6, marginTop: 2 }}>
                      {c.status === 'estimated' && !c.supersededBy && <span className="pill saffron">{t('sh.estimate')}</span>}
                      {c.supersededBy && <span className="pill">{t('sh.replaced')}</span>}
                      {c.voided && <span className="pill">{t('c.cancelled')}</span>}
                    </div>
                  </span>
                  <span style={c.voided || c.supersededBy ? { textDecoration: 'line-through' } : undefined}>
                    <Money amount={c.amount} currency={c.currency} />
                  </span>
                  {can && c.status === 'estimated' && !c.supersededBy && !c.voided && (
                    <button className="btn btn-sm" onClick={() => setSheet(c)}>
                      {t('sh.enterActual')}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('c.history')}</span>
        </div>
        <div className="card-body timeline">
          {history.map((r) => (
            <div key={r.op.id} className="tl-item">
              <span className="tl-time">{fmtDateShort(businessDate(r.op.deviceTime))}</span>
              <span className="tl-rail">
                <span className={`tl-knot ${r.voidedBy ? 'muted' : 'lagoon'}`} />
              </span>
              <div className="row-between">
                <span style={r.voidedBy ? { textDecoration: 'line-through', color: 'var(--ink-3)' } : undefined}>
                  {describeOp(r.op, lk, ledger, t)}
                  <span className="muted">
                    {' '}
                    · {records.get(r.op.id)?.actorName ?? lk.personName(r.op.actorId)} · {fmtDateTime(r.op.deviceTime)}
                  </span>
                </span>
                <VoidButton opId={r.op.id} label={t('void.cancel')} />
              </div>
            </div>
          ))}
        </div>
      </section>
      {sheet === 'receive' && <ReceiveSheet s={s} onClose={() => setSheet(null)} />}
      {sheet === 'cost' && <CostSheet s={s} onClose={() => setSheet(null)} />}
      {sheet && typeof sheet === 'object' && <CostSheet s={s} replaces={sheet} onClose={() => setSheet(null)} />}
    </div>
  );
}

function ReceiveSheet({ s, onClose }: { s: Shipment; onClose: () => void }) {
  const lk = useLookups();
  const t = useT();
  const open = s.lines.filter((l) => l.qty - l.received - l.missing > 0);
  const [v, setV] = useState<Record<string, { received: number; missing: number }>>(Object.fromEntries(open.map((l) => [l.garmentTypeId, { received: l.qty - l.received - l.missing, missing: 0 }])));
  const [date, setDate] = useState(businessDate());
  const [note, setNote] = useState('');
  const lines = open.map((l) => ({ garmentTypeId: l.garmentTypeId, ...(v[l.garmentTypeId] ?? { received: 0, missing: 0 }) })).filter((l) => l.received + l.missing > 0);
  const anyMissing = lines.some((l) => l.missing > 0);
  return (
    <Sheet
      title={t('sh.arrivalOf', { code: s.code })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!lines.length || (anyMissing && !note.trim())}
            onClick={async () => {
              if (await save(() => store.submit('shipment.receive', { shipmentId: s.id, date, lines, note: note.trim() }), t('sh.receivedAt', { place: lk.locName(s.toLocationId) }))) onClose();
            }}
          >
            {t('sh.saveArrival')}
          </button>
        </>
      }
    >
      <p className="soft">{t('sh.arrivalLead')}</p>
      <Field label={t('sh.arrivedOn')}>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {open.map((l) => {
        const left = l.qty - l.received - l.missing;
        const cur = v[l.garmentTypeId] ?? { received: 0, missing: 0 };
        return (
          <div key={l.garmentTypeId} className="card card-pad stack">
            <div className="row-between">
              <GarmentLabel g={lk.garment(l.garmentTypeId)} />
              <span className="muted">{t('sh.nExpected', { n: left })}</span>
            </div>
            <div className="form-grid">
              <Field label={t('sh.arrived')}>
                <Stepper value={cur.received} max={left - cur.missing} onChange={(n) => setV({ ...v, [l.garmentTypeId]: { ...cur, received: n } })} />
              </Field>
              <Field label={t('sh.missingLost')}>
                <Stepper value={cur.missing} max={left - cur.received} onChange={(n) => setV({ ...v, [l.garmentTypeId]: { ...cur, missing: n } })} />
              </Field>
            </div>
          </div>
        );
      })}
      <Field label={anyMissing ? t('sh.whatMissing') : t('stk.note')}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

function CostSheet({ s, replaces, onClose }: { s: Shipment; replaces?: ShipmentCost; onClose: () => void }) {
  const t = useT();
  const [category, setCategory] = useState<(typeof SHIPMENT_COST_CATEGORIES)[number]>(replaces?.category ?? (s.method === 'air' ? 'air_baggage' : 'bus_fare'));
  const [description, setDescription] = useState(replaces?.description ?? '');
  const [currency, setCurrency] = useState<Currency>(replaces?.currency ?? 'KES');
  const [amount, setAmount] = useState<number | null>(null);
  const [status, setStatus] = useState<'actual' | 'estimated'>('actual');
  const [date, setDate] = useState(replaces?.date ?? businessDate());
  const [reference, setReference] = useState('');
  return (
    <Sheet
      title={replaces ? t('sh.actualTitle') : t('sh.costFor', { code: s.code })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!amount}
            onClick={async () => {
              const ok = await save(
                () =>
                  store.submit('shipment.cost', {
                    shipmentId: s.id,
                    category,
                    description: description.trim(),
                    amount: amount ?? 0,
                    currency,
                    status: replaces ? 'actual' : status,
                    date,
                    reference: reference.trim(),
                    supersedesId: replaces?.id ?? null,
                  }),
                t('sh.costSaved'),
              );
              if (ok) onClose();
            }}
          >
            {t('sh.saveCost')}
          </button>
        </>
      }
    >
      {replaces && (
        <div className="note-box">
          {rich(t('sh.replacesEstimate'), { amount: <Money amount={replaces.amount} currency={replaces.currency} /> })}
        </div>
      )}
      <Field label={t('sh.kindOfCost')}>
        <select className="select" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
          {SHIPMENT_COST_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {t(`lbl.shipCost.${c}`)}
            </option>
          ))}
        </select>
      </Field>
      <div className="form-grid">
        <Field label={t('sd.amount')}>
          <MoneyInput currency={currency} value={amount} onChange={setAmount} />
        </Field>
        <Field label={t('ex.currency')} hint={t('sh.currencyHint')}>
          <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
        <Field label={t('ex.date')}>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      {!replaces && (
        <Field label={t('sh.realQ')}>
          <Seg value={status} onChange={setStatus} options={[{ value: 'actual', label: t('sh.actualPaid') }, { value: 'estimated', label: t('sh.estimate') }]} />
        </Field>
      )}
      <Field label={t('sh.description')}>
        <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('sh.descPh')} />
      </Field>
      <Field label={t('sh.reference')}>
        <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value)} />
      </Field>
    </Sheet>
  );
}
