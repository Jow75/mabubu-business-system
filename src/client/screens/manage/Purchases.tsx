import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { uuidv7 } from '../../../shared/ids';
import { previewAccount, purchaseBalances, purchaseSummary, vendorAccounts, type PurchaseBalance } from '../../../shared/queries';
import { purchasesReport, selectPurchases, vendorsReport, type PurchaseFilter } from '../../../shared/reports';
import { K, type Purchase, type Vendor } from '../../../shared/model';
import { CURRENCY_CODES, formatMoney, lineTotal, type Currency } from '../../../shared/money';
import { PAYMENT_METHODS, PURCHASE_INTAKES } from '../../../shared/ops';
import { businessDate, fmtDate, fmtDateShort, fmtDateTime } from '../../../shared/time';
import { errText, rich, useT } from '../../lib/i18n';
import { reportCtx } from '../../lib/report-ctx';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Qty, Seg, Sheet, Stepper, save, toast } from '../../ui/kit';
import { LinesEditor, type EditLine } from '../../ui/LinesEditor';
import { DownloadButton } from '../../ui/Reporting';
import { VoidButton } from '../../ui/VoidButton';
import { useHoldReload } from '../../lib/update';

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
  useHoldReload(lines.length > 0 || note !== '' || payNow !== null || reference !== '');
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

type Action = 'inspect' | 'collect' | 'return' | 'pay' | 'credit' | null;

export function PurchaseDetail({ id }: { id: string }) {
  const { ledger, version, user, records } = useApp();
  const lk = useLookups();
  const t = useT();
  const [action, setAction] = useState<Action>(null);
  const p = ledger.get(K.purchase(id)) as Purchase | undefined;
  const history = useMemo(() => {
    const live = [...ledger.ops.values()].filter((r) => r.status !== 'rejected');
    // Every split of a payment that ever paid this purchase — including one that moved money away from it.
    const payments = new Set<string>();
    for (const r of live) {
      if (r.op.type === 'vendor.payment' && r.op.payload.purchaseId === id) payments.add(r.op.id);
      if (r.op.type === 'payment.allocate' && r.op.payload.allocations.some((a) => a.purchaseId === id)) payments.add(r.op.payload.paymentId);
    }
    return live
      .filter((r) => {
        const pl = r.op.payload as { id?: string; purchaseId?: string | null; paymentId?: string };
        if (r.op.type === 'purchase.record') return pl.id === id;
        if (r.op.type === 'op.void') return false;
        if (r.op.type === 'payment.allocate') return payments.has(pl.paymentId ?? '');
        return pl.purchaseId === id;
      })
      .sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime));
  }, [ledger, version, id]);
  const balance = useMemo(() => purchaseBalances(ledger).get(id), [ledger, version, id]);
  const account = useMemo(() => (p ? vendorAccounts(ledger).find((a) => a.vendorId === p.vendorId && a.currency === p.currency) : undefined), [ledger, version, p]);
  if (!p) return <Empty title={t('pu.notFound')} />;
  const s = purchaseSummary(p);
  const owed = balance?.balance ?? 0;
  const paid = balance?.paid ?? 0;
  const can = user!.caps.includes('purchasing') && p.status === 'active';
  const canPay = user!.caps.includes('payments') && p.status === 'active';
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
      {canPay && owed > 0 && account && account.credit > 0 && (
        <div className="info-box row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <span>{rich(t('pu.creditHere'), { vendor: lk.vendor(p.vendorId)?.name ?? t('pu.vendor'), amount: <Money amount={account.credit} currency={p.currency} strong /> })}</span>
          <button className="btn btn-sm" onClick={() => setAction('credit')}>
            <Icon name="wallet" size={16} /> {t('pu.useCredit')}
          </button>
        </div>
      )}
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
                  {a.how === 'auto' && <div className="hint">{t('pu.appliedOldest')}</div>}
                  {a.how === 'allocated' && <div className="hint">{t('pu.fromCredit')}</div>}
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
      {action === 'credit' && <AllocateCreditSheet vendorId={p.vendorId} currency={p.currency} focus={p.id} onClose={() => setAction(null)} />}
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

/**
 * Amounts to put on a vendor's unpaid purchases: each at most what it can
 * still take, all together at most `available`. `withoutThis`: re-splitting a
 * payment, where a row's limit is what the purchase would owe without it.
 */
