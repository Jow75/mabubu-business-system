// Take garments, return garments and close the day. Used by workers for
// themselves and by managers recording on behalf of a worker.

import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import { navigate, useRoute } from '../../lib/router';
import { businessDate, fmtDate } from '../../../shared/time';
import { priceFor } from '../../../shared/engine';
import { workerHolding } from '../../../shared/queries';
import { K, type WorkerDay } from '../../../shared/model';
import { lineTotal, type Currency } from '../../../shared/money';
import { GarmentLabel, Money, MoneyInput, Stepper, Field, PageHead, Empty, save, toast } from '../../ui/kit';
import { Icon } from '../../ui/Icon';

/** Who/where/when the screen records for, from the URL or the signed-in worker. */
export function useDayContext() {
  const { user } = useApp();
  const lk = useLookups();
  const { query } = useRoute();
  const workerId = query.get('worker') ?? user!.id;
  const worker = lk.person(workerId);
  const workDate = query.get('date') ?? businessDate();
  const selling = lk.locations.filter((l) => l.active && l.kind === 'selling');
  const locationId = query.get('loc') ?? worker?.locationId ?? user?.locationId ?? selling[0]?.id ?? lk.locations[0]?.id ?? '';
  const loc = lk.loc(locationId);
  const self = workerId === user!.id;
  const back = self ? '/' : `/days/${workerId}/${workDate}`;
  return { workerId, worker, workDate, locationId, loc, self, back, lk };
}

