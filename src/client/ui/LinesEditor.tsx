import { useState } from 'react';
import type { GarmentType } from '../../shared/model';
import type { Currency } from '../../shared/money';
import { Icon } from './Icon';
import { GarmentLabel, MoneyInput, Stepper } from './kit';
import { useT } from '../lib/i18n';

export interface EditLine {
  garmentTypeId: string;
  qty: number;
  unitCost?: number | null;
}

/** Pick garments and quantities (optionally a unit cost per line). */
export function LinesEditor({
  garments,
  lines,
  onChange,
  costCurrency,
  available,
  signed,
}: {
  garments: GarmentType[];
  lines: EditLine[];
  onChange: (lines: EditLine[]) => void;
  costCurrency?: Currency;
  available?: (gt: string) => number;
  signed?: boolean;
}) {
  const t = useT();
  const [pick, setPick] = useState('');
  const used = new Set(lines.map((l) => l.garmentTypeId));
  const options = garments.filter((g) => g.active && !used.has(g.id));
  const set = (i: number, patch: Partial<EditLine>) => onChange(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  return (
    <div className="stack">
      {lines.length > 0 && (
        <div className="card">
          {lines.map((l, i) => {
            const g = garments.find((x) => x.id === l.garmentTypeId);
            const avail = available?.(l.garmentTypeId);
            return (
              <div key={l.garmentTypeId} className="garment-row" style={{ gridTemplateColumns: 'minmax(0,1fr) auto' }}>
                <div className="stack-sm" style={{ minWidth: 0 }}>
                  <GarmentLabel g={g} />
                  {avail !== undefined && <span className="hint">{t('le.available', { n: avail })}</span>}
                </div>
                <div className="row" style={{ gap: 8, justifyContent: 'flex-end' }}>
                  {signed ? (
                    <div className="row" style={{ gap: 4 }}>
                      <button type="button" className={`btn btn-sm ${l.qty < 0 ? 'btn-danger' : ''}`} onClick={() => set(i, { qty: -Math.abs(l.qty || 1) })}>
                        {t('le.remove')}
                      </button>
                      <button type="button" className={`btn btn-sm ${l.qty > 0 ? 'btn-primary' : ''}`} onClick={() => set(i, { qty: Math.abs(l.qty || 1) })}>
                        {t('le.add')}
                      </button>
                      <Stepper value={Math.abs(l.qty)} onChange={(v) => set(i, { qty: (l.qty < 0 ? -1 : 1) * v })} />
                    </div>
                  ) : (
                    <Stepper value={l.qty} onChange={(v) => set(i, { qty: v })} label={g?.code} />
                  )}
                  {costCurrency && (
                    <div style={{ width: 150 }}>
                      <MoneyInput currency={costCurrency} value={l.unitCost ?? null} onChange={(v) => set(i, { unitCost: v })} placeholder={t('le.costEach')} />
                    </div>
                  )}
                  <button type="button" className="icon-btn" aria-label={t('le.removeLine')} onClick={() => onChange(lines.filter((_, j) => j !== i))}>
                    <Icon name="x" size={18} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {options.length > 0 && (
        <div className="row">
          <select
            className="select"
            style={{ flex: 1 }}
            value={pick}
            onChange={(e) => {
              const id = e.target.value;
              if (id) onChange([...lines, { garmentTypeId: id, qty: signed ? -1 : 0, ...(costCurrency ? { unitCost: null } : {}) }]);
              setPick('');
            }}
          >
            <option value="">{t('le.addGarment')}</option>
            {options.map((g) => (
              <option key={g.id} value={g.id}>
                {g.code} — {g.name}
                {available ? t('le.availableP', { n: available(g.id) }) : ''}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
