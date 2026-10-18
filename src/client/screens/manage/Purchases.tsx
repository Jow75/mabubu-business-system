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
import { INTAKE_LABEL, PAYMENT_LABEL } from '../../lib/labels';
import { reportCtx } from '../../lib/report-ctx';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, MoneyInput, PageHead, Qty, Seg, Sheet, Stepper, save } from '../../ui/kit';
import { LinesEditor, type EditLine } from '../../ui/LinesEditor';
import { DownloadButton } from '../../ui/Reporting';
import { VoidButton } from '../../ui/VoidButton';

function StatusPills({ p, balance }: { p: Purchase; balance: PurchaseBalance | undefined }) {
  const s = purchaseSummary(p);
  const owed = balance?.balance ?? 0;
  if (p.status === 'voided') return <span className="pill">Cancelled</span>;
  return (
    <span className="row" style={{ gap: 6 }}>
      {s.pendingInspection > 0 && <span className="pill lagoon">{s.pendingInspection} to inspect</span>}
      {s.awaitingCollection > 0 && <span className="pill indigo">{s.awaitingCollection} to collect</span>}
      {s.rejectedNotReturned > 0 && <span className="pill red">{s.rejectedNotReturned} rejects to return</span>}
      {owed > 0 && (
        <span className="pill saffron">
          Owe <Money amount={owed} currency={p.currency} />
        </span>
      )}
      {owed <= 0 && s.payable > 0 && <span className="pill green">Paid</span>}
      {s.pendingInspection + s.awaitingCollection + s.rejectedNotReturned === 0 && owed <= 0 && <span className="pill green">Complete</span>}
    </span>
  );
}