function WhoBar({ ctx }: { ctx: ReturnType<typeof useDayContext> }) {
  if (ctx.self) return null;
  return (
    <div className="info-box row">
      <Icon name="people" size={18} /> Recording for <strong>{ctx.worker?.name ?? 'worker'}</strong> · {fmtDate(ctx.workDate)} · {ctx.loc?.name}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function TakeGarments() {
  const ctx = useDayContext();
  const { ledger } = useApp();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const garments = ctx.lk.activeGarments.filter((g) => !q || `${g.code} ${g.name}`.toLowerCase().includes(q.toLowerCase()));
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([garmentTypeId, n]) => ({ garmentTypeId, qty: n }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const cur = (ctx.loc?.currency ?? 'KMF') as Currency;
  const value = lines.reduce((s, l) => s + lineTotal(l.qty, priceFor((k) => ledger.get(k), l.garmentTypeId, ctx.locationId, ctx.workDate)?.retail ?? 0), 0);

  if (!ctx.loc) return <Empty icon="pin" title="No selling location yet">The owner needs to add the Comoros location first.</Empty>;
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc.name}`} title="Take garments" lead="Count the garments in your hands, then save. Save now — not at the end of the day." />
      <WhoBar ctx={ctx} />
      <input className="input" placeholder="Search garments…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        {garments.length === 0 && <Empty title="No garments found" />}
        {garments.map((g) => {
          const price = priceFor((k) => ledger.get(k), g.id, ctx.locationId, ctx.workDate);
          return (
            <div key={g.id} className={`garment-row ${qty[g.id] ? 'active' : ''}`}>
              <div className="stack-sm" style={{ minWidth: 0 }}>
                <GarmentLabel g={g} stacked />
                <span className="hint">
                  {ctx.lk.size(g.sizeCategoryId)?.name ?? ''}
                  {price ? (
                    <>
                      {' · '}
                      <Money amount={price.retail} currency={price.currency} />
                    </>
                  ) : (
                    ' · no price set'
                  )}
                </span>
              </div>
              <Stepper value={qty[g.id] ?? 0} onChange={(v) => setQty({ ...qty, [g.id]: v })} label={g.code} />
            </div>
          );
        })}
      </div>
      <div className="sticky-foot">
        <div>
          <div style={{ fontWeight: 700, fontSize: 18 }}>{total} pcs</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Worth <Money amount={value} currency={cur} /> at full price
          </div>
        </div>
        <button
          className="btn btn-accent btn-lg"
          disabled={busy || total === 0}
          onClick={async () => {
            setBusy(true);
            const ok = await save(() => store.submit('worker.issue', { workerId: ctx.workerId, locationId: ctx.locationId, workDate: ctx.workDate, lines }), `Saved: ${total} pcs taken`);
            setBusy(false);
            if (ok) navigate(ctx.back);
          }}
        >
          <Icon name="check" /> Save
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ReturnGarments() {
  const ctx = useDayContext();
  const { ledger, version } = useApp();
  const holding = useMemo(() => workerHolding(ledger, ctx.workerId, ctx.locationId), [ledger, ctx.workerId, ctx.locationId, version]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([garmentTypeId, n]) => ({ garmentTypeId, qty: n }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const held = [...holding.entries()].filter(([, n]) => n > 0);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc?.name ?? ''}`} title="Return garments" lead="Count what you bring back to the store. Whatever is not returned is counted as sold when you close the day." />
      <WhoBar ctx={ctx} />
      <div className="card">
        {held.length === 0 && <Empty title="Nothing to return">You are not holding any garments right now.</Empty>}
        {held.map(([gt, n]) => (
          <div key={gt} className={`garment-row ${qty[gt] ? 'active' : ''}`}>
            <div className="stack-sm" style={{ minWidth: 0 }}>
              <GarmentLabel g={ctx.lk.garment(gt)} stacked />
              <span className="hint">You hold {n}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQty({ ...qty, [gt]: n })}>
                All
              </button>
              <Stepper value={qty[gt] ?? 0} max={ctx.self ? n : undefined} onChange={(v) => setQty({ ...qty, [gt]: v })} label={ctx.lk.garment(gt)?.code} />
            </div>
          </div>
        ))}
      </div>
      {held.length > 0 && (
        <div className="sticky-foot">
          <div style={{ fontWeight: 700, fontSize: 18 }}>{total} pcs back</div>
          <button
            className="btn btn-accent btn-lg"
            disabled={busy || total === 0}
            onClick={async () => {
              setBusy(true);
              const ok = await save(() => store.submit('worker.return', { workerId: ctx.workerId, locationId: ctx.locationId, workDate: ctx.workDate, lines }), `Saved: ${total} pcs returned`);
              setBusy(false);
              if (ok) navigate(ctx.back);
            }}
          >
            <Icon name="check" /> Save
          </button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

interface LineState {
  sold: number;
  wholesaleQty: number;
  wholesalePrice: number;
  carried: number;
  lost: number;
}

export function CloseDay() {
  const ctx = useDayContext();
  const { ledger, version } = useApp();
  const holding = useMemo(() => workerHolding(ledger, ctx.workerId, ctx.locationId), [ledger, ctx.workerId, ctx.locationId, version]);
  const held = [...holding.entries()].filter(([, n]) => n > 0);
  const cur = (ctx.loc?.currency ?? 'KMF') as Currency;
  const day = ledger.get(K.day(ctx.workerId, ctx.workDate)) as WorkerDay | undefined;

  const prices = useMemo(() => {
    const m = new Map<string, { retail: number; wholesale: number }>();
    for (const [gt] of held) {
      const p = priceFor((k) => ledger.get(k), gt, ctx.locationId, ctx.workDate);
      m.set(gt, { retail: p?.retail ?? 0, wholesale: p?.wholesale ?? p?.retail ?? 0 });
    }
    return m;
  }, [held.length, ledger, version, ctx.locationId, ctx.workDate]);

  const [lines, setLines] = useState<Record<string, LineState>>({});
  const [showDetail, setShowDetail] = useState<Record<string, boolean>>({});
  const [cash, setCash] = useState<number | null>(null);
  const [mobile, setMobile] = useState<number | null>(null);
  const [expenses, setExpenses] = useState<{ description: string; amount: number | null }[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const lineOf = (gt: string, n: number): LineState => lines[gt] ?? { sold: n, wholesaleQty: 0, wholesalePrice: prices.get(gt)?.wholesale ?? 0, carried: 0, lost: 0 };
  const setLine = (gt: string, n: number, patch: Partial<LineState>) => {
    const next = { ...lineOf(gt, n), ...patch };
    next.sold = Math.max(0, n - next.carried - next.lost);
    next.wholesaleQty = Math.min(next.wholesaleQty, next.sold);
    setLines({ ...lines, [gt]: next });
  };

  let expected = 0;
  let soldTotal = 0;
  const payloadLines = held.map(([gt, n]) => {
    const l = lineOf(gt, n);
    const pr = prices.get(gt) ?? { retail: 0, wholesale: 0 };
    expected += lineTotal(l.sold - l.wholesaleQty, pr.retail) + lineTotal(l.wholesaleQty, l.wholesalePrice);
    soldTotal += l.sold;
    return { garmentTypeId: gt, held: n, sold: l.sold, wholesaleQty: l.wholesaleQty, retailPrice: pr.retail, wholesalePrice: l.wholesalePrice, carried: l.carried, lost: l.lost };
  });
  const spent = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
  const handed = (cash ?? 0) + (mobile ?? 0);
  const variance = expected - spent - handed;
  const missingPrice = payloadLines.some((l) => l.sold - l.wholesaleQty > 0 && l.retailPrice === 0);

  if (day?.status === 'settled') {
    return (
      <div className="page" style={{ maxWidth: 720 }}>
        <PageHead title="Day already closed" lead={`${fmtDate(ctx.workDate)} was closed. A manager can reopen it if something must change.`} />
        <button className="btn" onClick={() => navigate(ctx.back)}>
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc?.name ?? ''}`} title="Close the day" lead="Everything you still hold is counted as sold, unless you mark it as kept for tomorrow or lost." />
      <WhoBar ctx={ctx} />

      <div className="card">
        <div className="card-head">
          <span className="section-title">1 · What was sold</span>
          <span className="muted">{soldTotal} pcs</span>
        </div>
        <div className="card-body" style={{ paddingTop: 6 }}>
          {held.length === 0 && <div className="muted">You hold no garments. You can still close the day to hand over money.</div>}
          {held.map(([gt, n]) => {
            const l = lineOf(gt, n);
            const pr = prices.get(gt)!;
            const open = showDetail[gt];
            return (
              <div key={gt} style={{ padding: '10px 0', borderTop: '1px solid var(--rule)' }}>
                <div className="row-between">
                  <GarmentLabel g={ctx.lk.garment(gt)} stacked />
                  <span className="num" style={{ fontWeight: 650 }}>
                    {l.sold} of {n} sold
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="hint">
                    {pr.retail ? (
                      <>
                        <Money amount={pr.retail} currency={cur} /> each
                      </>
                    ) : (
                      <span style={{ color: 'var(--hibiscus)' }}>No price set — ask a manager</span>
                    )}
                    {l.wholesaleQty > 0 && <> · {l.wholesaleQty} wholesale</>}
                    {l.carried > 0 && <> · {l.carried} kept</>}
                    {l.lost > 0 && <> · {l.lost} lost</>}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetail({ ...showDetail, [gt]: !open })}>
                    {open ? 'Done' : 'Wholesale / kept / lost'}
                  </button>
                </div>
                {open && (
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <Field label="Sold at wholesale price">
                      <Stepper value={l.wholesaleQty} max={l.sold} onChange={(v) => setLine(gt, n, { wholesaleQty: v })} />
                    </Field>
                    {l.wholesaleQty > 0 && (
                      <Field label="Wholesale price each">
                        <MoneyInput currency={cur} value={l.wholesalePrice} onChange={(v) => setLine(gt, n, { wholesalePrice: v ?? 0 })} />
                      </Field>
                    )}
                    <Field label="Kept for tomorrow">
                      <Stepper value={l.carried} max={n - l.lost} onChange={(v) => setLine(gt, n, { carried: v })} />
                    </Field>
                    <Field label="Lost or damaged">
                      <Stepper value={l.lost} max={n - l.carried} onChange={(v) => setLine(gt, n, { lost: v })} />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="section-title">2 · Money spent from the sales</span>
          <button type="button" className="btn btn-sm" onClick={() => setExpenses([...expenses, { description: '', amount: null }])}>
            <Icon name="plus" size={16} /> Add
          </button>
        </div>
        <div className="card-body stack">
          {expenses.length === 0 && <span className="muted">Nothing spent.</span>}
          {expenses.map((e, i) => (
            <div key={i} className="form-grid" style={{ alignItems: 'end' }}>
              <Field label="What for">
                <input className="input" value={e.description} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))} placeholder="e.g. transport" />
              </Field>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                <div style={{ flex: 1 }}>
                  <Field label="Amount">
                    <MoneyInput currency={cur} value={e.amount} onChange={(v) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                  </Field>
                </div>
                <button type="button" className="icon-btn" aria-label="Remove" onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>
                  <Icon name="x" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="section-title">3 · Money handed over</span>
        </div>
        <div className="card-body form-grid">
          <Field label="Cash">
            <MoneyInput big currency={cur} value={cash} onChange={setCash} />
          </Field>
          <Field label="Mobile money (if any)">
            <MoneyInput currency={cur} value={mobile} onChange={setMobile} />
          </Field>
        </div>
      </div>

      <div className={`variance ${variance === 0 ? 'ok' : variance > 0 ? 'short' : 'over'}`}>
        <dl className="kv" style={{ color: 'var(--ink)' }}>
          <dt>Sales at recorded prices</dt>
          <dd>
            <Money amount={expected} currency={cur} />
          </dd>
          <dt>Spent from sales</dt>
          <dd>
            − <Money amount={spent} currency={cur} />
          </dd>
          <dt>Handed over</dt>
          <dd>
            − <Money amount={handed} currency={cur} />
          </dd>
          <dt className="total">{variance === 0 ? 'Balanced' : variance > 0 ? 'Short by' : 'Over by'}</dt>
          <dd className="total" style={{ color: 'inherit' }}>
            {variance === 0 ? <Icon name="check" /> : <Money amount={Math.abs(variance)} currency={cur} strong />}
          </dd>
        </dl>
      </div>
      <Field label={variance !== 0 ? 'Explain the difference' : 'Note (optional)'}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={variance > 0 ? 'e.g. gave a discount, wrong change…' : ''} />
      </Field>
      {missingPrice && <div className="error-box">Some garments have no selling price. A manager must set prices before this day can be closed.</div>}
      <button
        className="btn btn-primary btn-lg"
        disabled={busy || missingPrice || cash === null || expenses.some((e) => !e.description.trim() || !e.amount)}
        onClick={async () => {
          if (variance !== 0 && !note.trim()) {
            toast('Please explain the difference before closing.', 'error');
            return;
          }
          setBusy(true);
          const ok = await save(
            () =>
              store.submit('worker.settle', {
                workerId: ctx.workerId,
                locationId: ctx.locationId,
                workDate: ctx.workDate,
                currency: cur,
                lines: payloadLines,
                cash: cash ?? 0,
                mobile: mobile ?? 0,
                expenses: expenses.map((e) => ({ description: e.description.trim(), amount: e.amount ?? 0 })),
                note: note.trim(),
              }),
            'Day closed',
          );
          setBusy(false);
          if (ok) navigate(ctx.back);
        }}
      >
        <Icon name="lock" /> Close the day
      </button>
      <p className="hint">Amounts are saved in official KMF. The local count (÷5) is only shown to help you count.</p>
    </div>
  );
}