function AllocationEditor({ rows, values, onChange, available, currency, withoutThis = false }: { rows: { purchaseId: string; max: number }[]; values: Record<string, number | null>; onChange: (v: Record<string, number | null>) => void; available: number; currency: Currency; withoutThis?: boolean }) {
  const { ledger } = useApp();
  const t = useT();
  const total = rows.reduce((s, r) => s + (values[r.purchaseId] ?? 0), 0);
  const left = available - total;
  const fill = () => {
    let rest = available;
    const next: Record<string, number | null> = {};
    for (const r of rows) {
      const take = Math.max(0, Math.min(r.max, rest));
      next[r.purchaseId] = take || null;
      rest -= take;
    }
    onChange(next);
  };
  return (
    <div className="stack-sm">
      {rows.map((r) => {
        const pur = ledger.get(K.purchase(r.purchaseId)) as Purchase | undefined;
        const v = values[r.purchaseId] ?? null;
        const date = pur ? fmtDate(pur.date) : '';
        return (
          <div key={r.purchaseId} className="row-between" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-start' }}>
            <span style={{ flex: '1 1 160px', minWidth: 0 }}>
              {pur ? `${date} · ${t('c.nPcs', { n: purchaseSummary(pur).pieces })}` : t('pu.purchase')}
              <div className="hint">{t(withoutThis ? 'pu.owesWithout' : 'pu.leftOwed', { amount: formatMoney(currency, r.max) })}</div>
              {(v ?? 0) > r.max && <div className="hint" style={{ color: 'var(--hibiscus)' }}>{t('pu.overOwed')}</div>}
            </span>
            <div style={{ flex: '0 1 190px' }}>
              <MoneyInput currency={currency} value={v} label={t('pu.amountFor', { date })} onChange={(x) => onChange({ ...values, [r.purchaseId]: x })} />
            </div>
          </div>
        );
      })}
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 8 }}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={fill}>
          {t('pu.fillOldest')}
        </button>
        <span className="num" style={left < 0 ? { color: 'var(--hibiscus)', fontWeight: 650 } : { fontWeight: 650 }}>
          {left < 0 ? t('pu.overCredit') : t('pu.creditLeft', { amount: formatMoney(currency, left) })}
        </span>
      </div>
    </div>
  );
}

/** True when every amount is within what each purchase can take and the total fits. */
function allocationValid(rows: { purchaseId: string; max: number }[], values: Record<string, number | null>, available: number, requireSome = true) {
  const total = rows.reduce((s, r) => s + (values[r.purchaseId] ?? 0), 0);
  return (!requireSome || total > 0) && total <= available && rows.every((r) => (values[r.purchaseId] ?? 0) <= r.max);
}

const DRAFT = '~draft-payment';

