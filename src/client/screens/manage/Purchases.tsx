import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { uuidv7 } from '../../../shared/ids';
import { purchaseBalances, purchaseSummary, vendorAccounts, type PurchaseBalance } from '../../../shared/queries';
import { purchasesReport, selectPurchases, vendorsReport, type PurchaseFilter } from '../../../shared/reports';
import { K, type Purchase, type Vendor } from '../../../shared/model';
import { CURRENCY_CODES, formatMoney, lineTotal, type Currency } from '../../../shared/money';
import { PAYMENT_METHODS, PURCHASE_INTAKES } from '../../../shared/ops';
import { businessDate, fmtDate, fmtDateShort, fmtDateTime } from '../../../shared/time';
import { rich, useT } from '../../lib/i18n';
import { reportCtx } from '../../lib/report-ctx';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Qty, Seg, Sheet, Stepper, save } from '../../ui/kit';
import { LinesEditor, type EditLine } from '../../ui/LinesEditor';
import { DownloadButton } from '../../ui/Reporting';
import { VoidButton } from '../../ui/VoidButton';

function StatusPills({ p, balance }: { p: Purchase; balance: PurchaseBalance | undefined }) {
  const t = useT();
  const s = purchaseSummary(p);
  const owed = balance?.balance ?? 0;
  if (p.status === 'voided') return <span className="pill">{t('c.cancelled')}</span>;
  return (
    <span className="row" style={{ gap: 6 }}>
      {s.pendingInspection > 0 && <span className="pill lagoon">{t('pu.nInspect', { n: s.pendingInspection })}</span>}
      {s.awaitingCollection > 0 && <span className="pill indigo">{t('pu.nCollect', { n: s.awaitingCollection })}</span>}
      {s.rejectedNotReturned > 0 && <span className="pill red">{t('pu.nRejects', { n: s.rejectedNotReturned })}</span>}
      {owed > 0 && <span className="pill saffron">{rich(t('pu.owe'), { amount: <Money amount={owed} currency={p.currency} /> })}</span>}
      {owed <= 0 && s.payable > 0 && <span className="pill green">{t('pu.paid')}</span>}
      {s.pendingInspection + s.awaitingCollection + s.rejectedNotReturned === 0 && owed <= 0 && <span className="pill green">{t('pu.complete')}</span>}
    </span>
  );
}