export function PurchasesPage() {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const [filter, setFilter] = useState<PurchaseFilter>({ status: 'open', vendorId: null, payment: 'any', from: null, to: null });
  const balances = useMemo(() => purchaseBalances(ledger), [ledger, version]);
  const list = useMemo(() => selectPurchases(ledger, balances, filter), [ledger, balances, filter]);
  return (
    <div className="page">
      <PageHead
        title="Purchases"
        lead="What was bought, from whom, and what is still to collect, inspect, return or pay."
        actions={
          <>
            <Seg value={filter.status} onChange={(status) => setFilter({ ...filter, status })} options={[{ value: 'open', label: 'Open' }, { value: 'all', label: 'All' }]} />
            <select className="select" style={{ width: 'auto' }} aria-label="Vendor" value={filter.vendorId ?? ''} onChange={(e) => setFilter({ ...filter, vendorId: e.target.value || null })}>
              <option value="">All vendors</option>
              {lk.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
            <select className="select" style={{ width: 'auto' }} aria-label="Payment" value={filter.payment} onChange={(e) => setFilter({ ...filter, payment: e.target.value as PurchaseFilter['payment'] })}>
              <option value="any">Paid or not</option>
              <option value="owed">Still owed</option>
              <option value="paid">Fully paid</option>
            </select>
            <DownloadButton build={() => purchasesReport(reportCtx(), filter)} />
            {user!.caps.includes('purchasing') && (
              <a className="btn btn-primary" href={href('/purchases/new')}>
                <Icon name="plus" size={18} /> New purchase
              </a>
            )}
          </>
        }
      />
      <section className="card">
        {list.length === 0 ? (
          <Empty icon="bag" title={filter.vendorId || filter.payment !== 'any' ? 'No purchases match these filters' : filter.status === 'open' ? 'Nothing open' : 'No purchases yet'}>
            {filter.vendorId || filter.payment !== 'any' ? 'Try “All vendors” or “Paid or not”.' : filter.status === 'open' ? 'Every purchase is collected, inspected and paid.' : 'Record the first purchase from a vendor.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Vendor</th>
                  <th>How</th>
                  <th className="n">Pieces</th>
                  <th className="n">Value</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const s = purchaseSummary(p);
                  return (
                    <tr key={p.id} className="clickable" onClick={() => navigate(`/purchases/${p.id}`)}>
                      <td className="nowrap">{fmtDateShort(p.date)}</td>
                      <td>{lk.vendor(p.vendorId)?.name}</td>
                      <td className="muted">{INTAKE_LABEL[p.intake]}</td>
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
        <PageHead title="New purchase" />
        <Empty icon="store" title="Add vendors and garments first">
          Go to <a href={href('/vendors')}>Vendors</a> and <a href={href('/catalogue')}>Garments &amp; prices</a>.
        </Empty>
      </div>
    );

  return (
    <div className="page" style={{ maxWidth: 860 }}>
      <PageHead eyebrow={<a href={href('/purchases')}>← Purchases</a>} title="New purchase" />
      <section className="card card-pad stack">
        <div className="form-grid">
          <Field label="Vendor">
            <select className="select" value={vendorId} onChange={(e) => setVendorId(e.target.value)}>
              {lk.vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                  {v.active ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Date">
            <input type="date" className="input" value={date} max={businessDate()} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Goods go to">
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
          <Field label="Currency">
            <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
              {CURRENCY_CODES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="What happened?">
          <Seg
            value={intake}
            onChange={setIntake}
            options={PURCHASE_INTAKES.map((i) => ({ value: i, label: INTAKE_LABEL[i] }))}
          />
        </Field>
        <p className="hint">
          {intake === 'collected' && 'The garments are in our hands now. They are counted as ready stock.'}
          {intake === 'awaiting' && 'Ordered or paid, but the vendor will call when ready. Collect later from the purchase page.'}
          {intake === 'inspection' && 'The vendor delivered before payment. Nothing counts as stock until it is inspected; we only owe for accepted pieces.'}
        </p>
      </section>
      <section className="stack">
        <span className="section-title">Garments (count pieces, not sacks)</span>
        <LinesEditor garments={vendorGarments.length ? vendorGarments : lk.garments} lines={lines} onChange={setLines} costCurrency={currency} />
      </section>
      {intake !== 'inspection' && (
        <section className="card card-pad stack">
          <span className="section-title">Payment made now (optional)</span>
          <div className="form-grid">
            <Field label="Amount paid">
              <MoneyInput currency={currency} value={payNow} onChange={setPayNow} />
            </Field>
            <Field label="Paid by">
              <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_LABEL[m]}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Reference (e.g. M-Pesa code)">
              <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} />
            </Field>
          </div>
        </section>
      )}
      <Field label="Note">
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <div className="sticky-foot">
        <div>
          <div style={{ fontWeight: 700 }}>
            {lines.reduce((s, l) => s + l.qty, 0)} pcs · <Money amount={total} currency={currency} />
          </div>
          <div style={{ opacity: 0.7, fontSize: 13 }}>{intake === 'inspection' ? 'Owed only for accepted pieces' : 'Owed to the vendor'}</div>
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
              'Purchase saved',
            );
            if (ok && payNow && intake !== 'inspection') {
              await save(() => store.submit('vendor.payment', { vendorId, purchaseId: id, date, amount: payNow, currency, method, reference, note: '' }), 'Payment saved');
            }
            setBusy(false);
            if (ok) navigate(`/purchases/${id}`);
          }}
        >
          <Icon name="check" /> Save purchase
        </button>
      </div>
    </div>
  );
}

type Action = 'inspect' | 'collect' | 'return' | 'pay' | null;

export function PurchaseDetail({ id }: { id: string }) {
  const { ledger, version, user, records } = useApp();
  const lk = useLookups();
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
  if (!p) return <Empty title="Purchase not found" />;
  const s = purchaseSummary(p);
  const owed = balance?.balance ?? 0;
  const paid = balance?.paid ?? 0;
  const can = user!.caps.includes('purchasing') && p.status === 'active';
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/purchases')}>← Purchases</a>}
        title={`${lk.vendor(p.vendorId)?.name ?? 'Vendor'} · ${fmtDate(p.date)}`}
        lead={
          <>
            {INTAKE_LABEL[p.intake]} · to {lk.locName(p.locationId)}
            {p.note && <> · “{p.note}”</>}
          </>
        }
        actions={
          <>
            {can && s.pendingInspection > 0 && (
              <button className="btn btn-primary" onClick={() => setAction('inspect')}>
                <Icon name="inspect" size={18} /> Inspect
              </button>
            )}
            {can && s.awaitingCollection > 0 && (
              <button className="btn btn-primary" onClick={() => setAction('collect')}>
                <Icon name="in" size={18} /> Collect
              </button>
            )}
            {can && s.rejectedNotReturned > 0 && (
              <button className="btn" onClick={() => setAction('return')}>
                Return rejects
              </button>
            )}
            {user!.caps.includes('payments') && p.status === 'active' && (
              <button className="btn" onClick={() => setAction('pay')}>
                <Icon name="wallet" size={18} /> Record payment
              </button>
            )}
          </>
        }
      />
      <div className="grid cols-4">
        <div className="card stat">
          <span className="eyebrow">Delivered / bought</span>
          <span className="stat-value">{s.pieces}</span>
          <span className="stat-sub">pieces on the original record</span>
        </div>
        {p.intake === 'inspection' && (
          <div className="card stat">
            <span className="eyebrow">Accepted · rejected</span>
            <span className="stat-value">
              {s.accepted} · {s.rejected}
            </span>
            <span className="stat-sub">{s.pendingInspection} still to inspect</span>
          </div>
        )}
        <div className="card stat">
          <span className="eyebrow">We owe</span>
          <span className="stat-value">
            <Money amount={s.payable} currency={p.currency} />
          </span>
          <span className="stat-sub">{p.intake === 'inspection' ? 'for accepted pieces' : 'for the purchase'}</span>
        </div>
        <div className="card stat">
          <span className="eyebrow">Balance</span>
          <span className="stat-value" style={{ color: owed > 0 ? 'var(--saffron-ink)' : undefined }}>
            <Money amount={owed} currency={p.currency} />
          </span>
          <span className="stat-sub">
            paid <Money amount={paid} currency={p.currency} />
          </span>
        </div>
      </div>
      {balance && balance.allocations.length > 0 && (
        <section className="card">
          <div className="card-head">
            <span className="section-title">Payments for this purchase</span>
          </div>
          <div className="list" style={{ marginTop: 8 }}>
            {balance.allocations.map((a, i) => (
              <div key={`${a.opId}-${i}`} className="list-item">
                <span className="nowrap" style={{ width: 70 }}>
                  {fmtDateShort(a.date)}
                </span>
                <span style={{ flex: 1 }}>
                  {PAYMENT_LABEL[a.method]} {a.reference && <span className="mono muted">{a.reference}</span>}
                  {!a.linked && <div className="hint">Recorded on the vendor page; applied here because this was the oldest unpaid purchase.</div>}
                  {records.get(a.opId)?.status === 'pending' && <span className="pill saffron">Not synced yet</span>}
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
                <th>Garment</th>
                <th className="n">Qty</th>
                <th className="n">Cost each</th>
                {p.intake === 'inspection' && (
                  <>
                    <th className="n">Accepted</th>
                    <th className="n">Rejected</th>
                    <th className="n">Returned</th>
                    <th>Progress</th>
                  </>
                )}
                {p.intake === 'awaiting' && <th className="n">Collected</th>}
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
                        <div className="bar" title={`${l.accepted} accepted, ${l.rejected} rejected, ${l.qty - l.accepted - l.rejected} pending`}>
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
          <span className="section-title">History</span>
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
                    {describeOp(r.op, lk, ledger)}
                    <span className="muted">
                      {' '}
                      · {records.get(r.op.id)?.actorName ?? lk.personName(r.op.actorId)} · {fmtDateTime(r.op.deviceTime)}
                    </span>
                  </span>
                  <VoidButton opId={r.op.id} label="Cancel" />
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
  const pending = p.lines.filter((l) => l.qty - l.accepted - l.rejected > 0);
  const [v, setV] = useState<Record<string, { accepted: number; rejected: number; reason: string }>>({});
  const [date, setDate] = useState(businessDate());
  const lines = pending.map((l) => ({ garmentTypeId: l.garmentTypeId, accepted: v[l.garmentTypeId]?.accepted ?? 0, rejected: v[l.garmentTypeId]?.rejected ?? 0, reason: v[l.garmentTypeId]?.reason ?? '' }));
  const any = lines.some((l) => l.accepted + l.rejected > 0);
  return (
    <Sheet
      title="Record inspection"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!any}
            onClick={async () => {
              if (await save(() => store.submit('purchase.inspect', { purchaseId: p.id, date, lines: lines.filter((l) => l.accepted + l.rejected > 0), note: '' }), 'Inspection saved')) onClose();
            }}
          >
            Save inspection
          </button>
        </>
      }
    >
      <p className="soft">You can inspect part of the delivery now and the rest later. Accepted pieces become ready stock; rejected pieces wait to be returned.</p>
      <Field label="Date">
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
              <span className="muted">{left} waiting</span>
            </div>
            <div className="form-grid">
              <Field label="Accepted">
                <Stepper value={cur.accepted} max={left - cur.rejected} onChange={(n) => set({ accepted: n })} />
              </Field>
              <Field label="Rejected">
                <Stepper value={cur.rejected} max={left - cur.accepted} onChange={(n) => set({ rejected: n })} />
              </Field>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" style={{ alignSelf: 'flex-start' }} onClick={() => set({ accepted: left - cur.rejected })}>
              Accept all the rest
            </button>
            {cur.rejected > 0 && <input className="input" placeholder="Why rejected? (optional)" value={cur.reason} onChange={(e) => set({ reason: e.target.value })} />}
          </div>
        );
      })}
    </Sheet>
  );
}

function QtySheet({ p, kind, onClose }: { p: Purchase; kind: 'collect' | 'return'; onClose: () => void }) {
  const lk = useLookups();
  const avail = (l: Purchase['lines'][number]) => (kind === 'collect' ? l.qty - l.collected : l.rejected - l.returned);
  const open = p.lines.filter((l) => avail(l) > 0);
  const [q, setQ] = useState<Record<string, number>>({});
  const [date, setDate] = useState(businessDate());
  const lines = open.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: q[l.garmentTypeId] ?? 0 })).filter((l) => l.qty > 0);
  return (
    <Sheet
      title={kind === 'collect' ? 'Collect from vendor' : 'Return rejected pieces'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!lines.length}
            onClick={async () => {
              const ok = await save(
                () => (kind === 'collect' ? store.submit('purchase.collect', { purchaseId: p.id, date, lines, note: '' }) : store.submit('purchase.return', { purchaseId: p.id, date, lines, note: '' })),
                kind === 'collect' ? 'Collection saved' : 'Return saved',
              );
              if (ok) onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Date">
        <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
      </Field>
      <div className="card">
        {open.map((l) => (
          <div key={l.garmentTypeId} className="garment-row">
            <div className="stack-sm">
              <GarmentLabel g={lk.garment(l.garmentTypeId)} />
              <span className="hint">{avail(l)} left</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn btn-ghost btn-sm" onClick={() => setQ({ ...q, [l.garmentTypeId]: avail(l) })}>
                All
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
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!amount}
            onClick={async () => {
              if (await save(() => store.submit('vendor.payment', { vendorId, purchaseId: chosen, date, amount: amount ?? 0, currency, method, reference, note }), 'Payment saved')) onClose();
            }}
          >
            Save payment
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Amount">
          <MoneyInput big currency={currency} value={amount} onChange={setAmount} />
        </Field>
        {!purchase && (
          <Field label="Currency">
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
        <Field label="Paid by">
          <select className="select" value={method} onChange={(e) => setMethod(e.target.value as typeof method)}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_LABEL[m]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Reference">
          <input className="input mono" value={reference} onChange={(e) => setReference(e.target.value.toUpperCase())} placeholder="M-Pesa code" />
        </Field>
      </div>
      {!purchase && (
        <Field label="What does this pay for?" hint={forPurchase ? undefined : 'Applied to the oldest unpaid purchases first; anything left over stays as credit with this vendor.'}>
          <select className="select" value={forPurchase} onChange={(e) => setForPurchase(e.target.value)}>
            <option value="">Oldest unpaid purchase first</option>
            {open.map((pb) => {
              const pur = ledger.get(K.purchase(pb.purchaseId)) as Purchase | undefined;
              return (
                <option key={pb.purchaseId} value={pb.purchaseId}>
                  {pur ? `${fmtDate(pur.date)} · ${purchaseSummary(pur).pieces} pcs` : 'Purchase'} · owe {formatMoney(pb.currency, pb.balance)}
                </option>
              );
            })}
          </select>
        </Field>
      )}
      <Field label="Note">
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </Field>
    </Sheet>
  );
}

/* ---------------- Vendors ---------------- */

export function VendorsPage() {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const [edit, setEdit] = useState<Vendor | 'new' | null>(null);
  const balances = useMemo(() => vendorAccounts(ledger), [ledger, version]);
  const purchases = useMemo(() => ledger.list<Purchase>('purchase'), [ledger, version]);
  return (
    <div className="page">
      <PageHead
        title="Vendors"
        lead="Who we buy from, and what we owe each of them."
        actions={
          <>
            <DownloadButton build={() => vendorsReport(reportCtx())} />
            {user!.caps.includes('catalog.manage') && (
              <button className="btn btn-primary" onClick={() => setEdit('new')}>
                <Icon name="plus" size={18} /> Add vendor
              </button>
            )}
          </>
        }
      />
      <section className="card">
        {lk.vendors.length === 0 ? (
          <Empty icon="store" title="No vendors yet" />
        ) : (
          <div className="list">
            {lk.vendors.map((v) => {
              const bs = balances.filter((b) => b.vendorId === v.id && b.balance !== 0);
              const last = purchases.filter((p) => p.vendorId === v.id && p.status === 'active').sort((a, b) => b.date.localeCompare(a.date))[0];
              return (
                <a key={v.id} className="list-item" href={href(`/vendors/${v.id}`)}>
                  <span style={{ flex: 1 }}>
                    <strong>{v.name}</strong> {!v.active && <span className="pill">inactive</span>}
                    <div className="hint">
                      {v.notes || '—'}
                      {last ? ` · last purchase ${fmtDateShort(last.date)}` : ''}
                    </div>
                  </span>
                  {bs.map((b) => (
                    <span key={b.currency} className={`pill ${b.balance > 0 ? 'saffron' : 'green'}`}>
                      {b.balance > 0 ? 'We owe ' : 'Credit '}
                      <Money amount={Math.abs(b.balance)} currency={b.currency} />
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
  const [name, setName] = useState(vendor?.name ?? '');
  const [phone, setPhone] = useState(vendor?.phone ?? '');
  const [notes, setNotes] = useState(vendor?.notes ?? '');
  const [active, setActive] = useState(vendor?.active ?? true);
  return (
    <Sheet
      title={vendor ? 'Edit vendor' : 'Add vendor'}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!name.trim()}
            onClick={async () => {
              if (await save(() => store.submit('vendor.upsert', { id: vendor?.id ?? uuidv7(), name: name.trim(), phone: phone.trim(), notes: notes.trim(), active }), 'Vendor saved')) onClose();
            }}
          >
            Save
          </button>
        </>
      }
    >
      <Field label="Name">
        <input className="input" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Mama Yasmin" />
      </Field>
      <Field label="Phone (optional)">
        <input className="input" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </Field>
      <Field label="What they sell / notes">
        <textarea className="textarea" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <label className="check">
        <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Still buying from this vendor
      </label>
    </Sheet>
  );
}

export function VendorDetail({ id }: { id: string }) {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
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
    const parts = acc.purchases.flatMap((pb) => pb.allocations.filter((x) => x.opId === opId).map((x) => `${fmtDateShort((ledger.get(K.purchase(pb.purchaseId)) as Purchase | undefined)?.date)} purchase (${formatMoney(currency, x.amount)})`));
    return parts.length ? `Paid for: ${parts.join(', ')}` : 'Not applied to a purchase yet — kept as credit';
  };
  if (!v) return <Empty title="Vendor not found" />;
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/vendors')}>← Vendors</a>}
        title={v.name}
        lead={[v.phone, v.notes].filter(Boolean).join(' · ')}
        actions={
          <>
            {user!.caps.includes('payments') && (
              <button className="btn btn-primary" onClick={() => setPay(true)}>
                <Icon name="wallet" size={18} /> Record payment
              </button>
            )}
            {user!.caps.includes('catalog.manage') && (
              <button className="btn" onClick={() => setEdit(true)}>
                <Icon name="edit" size={18} /> Edit
              </button>
            )}
          </>
        }
      />
      <div className="grid cols-3">
        {balances.length === 0 && <div className="card stat"><span className="eyebrow">Balance</span><span className="stat-value">0</span></div>}
        {balances.map((b) => (
          <div key={b.currency} className="card stat">
            <span className="eyebrow">{b.balance >= 0 ? 'We owe' : 'Our credit'}</span>
            <span className="stat-value">
              <Money amount={Math.abs(b.balance)} currency={b.currency} />
            </span>
            <span className="stat-sub">
              bought <Money amount={b.payable} currency={b.currency} /> · paid <Money amount={b.paid} currency={b.currency} />
              {b.unallocated > 0 && (
                <>
                  {' '}
                  · <Money amount={b.unallocated} currency={b.currency} /> not yet applied to a purchase
                </>
              )}
            </span>
          </div>
        ))}
      </div>
      <section className="card">
        <div className="card-head">
          <span className="section-title">Purchases</span>
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          {purchases.length === 0 && <div className="list-item muted">None yet.</div>}
          {purchases.map((p) => (
            <a key={p.id} className="list-item" href={href(`/purchases/${p.id}`)}>
              <span className="nowrap" style={{ width: 70 }}>
                {fmtDateShort(p.date)}
              </span>
              <span style={{ flex: 1 }}>
                <Qty n={purchaseSummary(p).pieces} /> · {INTAKE_LABEL[p.intake]}
              </span>
              <StatusPills p={p} balance={pbById.get(p.id)} />
            </a>
          ))}
        </div>
      </section>
      <section className="card">
        <div className="card-head">
          <span className="section-title">Payments</span>
          <span className="hint">A payment not tied to one purchase pays the oldest unpaid purchase first.</span>
        </div>
        <div className="list" style={{ marginTop: 8 }}>
          {payments.length === 0 && <div className="list-item muted">None yet.</div>}
          {payments.map((r) => {
            const pl = r.op.payload as { amount: number; currency: Currency; method: (typeof PAYMENT_METHODS)[number]; reference: string; date: string };
            return (
              <div key={r.op.id} className="list-item" style={r.voidedBy ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                <span className="nowrap" style={{ width: 70 }}>
                  {fmtDateShort(pl.date)}
                </span>
                <span style={{ flex: 1 }}>
                  {PAYMENT_LABEL[pl.method]} {pl.reference && <span className="mono muted">{pl.reference}</span>}
                  {!r.voidedBy && <div className="hint">{appliedTo(r.op.id, pl.currency)}</div>}
                </span>
                <Money amount={pl.amount} currency={pl.currency} strong />
                <VoidButton opId={r.op.id} label="Cancel" />
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
