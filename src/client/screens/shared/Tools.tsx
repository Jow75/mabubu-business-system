import { useState } from 'react';
import { store, useApp } from '../../lib/store';
import { describeOp, useLookups } from '../../lib/lookups';
import { formatLocalCount, formatMoney } from '../../../shared/money';
import { fmtDateTime } from '../../../shared/time';
import { Icon } from '../../ui/Icon';
import { LocalCountToggle, Monogram, PageHead, Seg, Stepper } from '../../ui/kit';
import { errText, useT } from '../../lib/i18n';
import { LanguageSwitch } from '../auth/Language';

/** Optional banknote counter. Never part of the sales flow. */
export function CashCounter() {
  const lk = useLookups();
  const t = useT();
  const denoms = lk.settings.denominations;
  const [n, setN] = useState<Record<number, number>>({});
  const total = denoms.reduce((s, d) => s + d * (n[d] ?? 0), 0);
  return (
    <div className="page" style={{ maxWidth: 560 }}>
      <PageHead eyebrow={t('tool.eyebrow')} title={t('nav.counter')} lead={t('tool.counterLead')} />
      <div className="card card-pad selvedge" style={{ paddingLeft: 26 }}>
        <div className="eyebrow">{t('tool.total')}</div>
        <div className="counter-total">{formatMoney('KMF', total)}</div>
        <div style={{ marginTop: 4 }}>
          <span className="local">{formatLocalCount(total)} {lk.settings.localCountLabel}</span>
        </div>
      </div>
      <div className="card">
        {denoms.map((d) => (
          <div key={d} className="garment-row">
            <div>
              <strong className="num">{d.toLocaleString('en-US')}</strong> <span className="muted">{t('tool.note')}</span>
              <div className="hint">
                {n[d] ? `${(n[d] ?? 0) * d} KMF` : ' '}
              </div>
            </div>
            <Stepper value={n[d] ?? 0} onChange={(v) => setN({ ...n, [d]: v })} label={t('tool.notes', { d })} />
          </div>
        ))}
      </div>
      <button className="btn" onClick={() => setN({})}>
        {t('c.clear')}
      </button>
      <p className="hint">{t('tool.noteValues')}</p>
      <a className="btn btn-ghost" href="#/convert" style={{ alignSelf: 'flex-start' }}>
        <Icon name="swap" size={18} /> {t('nav.convert')}
      </a>
    </div>
  );
}

/** Account, sync status and records that need attention. */
export function SyncCenter() {
  const { user, sync, records, ledger, prefs, demo, persisted, online } = useApp();
  const lk = useLookups();
  const t = useT();
  const mine = [...records.values()].filter((r) => r.op.actorId === user!.id);
  const pending = mine.filter((r) => r.status === 'pending').sort((a, b) => a.localOrder - b.localOrder);
  const rejected = mine.filter((r) => r.status === 'rejected');
  return (
    <div className="page" style={{ maxWidth: 720 }}>
      <PageHead eyebrow={t('me.eyebrow')} title={t('nav.account')} />
      <section className="card card-pad row-between">
        <div className="row">
          <Monogram name={user!.name} id={user!.id} />
          <div>
            <strong style={{ fontSize: 17 }}>{user!.name}</strong>
            <div className="muted">
              {t(`role.${user!.role}`)}
              {user!.locationId ? ` · ${lk.locName(user!.locationId)}` : ''}
            </div>
          </div>
        </div>
        <button className="btn" onClick={() => store.lock()}>
          <Icon name="lock" size={18} /> {t('me.lock')}
        </button>
      </section>

      <section className="card">
        <div className="card-head">
          <span className="section-title">{t('me.sync')}</span>
          {!demo && (
            <button className="btn btn-sm" onClick={() => void store.syncNow()} disabled={!online}>
              <Icon name="refresh" size={16} /> {t('me.syncNow')}
            </button>
          )}
        </div>
        <div className="card-body stack">
          {demo ? (
            <div className="note-box">{t('me.demoNote')}</div>
          ) : (
            <dl className="kv">
              <dt>{t('me.connection')}</dt>
              <dd>{online ? t('c.online') : t('c.offline')}</dd>
              <dt>{t('me.lastSynced')}</dt>
              <dd>{sync.lastSyncAt ? fmtDateTime(sync.lastSyncAt) : t('c.notYet')}</dd>
              <dt>{t('me.waitingCount')}</dt>
              <dd>{sync.pending}</dd>
              <dt>{t('me.storage')}</dt>
              <dd>{persisted === null ? '—' : persisted ? t('c.yes') : t('me.storageNo')}</dd>
            </dl>
          )}
          {!demo && persisted === false && <div className="note-box">{t('me.storageWarn')}</div>}
          {sync.lastError && <div className="error-box">{errText(sync.lastError)}</div>}
          {pending.length > 0 && (
            <div className="stack-sm">
              <span className="eyebrow">{t('me.waiting')}</span>
              {pending.map((r) => (
                <div key={r.id} className="row-between" style={{ fontSize: 14 }}>
                  <span>{describeOp(r.op, lk, ledger, t)}</span>
                  <span className="muted mono">{fmtDateTime(r.op.deviceTime)}</span>
                </div>
              ))}
            </div>
          )}
          {rejected.length > 0 && (
            <div className="stack-sm">
              <span className="eyebrow" style={{ color: 'var(--hibiscus)' }}>
                {t('me.rejected')}
              </span>
              {rejected.map((r) => (
                <div key={r.id} className="error-box row-between" style={{ alignItems: 'flex-start' }}>
                  <span>
                    {describeOp(r.op, lk, ledger, t)}
                    <br />
                    <small>{errText(r.error)}</small>
                  </span>
                  <button className="btn btn-sm" onClick={() => void store.dismissRejected(r.id)}>
                    {t('me.dismiss')}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="card card-pad stack">
        <span className="section-title">{t('me.display')}</span>
        <div className="row-between">
          <span>{t('lang.label')}</span>
          <LanguageSwitch />
        </div>
        <div className="row-between">
          <span>{t('me.kmf')}</span>
          <LocalCountToggle />
        </div>
        <div className="row-between">
          <span>{t('me.theme')}</span>
          <Seg
            value={prefs.theme}
            onChange={(theme) => store.setPrefs({ theme })}
            options={[
              { value: 'system', label: t('me.auto') },
              { value: 'light', label: t('me.light') },
              { value: 'dark', label: t('me.dark') },
            ]}
          />
        </div>
      </section>
    </div>
  );
}
