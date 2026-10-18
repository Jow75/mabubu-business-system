import { useMemo, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { useLookups } from '../../lib/lookups';
import type { Shipment } from '../../../shared/model';
import { CURRENCY_CODES, type Currency } from '../../../shared/money';
import { EXPENSE_CATEGORIES } from '../../../shared/ops';
import { businessDate, fmtDateShort } from '../../../shared/time';
import { expenseTotals, expensesReport, selectExpenses, type ExpenseFilter } from '../../../shared/reports';
import { EXPENSE_LABEL } from '../../lib/labels';
import { reportCtx } from '../../lib/report-ctx';
import { Icon } from '../../ui/Icon';
import { Empty, Field, Money, MoneyInput, PageHead, Sheet, save } from '../../ui/kit';
import { DateRangeControl, DownloadButton, PlaceNotice, PlaceSelect, useDateRange } from '../../ui/Reporting';
import { VoidButton } from '../../ui/VoidButton';

export function ExpensesPage() {
  const { ledger, version, user, prefs, records } = useApp();
  const lk = useLookups();
  const [add, setAdd] = useState(false);
  const dr = useDateRange('30');
  const filter: ExpenseFilter = { from: dr.range.from, to: dr.range.to, locationId: prefs.scope, preset: dr.range.label };
  const list = useMemo(() => selectExpenses(ledger, filter), [ledger, version, filter.from, filter.to, filter.locationId]);
  const hidden = useMemo(() => (prefs.scope ? selectExpenses(ledger, { ...filter, locationId: null }).length - list.length : 0), [ledger, version, list, prefs.scope]);
  const totals = expenseTotals(list);
  return (
    <div className="page">
      <PageHead
        title="Expenses"
        lead="Money spent running the business. Workers’ spending during a sales day is recorded when they close the day."
        actions={
          <>
            <DownloadButton build={() => expensesReport(reportCtx(), filter)} />
            {user!.caps.includes('expenses') && (
              <button className="btn btn-primary" onClick={() => setAdd(true)}>
                <Icon name="plus" size={18} /> Add expense
              </button>
            )}
          </>
        }
      />
      <div className="row">
        <DateRangeControl r={dr} presets={['30', '90', 'all', 'custom']} />
        <PlaceSelect />
      </div>
      <PlaceNotice hidden={hidden} what="what.expenses" />
      <div className="grid cols-4">
        {[...totals].map(([cur, amt]) => (
          <div key={cur} className="card stat">
            <span className="eyebrow">Total in {cur}</span>
            <span className="stat-value">
              <Money amount={amt} currency={cur} />
            </span>
          </div>
        ))}
      </div>
      <section className="card">
        {list.length === 0 ? (
          <Empty icon="receipt" title="No expenses match these filters">
            {hidden > 0 ? `${hidden} expense${hidden === 1 ? ' is' : 's are'} at other places — choose “All places”.` : 'Try a longer period.'}
          </Empty>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Place</th>
                  <th>Kind</th>
                  <th>What for</th>
                  <th className="n">Amount</th>
                  <th>By</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((e) => (
                  <tr key={e.opId} style={e.cancelled ? { opacity: 0.5, textDecoration: 'line-through' } : undefined}>
                    <td className="nowrap">{fmtDateShort(e.date)}</td>
                    <td>{lk.locName(e.locationId)}</td>
                    <td>{EXPENSE_LABEL[e.category]}</td>
                    <td>
                      {e.description}
                      {e.pending && <span className="pill saffron">Not synced yet</span>}
                    </td>
                    <td className="n">
                      <Money amount={e.amount} currency={e.currency} />
                    </td>
                    <td className="muted">{records.get(e.opId)?.actorName ?? lk.personName(e.actorId)}</td>
                    <td>
                      <VoidButton opId={e.opId} label="Cancel" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      {add && <ExpenseSheet onClose={() => setAdd(false)} />}
    </div>
  );
}

function ExpenseSheet({ onClose }: { onClose: () => void }) {
  const { ledger, prefs } = useApp();
  const lk = useLookups();
  const [loc, setLoc] = useState(prefs.scope ?? lk.locations[0]?.id ?? '');
  const [currency, setCurrency] = useState<Currency>(lk.loc(loc)?.currency ?? 'KES');
  const [category, setCategory] = useState<(typeof EXPENSE_CATEGORIES)[number]>('transport');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | null>(null);
  const [date, setDate] = useState(businessDate());
  const [shipmentId, setShipmentId] = useState('');
  const shipments = ledger.list<Shipment>('shipment').filter((s) => s.status !== 'voided');
  return (
    <Sheet
      title="Add expense"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={!amount || !description.trim() || !loc}
            onClick={async () => {
              if (await save(() => store.submit('expense.record', { locationId: loc, date, category, description: description.trim(), amount: amount ?? 0, currency, shipmentId: shipmentId || null }), 'Expense saved')) onClose();
            }}
          >
            Save expense
          </button>
        </>
      }
    >
      <div className="form-grid">
        <Field label="Place">
          <select
            className="select"
            value={loc}
            onChange={(e) => {
              setLoc(e.target.value);
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
        <Field label="Kind">
          <select className="select" value={category} onChange={(e) => setCategory(e.target.value as typeof category)}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {EXPENSE_LABEL[c]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="What was it for?">
        <input className="input" autoFocus value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="form-grid">
        <Field label="Amount">
          <MoneyInput currency={currency} value={amount} onChange={setAmount} />
        </Field>
        <Field label="Currency">
          <select className="select" value={currency} onChange={(e) => setCurrency(e.target.value as Currency)}>
            {CURRENCY_CODES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </Field>
      </div>
      {shipments.length > 0 && (
        <Field label="Linked to a shipment? (optional)">
          <select className="select" value={shipmentId} onChange={(e) => setShipmentId(e.target.value)}>
            <option value="">No</option>
            {shipments.map((s) => (
              <option key={s.id} value={s.id}>
                {s.code} · {fmtDateShort(s.date)}
              </option>
            ))}
          </select>
        </Field>
      )}
    </Sheet>
  );
}