export function PaymentSheet({ vendorId, purchase, owed, onClose }: { vendorId: string; purchase?: Purchase; owed?: number; onClose: () => void }) {
  const { ledger } = useApp();
  const lk = useLookups();
  const t = useT();
  const [amount, setAmount] = useState<number | null>(purchase ? Math.max(0, owed ?? 0) || null : null);
  const [currency, setCurrency] = useState<Currency>(purchase?.currency ?? 'KES');
  const [method, setMethod] = useState<(typeof PAYMENT_METHODS)[number]>('mpesa');
  const [reference, setReference] = useState('');
  const [date, setDate] = useState(businessDate());
  const [note, setNote] = useState('');
  // From the vendor page: '' = oldest unpaid first (the default rule), 'credit' = keep it as credit, or one purchase.
  const [forPurchase, setForPurchase] = useState<string>('');
  // When a payment is more than its purchase still owes: leave the extra as credit, or use it now.
  const [extraMode, setExtraMode] = useState<'credit' | 'other'>('credit');
  const [extra, setExtra] = useState<Record<string, number | null>>({});
  const [busy, setBusy] = useState(false);
  const vendorName = lk.vendor(vendorId)?.name ?? t('pu.vendor');
  const open = useMemo(
    () => (purchase ? [] : (vendorAccounts(ledger).find((a) => a.vendorId === vendorId && a.currency === currency)?.purchases.filter((pb) => pb.balance > 0) ?? [])),
    [ledger, vendorId, currency, purchase],
  );
  const named = purchase?.id ?? (forPurchase && forPurchase !== 'credit' ? forPurchase : null);
  const keepCredit = !purchase && forPurchase === 'credit';
  // Exactly what the books will show once saved: the same rules, run on the draft.
  const preview = useMemo(() => {
    if (!amount) return null;
    const payment = { opId: DRAFT, vendorId, purchaseId: named, date, amount, currency, method, reference, note, pending: true };
    const split = keepCredit ? { paymentId: DRAFT, vendorId, currency, allocations: [], opId: `${DRAFT}-split` } : undefined;
    const account = previewAccount(ledger, vendorId, currency, { payment, ...(split ? { split } : {}) });
    const use = account?.uses.find((u) => u.opId === DRAFT);
    return account && use ? { account, use } : null;
  }, [ledger, vendorId, currency, amount, named, keepCredit, date, method, reference, note]);
  const extraAmount = named && preview ? preview.use.credit : 0;
  const otherRows = named && preview ? preview.account.purchases.filter((pb) => pb.purchaseId !== named && pb.balance > 0).map((pb) => ({ purchaseId: pb.purchaseId, max: pb.balance })) : [];
  const usingExtra = extraMode === 'other' && extraAmount > 0 && otherRows.length > 0;
  const purchaseDate = (id: string) => fmtDate((ledger.get(K.purchase(id)) as Purchase | undefined)?.date);
  const submit = async () => {
    setBusy(true);
    const paid = await store.submit('vendor.payment', { vendorId, purchaseId: named, date, amount: amount ?? 0, currency, method, reference, note });
    if (!paid.ok) {
      toast(errText(paid.error), 'error');
      setBusy(false);
      return;
    }
    let allocations: { purchaseId: string; amount: number }[] | null = null;
    if (keepCredit) allocations = [];
    else if (usingExtra && named && preview) {
      const own = preview.use.lines.find((l) => l.purchaseId === named)?.amount ?? 0;
      allocations = [...(own > 0 ? [{ purchaseId: named, amount: own }] : []), ...otherRows.filter((r) => (extra[r.purchaseId] ?? 0) > 0).map((r) => ({ purchaseId: r.purchaseId, amount: extra[r.purchaseId]! }))];
    }
    if (allocations) {
      const split = await store.submit('payment.allocate', { paymentId: paid.op.id, basedOn: null, allocations, note: '' });
      if (!split.ok) toast(errText(split.error), 'error');
    }
    setBusy(false);
    toast(t('pu.paySaved'));
    onClose();
  };
  return (
    <Sheet
      title={t('pu.payTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button className="btn btn-primary" disabled={!amount || busy || (usingExtra && !allocationValid(otherRows, extra, extraAmount))} onClick={() => void submit()}>
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
          <select
            className="select"
            value={forPurchase}
            onChange={(e) => {
              setForPurchase(e.target.value);
              setExtra({});
            }}
          >
            <option value="">{t('pu.oldestFirst')}</option>
            <option value="credit">{t('pu.keepCredit')}</option>
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
      {preview && (
        <div className="info-box stack-sm" aria-live="polite">
          <strong>{t('pu.preview')}</strong>
          {preview.use.lines.map((l) => (
            <span key={l.purchaseId}>
              {t('pu.pays', { date: purchaseDate(l.purchaseId), amount: formatMoney(currency, l.amount) })}
              {preview.account.purchases.find((pb) => pb.purchaseId === l.purchaseId)?.balance === 0 ? t('pu.paysFull') : ''}
            </span>
          ))}
          {preview.use.credit > 0 && !usingExtra && <span>{t('pu.staysCredit', { amount: formatMoney(currency, preview.use.credit), vendor: vendorName })}</span>}
        </div>
      )}
      {named && extraAmount > 0 && otherRows.length > 0 && (
        <div className="card card-pad stack-sm">
          <span>{t('pu.extraTitle', { amount: formatMoney(currency, extraAmount) })}</span>
          <label className="check">
            <input type="radio" name="extra" checked={extraMode === 'credit'} onChange={() => setExtraMode('credit')} /> {t('pu.leaveCredit')}
          </label>
          <label className="check">
            <input type="radio" name="extra" checked={extraMode === 'other'} onChange={() => setExtraMode('other')} /> {t('pu.useOther')}
          </label>
          {extraMode === 'other' && <AllocationEditor rows={otherRows} values={extra} onChange={setExtra} available={extraAmount} currency={currency} />}
        </div>
      )}
      <Field label={t('stk.note')}>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/**
 * Put a vendor's available credit onto that vendor's unpaid purchases. The
 * credit is taken from the payments that hold it, oldest first; each such
 * payment gets a new split (what it already pays + the new amounts). The
 * payments themselves — amount, date, M-Pesa code — never change.
 */
function AllocateCreditSheet({ vendorId, currency, focus, onClose }: { vendorId: string; currency: Currency; focus?: string; onClose: () => void }) {
  const { ledger } = useApp();
  const lk = useLookups();
  const t = useT();
  const account = useMemo(() => vendorAccounts(ledger).find((a) => a.vendorId === vendorId && a.currency === currency), [ledger, vendorId, currency]);
  const rows = (account?.purchases ?? []).filter((pb) => pb.balance > 0).map((pb) => ({ purchaseId: pb.purchaseId, max: pb.balance }));
  const credit = account?.credit ?? 0;
  const [values, setValues] = useState<Record<string, number | null>>(() => {
    const max = rows.find((r) => r.purchaseId === focus)?.max ?? 0;
    return focus && max ? { [focus]: Math.min(max, credit) } : {};
  });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!account) return;
    setBusy(true);
    const wanted = rows.map((r) => ({ purchaseId: r.purchaseId, amount: values[r.purchaseId] ?? 0 })).filter((w) => w.amount > 0);
    for (let i = 0; i < account.payments.length; i++) {
      const use = account.uses[i]!;
      if (use.credit <= 0 || !wanted.some((w) => w.amount > 0)) continue;
      let room = use.credit;
      const lines = new Map(use.lines.map((l) => [l.purchaseId, l.amount]));
      for (const w of wanted) {
        const take = Math.min(room, w.amount);
        if (take <= 0) continue;
        lines.set(w.purchaseId, (lines.get(w.purchaseId) ?? 0) + take);
        w.amount -= take;
        room -= take;
      }
      if (room === use.credit) continue;
      const r = await store.submit('payment.allocate', { paymentId: use.opId, basedOn: use.splitOpId, allocations: [...lines].map(([purchaseId, amount]) => ({ purchaseId, amount })), note: '' });
      if (!r.ok) {
        toast(errText(r.error), 'error');
        setBusy(false);
        return;
      }
    }
    setBusy(false);
    toast(t('pu.allocSaved'));
    onClose();
  };
  return (
    <Sheet
      title={t('pu.allocTitle', { vendor: lk.vendor(vendorId)?.name ?? t('pu.vendor') })}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button className="btn btn-primary" disabled={busy || !allocationValid(rows, values, credit)} onClick={() => void submit()}>
            {t('vd.allocate')}
          </button>
        </>
      }
    >
      <p className="soft">{t('pu.allocLead')}</p>
      <div className="info-box">
        {t('vd.creditAvail')}: <Money amount={credit} currency={currency} strong />
      </div>
      {rows.length === 0 ? <p className="muted">{t('pu.noOpen', { currency })}</p> : <AllocationEditor rows={rows} values={values} onChange={setValues} available={credit} currency={currency} />}
    </Sheet>
  );
}

/** Re-split one existing payment across the same vendor's purchases (the payment record itself stays as it is). */
function ChangeAllocationSheet({ paymentId, onClose }: { paymentId: string; onClose: () => void }) {
  const { ledger } = useApp();
  const t = useT();
  const account = useMemo(() => vendorAccounts(ledger).find((a) => a.payments.some((p) => p.opId === paymentId)), [ledger, paymentId]);
  const i = account?.payments.findIndex((p) => p.opId === paymentId) ?? -1;
  const pay = account?.payments[i];
  const use = account?.uses[i];
  const current = new Map((use?.lines ?? []).map((l) => [l.purchaseId, l.amount]));
  const rows = (account?.purchases ?? []).filter((pb) => pb.balance > 0 || current.has(pb.purchaseId)).map((pb) => ({ purchaseId: pb.purchaseId, max: pb.balance + (current.get(pb.purchaseId) ?? 0) }));
  const [values, setValues] = useState<Record<string, number | null>>(() => Object.fromEntries(rows.map((r) => [r.purchaseId, current.get(r.purchaseId) ?? null])));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  if (!account || !pay || !use) return null;
  const changed = rows.some((r) => (values[r.purchaseId] ?? 0) !== (current.get(r.purchaseId) ?? 0));
  return (
    <Sheet
      title={t('pu.changeTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={busy || !changed || !allocationValid(rows, values, pay.amount, false)}
            onClick={async () => {
              setBusy(true);
              const allocations = rows.filter((r) => (values[r.purchaseId] ?? 0) > 0).map((r) => ({ purchaseId: r.purchaseId, amount: values[r.purchaseId]! }));
              const ok = await save(() => store.submit('payment.allocate', { paymentId, basedOn: use.splitOpId, allocations, note: note.trim() }), t('pu.allocSaved'));
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {t('c.save')}
          </button>
        </>
      }
    >
      <p className="soft">{t('pu.changeLead', { amount: formatMoney(pay.currency, pay.amount), ref: pay.reference ? ` · ${pay.reference}` : '', date: fmtDate(pay.date) })}</p>
      {rows.length === 0 ? <p className="muted">{t('pu.noOpen', { currency: pay.currency })}</p> : <AllocationEditor rows={rows} values={values} onChange={setValues} available={pay.amount} currency={pay.currency} withoutThis />}
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
              const bs = balances.filter((b) => b.vendorId === v.id && (b.outstanding > 0 || b.credit > 0));
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
                  {bs.flatMap((b) => [
                    b.outstanding > 0 && (
                      <span key={`${b.currency}-o`} className="pill saffron">
                        {rich(t('vd.weOweAmt'), { amount: <Money amount={b.outstanding} currency={b.currency} /> })}
                      </span>
                    ),
                    b.credit > 0 && (
                      <span key={`${b.currency}-c`} className="pill green">
                        {rich(t('vd.creditAmt'), { amount: <Money amount={b.credit} currency={b.currency} /> })}
                      </span>
                    ),
                  ])}
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
  const { ledger, version, user, records } = useApp();
  const lk = useLookups();
  const t = useT();
  const [edit, setEdit] = useState(false);
  const [pay, setPay] = useState(false);
  const [allocate, setAllocate] = useState<Currency | null>(null);
  const [change, setChange] = useState<string | null>(null);
  const [history, setHistory] = useState<string | null>(null);
  const v = lk.vendor(id);
  const canPay = user!.caps.includes('payments');
  const purchases = useMemo(() => ledger.list<Purchase>('purchase').filter((p) => p.vendorId === id).sort((a, b) => b.date.localeCompare(a.date)), [ledger, version, id]);
  const payments = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.op.type === 'vendor.payment' && r.op.payload.vendorId === id && r.status !== 'rejected')
        .sort((a, b) => b.op.deviceTime.localeCompare(a.op.deviceTime)),
    [ledger, version, id],
  );
  const splits = useMemo(
    () =>
      [...ledger.ops.values()]
        .filter((r) => r.op.type === 'payment.allocate' && r.status !== 'rejected')
        .sort((a, b) => a.op.deviceTime.localeCompare(b.op.deviceTime)),
    [ledger, version],
  );
  const balances = useMemo(() => vendorAccounts(ledger).filter((b) => b.vendorId === id), [ledger, version, id]);
  const pbById = new Map(balances.flatMap((a) => a.purchases.map((pb) => [pb.purchaseId, pb] as const)));
  const useOf = (opId: string) => {
    for (const a of balances) {
      const i = a.payments.findIndex((p) => p.opId === opId);
      if (i >= 0) return a.uses[i];
    }
    return undefined;
  };
  const purchaseDay = (purchaseId: string) => fmtDateShort((ledger.get(K.purchase(purchaseId)) as Purchase | undefined)?.date);
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
      <div className="grid cols-2">
        {balances.length === 0 && <div className="card stat"><span className="eyebrow">{t('pu.balance')}</span><span className="stat-value">0</span></div>}
        {balances.flatMap((b) => [
          <div key={`${b.currency}-o`} className="card stat">
            <span className="eyebrow">{t('vd.outstanding')}</span>
            <span className="stat-value" style={{ color: b.outstanding > 0 ? 'var(--saffron-ink)' : undefined }}>
              <Money amount={b.outstanding} currency={b.currency} />
            </span>
            <span className="stat-sub">{rich(t('vd.boughtPaid'), { bought: <Money amount={b.payable} currency={b.currency} />, paid: <Money amount={b.paid} currency={b.currency} /> })}</span>
          </div>,
          <div key={`${b.currency}-c`} className="card stat">
            <span className="eyebrow">{t('vd.creditAvail')}</span>
            <span className="stat-value" style={{ color: b.credit > 0 ? 'var(--mangrove)' : undefined }}>
              <Money amount={b.credit} currency={b.currency} />
            </span>
            <span className="stat-sub">{b.credit > 0 ? t('vd.creditHint') : '—'}</span>
            {canPay && b.credit > 0 && b.outstanding > 0 && (
              <button className="btn btn-sm" style={{ alignSelf: 'flex-start', marginTop: 8 }} onClick={() => setAllocate(b.currency)}>
                <Icon name="wallet" size={16} /> {t('vd.allocate')}
              </button>
            )}
          </div>,
        ])}
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
            const use = r.voidedBy ? undefined : useOf(r.op.id);
            const changes = splits.filter((s) => s.op.type === 'payment.allocate' && s.op.payload.paymentId === r.op.id);
            return (
              <div key={r.op.id} className="list-item" style={{ alignItems: 'flex-start', flexWrap: 'wrap', ...(r.voidedBy ? { opacity: 0.5, textDecoration: 'line-through' } : {}) }}>
                <span className="nowrap" style={{ width: 70 }}>
                  {fmtDateShort(pl.date)}
                </span>
                <span style={{ flex: '1 1 200px', minWidth: 0 }}>
                  {t(`lbl.payment.${pl.method}`)} {pl.reference && <span className="mono muted">{pl.reference}</span>}
                  {use && (
                    <>
                      <div className="hint">{use.lines.length ? t('vd.paidFor', { list: use.lines.map((l) => t('vd.purchaseOn', { date: purchaseDay(l.purchaseId), amount: formatMoney(pl.currency, l.amount) })).join(', ') }) : t('vd.credit')}</div>
                      {use.credit > 0 && use.lines.length > 0 && (
                        <div className="hint" style={{ color: 'var(--mangrove)' }}>
                          {t('vd.keptCredit', { amount: formatMoney(pl.currency, use.credit) })}
                        </div>
                      )}
                      {use.unapplied.map((u) => (
                        <div key={u.purchaseId} className="hint">
                          {t('vd.notUsed', { amount: formatMoney(pl.currency, u.amount), date: purchaseDay(u.purchaseId) })}
                        </div>
                      ))}
                      <span className="row" style={{ gap: 6, marginTop: 4 }}>
                        <span className="pill">{t(`vd.how.${use.how}`)}</span>
                        {canPay && (
                          <button className="btn btn-ghost btn-sm" onClick={() => setChange(r.op.id)}>
                            <Icon name="edit" size={15} /> {t('vd.changeAlloc')}
                          </button>
                        )}
                        {changes.length > 0 && (
                          <button className="btn btn-ghost btn-sm" aria-expanded={history === r.op.id} onClick={() => setHistory(history === r.op.id ? null : r.op.id)}>
                            <Icon name="clock" size={15} /> {t('vd.history')} ({changes.length})
                          </button>
                        )}
                      </span>
                      {history === r.op.id && (
                        <div className="stack-sm" style={{ marginTop: 6 }}>
                          {changes.map((c) => (
                            <span key={c.op.id} className="hint">
                              {fmtDateTime(c.op.deviceTime)} · {records.get(c.op.id)?.actorName ?? lk.personName(c.op.actorId)}: {describeOp(c.op, lk, ledger, t)}
                              {records.get(c.op.id)?.status === 'pending' && <span className="pill saffron" style={{ marginLeft: 6 }}>{t('days.notSynced')}</span>}
                            </span>
                          ))}
                        </div>
                      )}
                    </>
                  )}
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
      {allocate && <AllocateCreditSheet vendorId={id} currency={allocate} onClose={() => setAllocate(null)} />}
      {change && <ChangeAllocationSheet paymentId={change} onClose={() => setChange(null)} />}
    </div>
  );
}