export function PurchasesPage() {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [filter, setFilter] = useState<PurchaseFilter>({ status: 'open', vendorId: null, payment: 'any', from: null, to: null });
  const balances = useMemo(() => purchaseBalances(ledger), [ledger, version]);
  const list = useMemo(() => selectPurchases(ledger, balances, filter), [ledger, balances, filter]);
  return (
    <div className="page">
      <PageHead
        title={t('nav.purchases')}
        lead={t('pu.lead')}
        actions={
          <>
            <Seg value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: 'open', label: t('pu.open') }, { value: 'all', label: t('range.allShort') }]} />
            <select className="select" style={{ width: 'auto' }} aria-label={t('pu.vendor')} value={filter.vendorId ?? ''} onChange={(e) => setFilter({ ...filter, vendorId: e.target.value || null })}>
              <option value="">{t('pu.allVendors')}</option>
              {lk.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select className="select" style={{ width: 'auto' }} aria-label={t('pu.payment')} value={filter.payment} onChange={(e) => setFilter({ ...filter, payment: e.target.value as PurchaseFilter['payment'] })}>
              <option value="any">{t('pu.paidOrNot')}</option>
              <option value="owed">{t('pu.stillOwed')}</option>
              <option value="paid">{t('pu.fullyPaid')}</option>
            </select>
            <DownloadButton build={() => purchasesReport(reportCtx(), filter)} />
            {user!.caps.includes('purchasing') && (
              <a className="btn btn-primary" href={href('/purchases/new')}>
                <Icon name="plus" size={18} /> {t('pu.new')}
              </a>
            )}
          </>
        }
      />
      <section className="card">
        {list.length === 0 ? (
          <Empty icon="bag" title={filter.vendorId || filter.payment !== 'any' ? t('pu.noMatch') : filter.status === 'open' ? t('pu.nothingOpen') : t('pu.none')}>
            {filter.vendorId || filter.payment !== 'any' ? t('pu.tryAll') : filter.status === 'open' ? t('pu.allDone') : t('pu.recordFirst')}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('ex.date')}</th>
                  <th>{t('pu.vendor')}</th>
                  <th>{t('sh.how')}</th>
                  <th className="n">{t('sh.pieces')}</th>
                  <th className="n">{t('pu.value')}</th>
                  <th>{t('sh.status')}</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const s = purchaseSummary(p);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/purchases/${p.id}`)}>
                      <td className="nowrap">{fmtDateShort(p.date)}</td>
                      <td>{lk.vendor(p.vendorId)?.name}</td>
                      <td className="muted">{t(`lbl.intake.${p.intake}`)}</td>
                      <td className="n">{s.pieces}</td>
                      <td className="n">
                        <Money amount={p.lines.reduce((a, l) => a + lineTotal(l.qty, l.unitCost), 0)} currency={p.currency} />
                      </td>
                      <td>
                        <StatusPills p={p} balance={balances.get(p.id)} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function NewPurchase() {
  const lk = useLookups();
  const t = useT();
  const buying = lk.locations.filter((l) => l.active && l.kind === 'purchasing');
  const [vendorId, setVendorId] = useState(lk.vendors.find((v) => v.active)?.id ?? '');
  const [locationId, setLocationId] = useState(buying[0]?.id ?? lk.locations[0]?.id ?? '');
  const [date, setDate] = useState(businessDate());
  const [intake, setIntake] = useState<(typeof PURCHASE_INTAKES)[number]>('collected');
  const loc = lk.loc(locationId);
  const [currency, setCurrency] = useState<Currency>((loc?.currency as Currency) ?? 'KES');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [note, setNote] = useState('');
  const [payNow, setPayNow] = useState<number | null>(null);
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('mpesa');
  const [reference, setReference] = useState('');
  const [busy, setBusy] = useState(false);
  const vendorGarments = lk.garments.filter((g) => !g.vendorId || g.vendorId === vendorId);
  const total = lines.reduce((s, l) => s + lineTotal(l.qty, l.unitCost ?? 0), 0);
  const valid = vendorId && locationId && lines.length > 0 && lines.every((l) => l.qty > 0 && l.unitCost !== null && l.unitCost !== undefined);

  if (!lk.vendors.length || !lk.garments.length)
    return (
      <div className="page">
        <PageHead title={t('pu.new')} />
        <Empty icon="store" title={t('pu.addFirst')}>
          {rich(t('pu.goTo'), { vendors: <a href={href('/vendors')}>{t('nav.vendors')}</a>, catalogue: <a href={href('/catalogue')}>{t('nav.catalogue')}</a> })}
        </Empty>
      </div>
    );

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHead eyebrow={<a href={href('/purchases')}>{t('pu.back')}</a>} title={t('pu.new')} />
      <section className="card card-pad stack">
        <div className="form-grid">
          <Field label={t('pu.vendor')}>
            <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {lk.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.active ? '' : t('pu.inactive')}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('ex.date')}>
            <input type="date" className="input" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label={t('pu.goodsTo')}>
            <select
              className="select"
              value={locationId}
              onChange={(e) => {
                setLocationId(e.target.value);
                const c = lk.loc(e.target.value)?.currency;
                if (c) setCurrency(c);
              }}
            >
              {lk.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t('ex.currency')}>
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCY_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label={t('pu.whatHappened')}>
          <Seg
            value={intake}
            onChange={setIntake}
            options={PURCHASE_INTAKES.map((i) => ({ value: i, label: t(`lbl.intake.${i}`) }))}
          />
        </Field>
        <p className="hint">
          {t(`pu.hint.${intake}`)}
        </p>
      </section>
      <section className="stack">
        <span className="section-title">{t('pu.garmentsCount')}</span>
        <LinesEditor garments={vendorGarments.length ? vendorGarments : lk.garments} lines={lines} onChange={setLines} costCurrency={currency} />
      </section>
      {intake !== 'inspection' && (
        <section className="card card-pad stack">
          <span className="section-title">{t('pu.payNow')}</span>
          <div className="form-grid">
            <Field label={t('pu.amountPaid')}>
              <MoneyInput currency={currency} value={payNow} onChange={setPayNow} />
            </Field>
            <Field label={t('pu.paidBy')}>
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {t(`lbl.payment.${m}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('pu.refMpesa')}>
              <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} />
            </Field>
          </div>
        </section>
      )}
      <Field label={t('stk.note')}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="sticky-foot">
        <div>
          <div style={{ fontWeight: 700 }}>
            {t('c.nPcs', { n: lines.reduce((s, l) => s + l.qty, 0) })} · <Money amount={total} currency={currency} />
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>{intake === 'inspection' ? t('pu.owedAccepted') : t('pu.owedVendor')}</div>
        </div>
        <button
          className="btn btn-accent btn-lg"
          disabled={!valid || busy}
          onClick={async () => {
            setBusy(true);
            const id = uuidv7();
            const ok = await save(
              () =>
                store.submit('purchase.record', {
                  id,
                  vendorId,
                  locationId,
                  date,
                  currency,
                  intake,
                  lines: lines.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: l.qty, unitCost: l.unitCost ?? 0 })),
                  note: note.trim(),
                }),
              t('pu.saved'),
            );
            if (ok && payNow && intake !== 'inspection') {
              await save(() => store.submit('vendor.payment', { vendorId, purchaseId: id, date, amount: payNow, currency, method, reference, note: '' }), t('pu.paySaved'));
            }
            setBusy(false);
            if (ok) navigate(`/purchases/${id}`);
          }}
        >
          <Icon name="check" /> {t('pu.save')}
        </button>
      </div>
    </div>
  );
}

