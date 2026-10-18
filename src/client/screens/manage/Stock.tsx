import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { href, navigate } from '../../lib/router';
import { garmentJourney, stockByLocation, sumRows, weightedCosts, type StockRow } from '../../../shared/queries';
import { describeAccount, priceFor } from '../../../shared/engine';
import { A, K, type PriceList } from '../../../shared/model';
import { ADJUST_REASONS } from '../../../shared/ops';
import { businessDate, fmtDate, fmtDateShort } from '../../../shared/time';
import { rich, useT } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import { Icon } from '../../ui/Icon';
import { Empty, Field, GarmentLabel, Money, PageHead, Qty, Sheet, save } from '../../ui/kit';
import { LinesEditor, type EditLine } from '../../ui/LinesEditor';
import { DownloadButton } from '../../ui/Reporting';
import { movementsReport, stockReport } from '../../../shared/reports';
import { reportCtx } from '../../lib/report-ctx';
import { ScopeSwitch } from './Overview';

const COLS: { key: keyof Omit<StockRow, 'gt'> }[] = [{ key: 'avail' }, { key: 'withWorkers' }, { key: 'incoming' }, { key: 'inspection' }, { key: 'awaiting' }, { key: 'rejected' }, { key: 'sold' }];

export function StockPage() {
  const { ledger, version, prefs, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const [adjust, setAdjust] = useState(false);
  const byLoc = useMemo(() => stockByLocation(ledger), [ledger, version]);
  const scope = prefs.scope;
  const rows = useMemo(() => {
    const merged = new Map<string, StockRow>();
    for (const [loc, m] of byLoc) {
      if (scope && loc !== scope) continue;
      for (const [gt, r] of m) {
        const acc = merged.get(gt) ?? { gt, avail: 0, withWorkers: 0, incoming: 0, inspection: 0, awaiting: 0, rejected: 0, sold: 0 };
        for (const c of COLS) acc[c.key] += r[c.key];
        merged.set(gt, acc);
      }
    }
    return lk.garments.map((g) => merged.get(g.id) ?? { gt: g.id, avail: 0, withWorkers: 0, incoming: 0, inspection: 0, awaiting: 0, rejected: 0, sold: 0 });
  }, [byLoc, scope, lk.garments]);
  const visibleCols = COLS.filter((c) => rows.some((r) => r[c.key] !== 0) || c.key === 'avail');
  const totals = sumRows(rows);

  return (
    <div className="page">
      <PageHead
        title={t('nav.stock')}
        lead={t('stk.lead')}
        actions={
          <>
            <ScopeSwitch />
            <DownloadButton label={t('stk.now')} build={() => stockReport(reportCtx(), { locationId: scope })} />
            <DownloadButton label={t('stk.movements')} build={() => movementsReport(reportCtx(), { from: null, to: null, locationId: scope })} />
            {user!.caps.includes('stock.adjust') && (
              <button className="btn" onClick={() => setAdjust(true)}>
                <Icon name="edit" size={18} /> {t('stk.adjust')}
              </button>
            )}
          </>
        }
      />
      {!scope && (
        <div className="grid cols-3">
          {lk.locations.map((l) => {
            const sum = sumRows(byLoc.get(l.id)?.values() ?? []);
            return (
              <button key={l.id} className="card stat" style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => store.setPrefs({ scope: l.id })}>
                <span className="eyebrow">{l.name}</span>
                <span className="stat-value">{sum.avail.toLocaleString('en-US')}</span>
                <span className="stat-sub">
                  {t('stk.ready')}
                  {sum.withWorkers ? t('stk.nWith', { n: sum.withWorkers }) : ''}
                  {sum.incoming ? t('stk.nIncoming', { n: sum.incoming }) : ''}
                  {sum.inspection ? t('stk.nInspect', { n: sum.inspection }) : ''}
                </span>
              </button>
            );
          })}
        </div>
      )}
      <section className="card">
        {lk.garments.length === 0 ? (
          <Empty icon="tag" title={t('stk.noGarments')}>
            {rich(t('stk.addFirst'), { link: <a href={href('/catalogue')}>{t('nav.catalogue')}</a> })}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>{t('c.garment')}</th>
                  {visibleCols.map((c) => (
                    <th key={c.key} className="n" title={t(`stk.hint.${c.key}` as Key)}>
                      {t(`stk.col.${c.key}` as Key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.gt} className="clickable" onClick={() => navigate(`/stock/${r.gt}`)}>
                    <td>
                      <GarmentLabel g={lk.garment(r.gt)} />
                    </td>
                    {visibleCols.map((c) => (
                      <td key={c.key} className="n" style={r[c.key] < 0 ? { color: 'var(--hibiscus)', fontWeight: 700 } : undefined}>
                        <Qty n={r[c.key]} unit="" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t('stk.total')}</td>
                  {visibleCols.map((c) => (
                    <td key={c.key} className="n">
                      {totals[c.key].toLocaleString('en-US')}
                    </td>
                  ))}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
      <p className="hint">{t('stk.redHint')}</p>
      {adjust && <AdjustSheet onClose={() => setAdjust(false)} defaultLoc={scope} />}
    </div>
  );
}

function AdjustSheet({ onClose, defaultLoc }: { onClose: () => void; defaultLoc: string | null }) {
  const { ledger } = useApp();
  const lk = useLookups();
  const t = useT();
  const [loc, setLoc] = useState(defaultLoc ?? lk.locations[0]?.id ?? '');
  const [reason, setReason] = useState<(typeof ADJUST_REASONS)[number]>('count_correction');
  const [lines, setLines] = useState<EditLine[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const valid = lines.length > 0 && lines.every((l) => l.qty !== 0) && (reason !== 'other' || note.trim());
  return (
    <Sheet
      title={t('stk.adjTitle')}
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            {t('c.cancel')}
          </button>
          <button
            className="btn btn-primary"
            disabled={!valid || busy}
            onClick={async () => {
              setBusy(true);
              const ok = await save(
                () => store.submit('stock.adjust', { locationId: loc, date: businessDate(), reason, lines: lines.map((l) => ({ garmentTypeId: l.garmentTypeId, delta: l.qty })), note: note.trim() }),
                t('stk.adjusted'),
              );
              setBusy(false);
              if (ok) onClose();
            }}
          >
            {t('stk.saveAdj')}
          </button>
        </>
      }
    >
      <p className="soft">{t('stk.adjLead')}</p>
      <div className="form-grid">
        <Field label={t('place.label')}>
          <select className="select" value={loc} onChange={(e) => setLoc(e.target.value)}>
            {lk.locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label={t('stk.reason')}>
          <select className="select" value={reason} onChange={(e) => setReason(e.target.value as typeof reason)}>
            {ADJUST_REASONS.map((r) => (
              <option key={r} value={r}>
                {t(`lbl.adjust.${r}`)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <LinesEditor garments={lk.garments} lines={lines} onChange={setLines} signed available={(gt) => ledger.balance(A.avail(loc), gt)} />
      <Field label={t('stk.note')}>
        <textarea className="textarea" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('stk.whatHappened')} />
      </Field>
    </Sheet>
  );
}

export function GarmentDetail({ id }: { id: string }) {
  const { ledger, version, user } = useApp();
  const lk = useLookups();
  const t = useT();
  const g = lk.garment(id);
  const journey = useMemo(() => garmentJourney(ledger, id).reverse().slice(0, 80), [ledger, version, id]);
  const byLoc = useMemo(() => stockByLocation(ledger), [ledger, version]);
  const missing = new Set<string>();
  const cost = user!.caps.includes('costs.view') ? weightedCosts(ledger, 'KES', missing).get(id) : undefined;
  if (!g) return <Empty title={t('stk.notFound')} />;
  const get = (k: string) => ledger.get(k);
  return (
    <div className="page">
      <PageHead
        eyebrow={<a href={href('/stock')}>{t('stk.back')}</a>}
        title={<GarmentLabel g={g} />}
        lead={[lk.size(g.sizeCategoryId)?.name, lk.vendor(g.vendorId)?.name ? t('stk.from', { vendor: lk.vendor(g.vendorId)!.name }) : null, g.description].filter(Boolean).join(' · ')}
      />
      <div className="grid cols-3">
        {lk.locations.map((l) => {
          const r = byLoc.get(l.id)?.get(id);
          const price = priceFor(get, id, l.id, businessDate());
          return (
            <div key={l.id} className="card stat">
              <span className="eyebrow">{l.name}</span>
              <span className="stat-value">{r?.avail ?? 0}</span>
              <span className="stat-sub">
                {t('stk.ready')}
                {r?.withWorkers ? t('stk.nWith', { n: r.withWorkers }) : ''}
                {r?.incoming ? t('stk.nIncoming', { n: r.incoming }) : ''}
                {r?.sold ? t('stk.nSold', { n: r.sold }) : ''}
              </span>
              {price && (
                <span className="stat-sub">
                  {rich(t('stk.sellsAt'), { amount: <Money amount={price.retail} currency={price.currency} /> })}
                  {price.wholesale ? (
                    <>
                      {' · '}
                      {rich(t('stk.wholesaleAmt'), { amount: <Money amount={price.wholesale} currency={price.currency} /> })}
                    </>
                  ) : null}
                </span>
              )}
            </div>
          );
        })}
        {cost && (
          <div className="card stat">
            <span className="eyebrow">{t('stk.avgCost')}</span>
            <span className="stat-value">{cost.cost === null ? '—' : <Money amount={Math.round(cost.cost)} currency="KES" />}</span>
            <span className="stat-sub">{t('stk.overN', { n: cost.pieces })}</span>
          </div>
        )}
      </div>
      <PriceHistory gt={id} />
      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('stk.journey')}</span>
          <span className="muted">{t('stk.newest')}</span>
        </div>
        <div className="card-body">
          {journey.length === 0 && <span className="muted">{t('stk.noMoves')}</span>}
          <div className="timeline">
            {journey.map((s, i) => {
              const rec = ledger.getOp(s.opId);
              return (
                <div key={`${s.opId}-${i}`} className="tl-item">
                  <span className="tl-time">{rec ? fmtDateShort(businessDate(rec.op.deviceTime)) : ''}</span>
                  <span className="tl-rail">
                    <span className={`tl-knot ${s.to.startsWith('sold') ? 'green' : s.to.startsWith('transit') ? 'lagoon' : s.to.startsWith('worker') ? 'saffron' : s.to.startsWith('adj') ? 'red' : ''}`} />
                  </span>
                  <div className="stack-sm">
                    <span>
                      <strong className="num">{s.qty}</strong> · {describeAccount(s.from, get, t)} <Icon name="arrowRight" size={14} /> {describeAccount(s.to, get, t)}
                    </span>
                    {rec && <span className="hint">{describeOp(rec.op, lk, ledger, t)}</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function PriceHistory({ gt }: { gt: string }) {
  const { ledger } = useApp();
  const lk = useLookups();
  const t = useT();
  const lists = lk.locations.map((l) => ({ l, list: ledger.get(K.price(gt, l.id)) as PriceList | undefined })).filter((x) => x.list?.entries.length);
  if (!lists.length) return null;
  return (
    <section className="card">
      <div className="card-head">
        <span className="section-title">{t('stk.prices')}</span>
        <a className="btn btn-ghost btn-sm" href={href('/catalogue?tab=prices')}>
          {t('stk.change')}
        </a>
      </div>
      <div className="table-wrap" style={{ marginTop: 8 }}>
        <table className="data">
          <thead>
            <tr>
              <th>{t('place.label')}</th>
              <th>{t('st.since')}</th>
              <th className="n">{t('stk.retail')}</th>
              <th className="n">{t('stk.wholesale')}</th>
            </tr>
          </thead>
          <tbody>
            {lists.flatMap(({ l, list }) =>
              [...list!.entries].reverse().map((e) => (
                <tr key={e.id}>
                  <td>{l.name}</td>
                  <td>{fmtDate(e.effectiveFrom)}</td>
                  <td className="n">
                    <Money amount={e.retail} currency={e.currency} />
                  </td>
                  <td className="n">{e.wholesale ? <Money amount={e.wholesale} currency={e.currency} /> : '—'}</td>
                </tr>
              )),
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
