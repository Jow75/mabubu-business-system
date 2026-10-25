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
import { rich, useT } from '../../lib/i18n';
import { useHoldReload } from '../../lib/update';

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
  const t = useT();
  if (ctx.self) return null;
  return (
    <div className="info-box row">
      <Icon name="people" size={18} /> {t('sd.recordingFor')} <strong>{ctx.worker?.name ?? t('c.worker')}</strong> · {fmtDate(ctx.workDate)} · {ctx.loc?.name}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function TakeGarments() {
  const ctx = useDayContext();
  const t = useT();
  const { ledger } = useApp();
  const [qty, setQty] = useState<Record<string, number>>({});
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  useHoldReload(Object.values(qty).some((n) => n > 0));
  const garments = ctx.lk.activeGarments.filter((g) => !q || `${g.code} ${g.name}`.toLowerCase().includes(q.toLowerCase()));
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([garmentTypeId, n]) => ({ garmentTypeId, qty: n }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const cur = (ctx.loc?.currency ?? 'KMF') as Currency;
  const value = lines.reduce((s, l) => s + lineTotal(l.qty, priceFor((k) => ledger.get(k), l.garmentTypeId, ctx.locationId, ctx.workDate)?.retail ?? 0), 0);

  if (!ctx.loc) return <Empty icon="pin" title={t('sd.noSelling')}>{t('sd.noSellingBody')}</Empty>;
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc.name}`} title={t('w.take')} lead={t('sd.takeLead')} />
      <WhoBar ctx={ctx} />
      <input className="input" placeholder={t('sd.search')} value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="card">
        {garments.length === 0 && <Empty title={t('sd.noGarments')} />}
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
                    ` · ${t('sd.noPrice')}`
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
          <div style={{ fontWeight: 700, fontSize: 18 }}>{t('c.nPcs', { n: total })}</div>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            {rich(t('sd.worth'), { amount: <Money amount={value} currency={cur} /> })}
          </div>
        </div>
        <button
          className="btn btn-accent btn-lg"
          disabled={busy || total === 0}
          onClick={async () => {
            setBusy(true);
            const ok = await save(() => store.submit('worker.issue', { workerId: ctx.workerId, locationId: ctx.locationId, workDate: ctx.workDate, lines }), t('sd.takenToast', { n: total }));
            setBusy(false);
            if (ok) navigate(ctx.back);
          }}
        >
          <Icon name="check" /> {t('c.save')}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export function ReturnGarments() {
  const ctx = useDayContext();
  const t = useT();
  const { ledger, version } = useApp();
  const holding = useMemo(() => workerHolding(ledger, ctx.workerId, ctx.locationId), [ledger, ctx.workerId, ctx.locationId, version]);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);
  useHoldReload(Object.values(qty).some((n) => n > 0));
  const lines = Object.entries(qty)
    .filter(([, n]) => n > 0)
    .map(([garmentTypeId, n]) => ({ garmentTypeId, qty: n }));
  const total = lines.reduce((s, l) => s + l.qty, 0);
  const held = [...holding.entries()].filter(([, n]) => n > 0);

  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc?.name ?? ''}`} title={t('w.return')} lead={t('sd.returnLead')} />
      <WhoBar ctx={ctx} />
      <div className="card">
        {held.length === 0 && <Empty title={t('sd.nothingReturn')}>{t('sd.nothingReturnBody')}</Empty>}
        {held.map(([gt, n]) => (
          <div key={gt} className={`garment-row ${qty[gt] ? 'active' : ''}`}>
            <div className="stack-sm" style={{ minWidth: 0 }}>
              <GarmentLabel g={ctx.lk.garment(gt)} stacked />
              <span className="hint">{t('sd.youHold', { n })}</span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setQty({ ...qty, [gt]: n })}>
                {t('sd.all')}
              </button>
              <Stepper value={qty[gt] ?? 0} max={ctx.self ? n : undefined} onChange={(v) => setQty({ ...qty, [gt]: v })} label={ctx.lk.garment(gt)?.code} />
            </div>
          </div>
        ))}
      </div>
      {held.length > 0 && (
        <div className="sticky-foot">
          <div style={{ fontWeight: 700, fontSize: 18 }}>{t('sd.nBack', { n: total })}</div>
          <button
            className="btn btn-accent btn-lg"
            disabled={busy || total === 0}
            onClick={async () => {
              setBusy(true);
              const ok = await save(() => store.submit('worker.return', { workerId: ctx.workerId, locationId: ctx.locationId, workDate: ctx.workDate, lines }), t('sd.returnedToast', { n: total }));
              setBusy(false);
              if (ok) navigate(ctx.back);
            }}
          >
            <Icon name="check" /> {t('c.save')}
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
  const t = useT();
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
  useHoldReload(Object.keys(lines).length > 0 || cash !== null || mobile !== null || expenses.length > 0 || note !== '');

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
        <PageHead title={t('sd.alreadyClosed')} lead={t('sd.alreadyClosedLead', { date: fmtDate(ctx.workDate) })} />
        <button className="btn" onClick={() => navigate(ctx.back)}>
          {t('c.back')}
        </button>
      </div>
    );
  }

  return (
    <div className="page" style={{ maxWidth: 760 }}>
      <PageHead eyebrow={`${fmtDate(ctx.workDate)} · ${ctx.loc?.name ?? ''}`} title={t('w.closeDay')} lead={t('sd.closeLead')} />
      <WhoBar ctx={ctx} />

      <div className="card">
        <div className="card-head">
          <span className="section-title">{t('sd.step1')}</span>
          <span className="muted">{t('c.nPcs', { n: soldTotal })}</span>
        </div>
        <div className="card-body" style={{ paddingTop: 6 }}>
          {held.length === 0 && <div className="muted">{t('sd.holdNone')}</div>}
          {held.map(([gt, n]) => {
            const l = lineOf(gt, n);
            const pr = prices.get(gt)!;
            const open = showDetail[gt];
            return (
              <div key={gt} style={{ padding: '10px 0', borderTop: '1px solid var(--rule)' }}>
                <div className="row-between">
                  <GarmentLabel g={ctx.lk.garment(gt)} stacked />
                  <span className="num" style={{ fontWeight: 650 }}>
                    {t('sd.soldOf', { sold: l.sold, held: n })}
                  </span>
                </div>
                <div className="row-between" style={{ marginTop: 6 }}>
                  <span className="hint">
                    {pr.retail ? (
                      <>
                        {rich(t('sd.each'), { amount: <Money amount={pr.retail} currency={cur} /> })}
                      </>
                    ) : (
                      <span style={{ color: 'var(--hibiscus)' }}>{t('sd.noPriceAsk')}</span>
                    )}
                    {l.wholesaleQty > 0 && <> · {t('sd.nWholesale', { n: l.wholesaleQty })}</>}
                    {l.carried > 0 && <> · {t('sd.nKept', { n: l.carried })}</>}
                    {l.lost > 0 && <> · {t('sd.nLost', { n: l.lost })}</>}
                  </span>
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowDetail({ ...showDetail, [gt]: !open })}>
                    {open ? t('c.done') : t('sd.detailToggle')}
                  </button>
                </div>
                {open && (
                  <div className="form-grid" style={{ marginTop: 10 }}>
                    <Field label={t('sd.soldWholesale')}>
                      <Stepper value={l.wholesaleQty} max={l.sold} onChange={(v) => setLine(gt, n, { wholesaleQty: v })} />
                    </Field>
                    {l.wholesaleQty > 0 && (
                      <Field label={t('sd.wholesaleEach')}>
                        <MoneyInput currency={cur} value={l.wholesalePrice} onChange={(v) => setLine(gt, n, { wholesalePrice: v ?? 0 })} />
                      </Field>
                    )}
                    <Field label={t('sd.kept')}>
                      <Stepper value={l.carried} max={n - l.lost} onChange={(v) => setLine(gt, n, { carried: v })} />
                    </Field>
                    <Field label={t('sd.lost')}>
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
          <span className="section-title">{t('sd.step2')}</span>
          <button type="button" className="btn btn-sm" onClick={() => setExpenses([...expenses, { description: '', amount: null }])}>
            <Icon name="plus" size={16} /> {t('c.add')}
          </button>
        </div>
        <div className="card-body stack">
          {expenses.length === 0 && <span className="muted">{t('sd.nothingSpent')}</span>}
          {expenses.map((e, i) => (
            <div key={i} className="form-grid" style={{ alignItems: 'end' }}>
              <Field label={t('sd.whatFor')}>
                <input className="input" value={e.description} onChange={(ev) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, description: ev.target.value } : x)))} placeholder={t('sd.whatForPh')} />
              </Field>
              <div className="row" style={{ alignItems: 'flex-end', flexWrap: 'nowrap' }}>
                <div style={{ flex: 1 }}>
                  <Field label={t('sd.amount')}>
                    <MoneyInput currency={cur} value={e.amount} onChange={(v) => setExpenses(expenses.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
                  </Field>
                </div>
                <button type="button" className="icon-btn" aria-label={t('c.remove')} onClick={() => setExpenses(expenses.filter((_, j) => j !== i))}>
                  <Icon name="x" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="section-title">{t('sd.step3')}</span>
        </div>
        <div className="card-body form-grid">
          <Field label={t('sd.cash')}>
            <MoneyInput big currency={cur} value={cash} onChange={setCash} />
          </Field>
          <Field label={t('sd.mobile')}>
            <MoneyInput currency={cur} value={mobile} onChange={setMobile} />
          </Field>
        </div>
      </div>

      <div className={`variance ${variance === 0 ? 'ok' : variance > 0 ? 'short' : 'over'}`}>
        <dl className="kv" style={{ color: 'var(--ink)' }}>
          <dt>{t('sd.salesAtPrices')}</dt>
          <dd>
            <Money amount={expected} currency={cur} />
          </dd>
          <dt>{t('sd.spentFromSales')}</dt>
          <dd>
            − <Money amount={spent} currency={cur} />
          </dd>
          <dt>{t('c.handedOver')}</dt>
          <dd>
            − <Money amount={handed} currency={cur} />
          </dd>
          <dt className="total">{variance === 0 ? t('c.balanced') : variance > 0 ? t('sd.shortBy') : t('sd.overBy')}</dt>
          <dd className="total" style={{ color: 'inherit' }}>
            {variance === 0 ? <Icon name="check" /> : <Money amount={Math.abs(variance)} currency={cur} strong />}
          </dd>
        </dl>
      </div>
      <Field label={variance !== 0 ? t('sd.explain') : t('sd.noteOptional')}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={variance > 0 ? t('sd.explainPh') : ''} />
      </Field>
      {missingPrice && <div className="error-box">{t('sd.missingPrice')}</div>}
      <button
        className="btn btn-primary btn-lg"
        disabled={busy || missingPrice || cash === null || expenses.some((e) => !e.description.trim() || !e.amount)}
        onClick={async () => {
          if (variance !== 0 && !note.trim()) {
            toast(t('sd.explainFirst'), 'error');
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
            t('sd.closedToast'),
          );
          setBusy(false);
          if (ok) navigate(ctx.back);
        }}
      >
        <Icon name="lock" /> {t('w.closeDay')}
      </button>
      <p className="hint">{t('sd.kmfNote')}</p>
    </div>
  );
}