type Action = 'inspect' | 'collect' | 'return' | 'pay' | null;

export function PurchaseDetail({ id }: { id: string }) {
  const { ledger, version, user, records } = useApp();
  const lk = useLookups();
  const t = useT();
  const [action, setAction] = useState<Action>(null);
  const p = ledger.get(K.purchase(id)) as Purchase | undefined;
  const history = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.status !== 'rejected')
        .filter((r) => {
          const pl = r.op.payload as { id?: string; purchaseId?: string | null };
          if (r.op.type === 'purchase.record') return pl.id === id;
          if (r.op.type === 'op.void') return false;
          return pl.purchaseId === id;
        })
        .sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime)),
    [ledger, version, id],
  );
  const balance = useMemo(() => purchaseBalances(ledger).get(id), [ledger, version, id]);
  if (!p) return <Empty title={t('pu.notFound')} />;
  const s = purchaseSummary(p);
  const owed = balance?.balance ?? 0;
  const paid = balance?.paid ?? 0;
  const can = user!.caps.includes('purchasing') && p.status === 'active';
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/purchases')}>{t('pu.back')}</a>}
        title={`${lk.vendor(p.vendorId)?.name ?? t('pu.vendor')} · ${fmtDate(p.date)}`}
        lead={
          <>
            {t(`lbl.intake.${p.intake}`)} · {t('pu.toPlace', { place: lk.locName(p.locationId) })}
            {p.note && <> · “{p.note}”</>}
          </>
        }
        actions={
          <>
            {can && s.pendingInspection > 0 && (
              <button className="btn btn-primary" onClick={() => setAction('inspect')}>
                <Icon name="inspect" size={18} /> {t('pu.inspect')}
              </button>
            )}
            {can && s.awaitingCollection > 0 && (
              <button className="btn btn-primary" onClick={() => setAction('collect')}>
                <Icon name="in" size={18} /> {t('pu.collect')}
              </button>
            )}
            {can && s.rejectedNotReturned > 0 && (
              <button className="btn" onClick={() => setAction('return')}>
                {t('pu.returnRejects')}
              </button>
            )}
            {user!.caps.includes('payments') && p.status === 'active' && (
              <button className="btn" onClick={() => setAction('pay')}>
                <Icon name="wallet" size={18} /> {t('pu.recordPayment')}
              </button>
            )}
          </>
        }
      />
      <div className="grid cols-4">
        <div className="card stat">
          <span className="eyebrow">{t('pu.delivered')}</span>
          <span className="stat-value">{s.pieces}</span>
          <span className="stat-sub">{t('pu.onRecord')}</span>
        </div>
        {p.intake === 'inspection' && (
          <div className="card stat">
            <span className="eyebrow">{t('pu.accRej')}</span>
            <span className="stat-value">
              {s.accepted} · {s.rejected}
            </span>
            <span className="stat-sub">{t('pu.stillInspect', { n: s.pendingInspection })}</span>
          </div>
        )}
        <div className="card stat">
          <span className="eyebrow">{t('pu.weOwe')}</span>
          <span className="stat-value">
            <Money amount={s.payable} currency={p.currency} />
          </span>
          <span className="stat-sub">{p.intake === 'inspection' ? t('pu.forAccepted') : t('pu.forPurchase')}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">{t('pu.balance')}</span>
          <span className="stat-value" style={{ color: owed > 0 ? 'var(--saffron-ink)' : undefined }}>
            <Money amount={owed} currency={p.currency} />
          </span>
          <span className="stat-sub">{rich(t('pu.paidAmt'), { amount: <Money amount={paid} currency={p.currency} /> })}</span>
        </div>
      </div>
      {balance && balance.allocations.length > 0 && (
        <section className="card">
          <div className="card-head">
            <span className="section-title">{t('pu.paymentsFor')}</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {balance.allocations.map((a, i) => (
              <div key={`${a.opId}-${i}`} className="list-item">
                <span className="nowrap" style={{ width: 70 }}>
                  {fmtDateShort(a.date)}
                </span>
                <span style={{ flex: 1 }}>
                  {t(`lbl.payment.${a.method}`)} {a.reference && <span className="mono muted">{a.reference}</span>}
                  {!a.linked && <div className="hint">{t('pu.appliedOldest')}</div>}
                  {records.get(a.opId)?.status === 'pending' && <span className="pill saffron">{t('days.notSynced')}</span>}
                </span>
                <Money amount={a.amount} currency={p.currency} strong />
              </div>
            ))}
          </div>
        </section>
      )}
      <section className="card">
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>{t('c.garment')}</th>
                <th className="n">{t('pu.qty')}</th>
                <th className="n">{t('pu.costEach')}</th>
                {p.intake === 'inspection' && (
                  <>
                    <th className="n">{t('pu.accepted')}</th>
                    <th className="n">{t('pu.rejected')}</th>
                    <th className="n">{t('pu.returned')}</th>
                    <th>{t('pu.progress')}</th>
                  </>
                )}
                {p.intake === 'awaiting' && <th className="n">{t('pu.collected')}</th>}
              </tr>
            </thead>
            <tbody>
              {p.lines.map((l) => (
                <tr key={l.garmentTypeId}>
                  <td>
                    <GarmentLabel g={lk.garment(l.garmentTypeId)} />
                  </td>
                  <td className="n">{l.qty}</td>
                  <td className="n">
                    <Money amount={l.unitCost} currency={p.currency} />
                  </td>
                  {p.intake === 'inspection' && (
                    <>
                      <td className="n">{l.accepted}</td>
                      <td className="n">{l.rejected}</td>
                      <td className="n">{l.returned}</td>
                      <td>
                        <div className="bar" title={t('pu.progressTitle', { a: l.accepted, r: l.rejected, p: l.qty - l.accepted - l.rejected })}>
                          <span style={{ width: `${(l.accepted / l.qty) * 100}%`, background: 'var(--mangrove)' }} />
                          <span style={{ width: `${(l.rejected / l.qty) * 100}%`, background: 'var(--hibiscus)' }} />
                        </div>
                      </td>
                    </>
                  )}
                  {p.intake === 'awaiting' && (
                    <td className="n">
                      {l.collected} / {l.qty}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('c.history')}</span>
        </div>
        <div className="card-body">
          <div className="timeline">
            {history.map((r) => (
              <div key={r.op.id} className="tl-item">
                <span className="tl-time">{fmtDateShort(businessDate(r.op.deviceTime))}</span>
                <span className="tl-rail">
                  <span className={`tl-knot ${r.voidedBy ? 'muted' : r.op.type === 'vendor.payment' ? 'green' : ''}`} />
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
        </div>
      </section>
      {action === 'inspect' && <InspectSheet p={p} onClose={() => setAction(null)} />}
      {action === 'collect' && <QtySheet p={p} kind="collect" onClose={() => setAction(null)} />}
      {action === 'return' && <QtySheet p={p} kind="return" onClose={() => setAction(null)} />}
      {action === 'pay' && <PaymentSheet vendorId={p.vendorId} purchase={p} owed={owed} onClose={() => setAction(null)} />}
    </div>
  );
}

function InspectSheet({ p, onClose }: { p: Purchase; onClose: () => void }) {
  const lk = useLookups();
  const t = useT();
  const pending = p.lines.filter((l) => l.qty - l.accepted - l.rejected > 0);
  const [v, setV] = useState<Record<string, { accepted: number; rejected: number; reason: string }>>({});
  const [date, setDate] = useState(businessDate());
  const lines = pending.map((l) => ({ garmentTypeId: l.garmentTypeId, accepted: v[l.garmentTypeId]?.accepted ?? 0, rejected: v[l.garmentTypeId]?.rejected ?? 0, reason: v[l.garmentTypeId]?.reason ?? '' }));
  const any = lines.some((l) => l.accepted + l.rejected > 0);
  return (
    <Sheet
      title={t('pu.inspectTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!any}
            onClick={async () => {
              if (await save(() => store.submit('purchase.inspect', { purchaseId: p.id, date, lines: lines.filter((l) => l.accepted + l.rejected > 0), note: '' }), t('pu.inspectSaved'))) onClose();
            }}
          >
            {t('pu.saveInspect')}
          </button>
        </>
      }
    >
      <p className="soft">{t('pu.inspectLead')}</p>
      <Field label={t('ex.date')}>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      {pending.map((l) => {
        const left = l.qty - l.accepted - l.rejected;
        const cur = v[l.garmentTypeId] ?? { accepted: 0, rejected: 0, reason: '' };
        const set = (patch: Partial<typeof cur>) => setV({ ...v, [l.garmentTypeId]: { ...cur, ...patch } });
        return (
          <div key={l.garmentTypeId} className="card card-pad stack">
            <div className="row-between">
              <GarmentLabel g={lk.garment(l.garmentTypeId)} />
              <span className="muted">{t('pu.nWaiting', { n: left })}</span>
            </div>
            <div className="form-grid">
              <Field label={t('pu.accepted')}>
                <Stepper value={cur.accepted} max={left - cur.rejected} onChange={(n) => set({ accepted: n })} />
              </Field>
              <Field label={t('pu.rejected')}>
                <Stepper value={cur.rejected} max={left - cur.accepted} onChange={(n) => set({ rejected: n })} />
              </Field>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ accepted: left - cur.rejected })}>
              {t('pu.acceptRest')}
            </button>
            {cur.rejected > 0 && <input className="input" placeholder={t('pu.whyRejected')} value={cur.reason} onChange={(e) => set({ reason: e.target.value })} />}
          </div>
        );
      })}
    </Sheet>
  );
}

function QtySheet({ p, kind, onClose }: { p: Purchase; kind: 'collect' | 'return'; onClose: () => void }) {
  const lk = useLookups();
  const t = useT();
  const avail = (l: Purchase['lines'][number]) => (kind === 'collect' ? l.qty - l.collected : l.rejected - l.returned);
  const open = p.lines.filter((l) => avail(l) > 0);
  const [q, setQ] = useState<Record<string, number>>({});
  const [date, setDate] = useState(businessDate());
  const lines = open.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: q[l.garmentTypeId] ?? 0 })).filter((l) => l.qty > 0);
  return (
    <Sheet
      title={kind === 'collect' ? t('pu.collectTitle') : t('pu.returnTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!lines.length}
            onClick={async () => {
              const ok = await save(
                () => (kind === 'collect' ? store.submit('purchase.collect', { purchaseId: p.id, date, lines, note: '' }) : store.submit('purchase.return', { purchaseId: p.id, date, lines, note: '' })),
                kind === 'collect' ? t('pu.collectSaved') : t('pu.returnSaved'),
              );
              if (ok) onClose();
            }}
          >
            {t('c.save')}
          </button>
        </>
      }
    >
      <Field label={t('ex.date')}>
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="card">
        {open.map((l) => (
          <div key={l.garmentTypeId} className="garment-row">
            <div className="stack-sm">
              <GarmentLabel g={lk.garment(l.garmentTypeId)} />
              <span className="hint">{t('pu.nLeft', { n: avail(l) })}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setQ({ ...q, [l.garmentTypeId]: avail(l) })}>
                {t('sd.all')}
              </button>
              <Stepper value={q[l.garmentTypeId] ?? 0} max={avail(l)} onChange={(n) => setQ({ ...q, [l.garmentTypeId]: n })} />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}

export function PaymentSheet({ vendorId, purchase, owed, onClose }: { vendorId: string; purchase?: Purchase; owed?: number; onClose: () => void }) {
  const { ledger } = useApp();
  const t = useT();
  const [amount, setAmount] = useState<number | null>(purchase ? Math.max(0, owed ?? 0) || null : null);
  const [currency, setCurrency] = useState<Currency>(purchase?.currency ?? 'KES');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('mpesa');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(businessDate());
  const [note, setNote] = useState('');
  // From the vendor page: which purchase does this pay? Default: oldest unpaid first.
  const [forPurchase, setForPurchase] = useState<string>('');
  const open = useMemo(
    () => (purchase ? [] : (vendorAccounts(ledger).find((a) => a.vendorId === vendorId && a.currency === currency)?.purchases.filter((pb) => pb.balance > 0) ?? [])),
    [ledger, vendorId, currency, purchase],
  );
  const chosen = purchase?.id ?? (forPurchase || null);
  return (
    <Sheet
      title={t('pu.payTitle')}
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
              if (await save(() => store.submit('vendor.payment', { vendorId, purchaseId: chosen, date, amount: amount ?? 0, currency, method, reference, note }), t('pu.paySaved'))) onClose();
            }}
          >
            {t('pu.savePay')}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label={t('sd.amount')}>
          <MoneyInput big currency={currency} value={amount} onChange={setAmount} />
        </Field>
        {!purchase && (
          <Field label={t('ex.currency')}>
            <select
              className="select"
              value={currency}
              onChange={(e) => {
                setCurrency(e.target.value as Currency);
                setForPurchase('');
              }}
            >
              {CURRENCY_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        )}
        <Field label={t('pu.paidBy')}>
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {t(`lbl.payment.${m}`)}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('ex.date')}>
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label={t('pu.reference')}>
          <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder={t('pu.mpesaCode')} />
        </Field>
      </div>
      {!purchase && (
        <Field label={t('pu.payFor')} hint={forPurchase ? undefined : t('pu.payForHint')}>
          <select className="select" value={forPurchase} onChange={(e) => setForPurchase(e.target.value)}>
            <option value="">{t('pu.oldestFirst')}</option>
            {open.map((pb) => {
              const pur = ledger.get(K.purchase(pb.purchaseId)) as Purchase | undefined;
              return (
                <option key={pb.purchaseId} value={pb.purchaseId}>
                  {t('pu.optOwe', { what: pur ? `${fmtDate(pur.date)} · ${t('c.nPcs', { n: purchaseSummary(pur).pieces })}` : t('pu.purchase'), amount: formatMoney(pb.currency, pb.balance) })}
                </option>
              );
            })}
          </select>
        </Field>
      )}
      <Field label={t('stk.note')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ---------------- Vendors ---------------- */

export function VendorsPage() {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [edit, setEdit] = useState<Vendor | 'new' | null>(null);
  const balances = useMemo(() => vendorAccounts(ledger), [ledger, version]);
  const purchases = useMemo(() => ledger.list<Purchase>('purchase'), [ledger, version]);
  return (
    <div className="page">
      <PageHead
        title={t('nav.vendors')}
        lead={t('vd.lead')}
        actions={
          <>
            <DownloadButton build={() => vendorsReport(reportCtx())} />
            {user!.caps.includes('catalog.manage') && (
              <button className="btn btn-primary" onClick={() => setEdit('new')}>
                <Icon name="plus" size={18} /> {t('vd.add')}
              </button>
            )}
          </>
        }
      />
      <section className="card">
        {lk.vendors.length === 0 ? (
          <Empty icon="store" title={t('vd.none')} />
        ) : (
          <div className="list">
            {lk.vendors.map((v) => {
              const bs = balances.filter((b) => b.vendorId === v.id && b.balance !== 0);
              const last = purchases.filter((p) => p.vendorId === v.id && p.status === 'active').sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <a key={v.id} className="list-item" href={href(`/vendors/${v.id}`)}>
                  <span style={{ flex: 1 }}>
                    <strong>{v.name}</strong> {!v.active && <span className="pill">{t('vd.inactive')}</span>}
                    <div className="hint">
                      {v.notes || '—'}
                      {last ? t('vd.lastPurchase', { date: fmtDateShort(last.date) }) : ''}
                    </div>
                  </span>
                  {bs.map((b) => (
                    <span key={b.currency} className={`pill ${b.balance > 0 ? 'saffron' : 'green'}`}>
                      {rich(t(b.balance > 0 ? 'vd.weOweAmt' : 'vd.creditAmt'), { amount: <Money amount={Math.abs(b.balance)} currency={b.currency} /> })}
                    </span>
                  ))}
                  <Icon name="right" size={16} />
                </a>
              );
            })}
          </div>
        )}
      </section>
      {edit && <VendorSheet vendor={edit === 'new' ? null : edit} onClose={() => setEdit(null)} />}
    </div>
  );
}

function VendorSheet({ vendor, onClose }: { vendor: Vendor | null; onClose: () => void }) {
  const t = useT();
  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [active, setActive] = useState(vendor?.active ?? true);
  return (
    <Sheet
      title={vendor ? t('vd.edit') : t('vd.add')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={async () => {
              if (await save(() => store.submit('vendor.upsert', { id: vendor?.id ?? uuidv7(), name: name.trim(), phone: phone.trim(), notes: notes.trim(), active }), t('vd.saved'))) onClose();
            }}
          >
            {t('c.save')}
          </button>
        </>
      }
    >
      <Field label={t('pp.name')}>
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder={t('vd.namePh')} />
      </Field>
      <Field label={t('vd.phone')}>
        <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label={t('vd.notes')}>
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> {t('vd.stillBuying')}
      </label>
    </Sheet>
  );
}

export function VendorDetail({ id }: { id: string }) {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const v = lk.vendor(id);
  const purchases = useMemo(() => ledger.list<Purchase>('purchase').filter((p) => p.vendorId === id).sort((a, b) => b.date.localeCompare(a.date)), [ledger, version, id]);
  const payments = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.op.type === 'vendor.payment' && r.op.payload.vendorId === id && r.status !== 'rejected')
        .sort((a, b) => b.op.deviceTime.localeCompare(a.op.deviceTime)),
    [ledger, version, id],
  );
  const balances = useMemo(() => vendorAccounts(ledger).filter((b) => b.vendorId === id), [ledger, version, id]);
  const pbById = new Map(balances.flatMap((a) => a.purchases.map((pb) => [pb.purchaseId, pb] as const)));
  /** Where each payment went, in words. */
  const appliedTo = (opId: string, currency: Currency) => {
    const acc = balances.find((a) => a.currency === currency);
    if (!acc) return '';
    const parts = acc.purchases.flatMap((pb) => pb.allocations.filter((x) => x.opId === opId).map((x) => t('vd.purchaseOn', { date: fmtDateShort((ledger.get(K.purchase(pb.purchaseId)) as Purchase | undefined)?.date), amount: formatMoney(currency, x.amount) })));
    return parts.length ? t('vd.paidFor', { list: parts.join(', ') }) : t('vd.credit');
  };
  if (!v) return <Empty title={t('vd.notFound')} />;
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/vendors')}>{t('vd.back')}</a>}
        title={v.name}
        lead={[v.phone, v.notes].filter(Boolean).join(' · ')}
        actions={
          <>
            {user!.caps.includes('payments') && (
              <button className="btn btn-primary" onClick={() => setPay(true)}>
                <Icon name="wallet" size={18} /> {t('pu.recordPayment')}
              </button>
            )}
            {user!.caps.includes('catalog.manage') && (
              <button className="btn" onClick={() => setEdit(true)}>
                <Icon name="edit" size={18} /> {t('cat.edit')}
              </button>
            )}
          </>
        }
      />
      <div className="grid cols-3">
        {balances.length === 0 && <div className="card stat"><span className="eyebrow">{t('pu.balance')}</span><span className="stat-value">0</span></div>}
        {balances.map((b) => (
          <div key={b.currency} className="card stat">
            <span className="eyebrow">{b.balance >= 0 ? t('pu.weOwe') : t('vd.ourCredit')}</span>
            <span className="stat-value">
              <Money amount={Math.abs(b.balance)} currency={b.currency} />
            </span>
            <span className="stat-sub">
              {rich(t('vd.boughtPaid'), { bought: <Money amount={b.payable} currency={b.currency} />, paid: <Money amount={b.paid} currency={b.currency} /> })}
              {b.unallocated > 0 && (
                <>
                  {' · '}
                  {rich(t('vd.unapplied'), { amount: <Money amount={b.unallocated} currency={b.currency} /> })}
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('nav.purchases')}</span>
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          {purchases.length === 0 && <div className="list-item muted">{t('vd.noneYet')}</div>}
          {purchases.map((p) => (
            <a key={p.id} className="list-item" href={href(`/purchases/${p.id}`)}>
              <span className="nowrap" style={{ width: 70 }}>
                {fmtDateShort(p.date)}
              </span>
              <span style={{ flex: 1 }}>
                <Qty n={purchaseSummary(p).pieces} /> · {t(`lbl.intake.${p.intake}`)}
              </span>
              <StatusPills p={p} balance={pbById.get(p.id)} />
            </a>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('vd.payments')}</span>
          <span className="hint">{t('vd.paymentsHint')}</span>
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          {payments.length === 0 && <div className="list-item muted">{t('vd.noneYet')}</div>}
          {payments.map((r) => {
            const pl = r.op.payload as { amount: number; currency: Currency; method: (typeof PAYMENT_METHODS)[number]; reference: string; date: string };
            return (
              <div key={r.op.id} className="list-item" style={r.voidedBy ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <span className="nowrap" style={{ width: 70 }}>
                  {fmtDateShort(pl.date)}
                </span>
                <span style={{ flex: 1 }}>
                  {t(`lbl.payment.${pl.method}`)} {pl.reference && <span className="mono muted">{pl.reference}</span>}
                  {!r.voidedBy && <div className="hint">{appliedTo(r.op.id, pl.currency)}</div>}
                </span>
                <Money amount={pl.amount} currency={pl.currency} strong />
                <VoidButton opId={r.op.id} label={t('void.cancel')} />
              </div>
            );
          })}
        </div>
      </section>
      {edit && <VendorSheet vendor={v} onClose={() => setEdit(false)} />}
      {pay && <PaymentSheet vendorId={id} onClose={() => setPay(false)} />}
    </div>
  );
}
