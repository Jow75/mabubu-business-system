// Go live (ADR-005, docs/GO_LIVE_CUTOVER.md): the owner's one-time move from the
// testing period to real business records. Owner only; the server checks every
// step again and refuses once it has been done.

import { useCallback, useEffect, useState } from 'react';
import { store, useApp } from '../../lib/store';
import { api, ApiError } from '../../lib/api';
import { downloadBlob } from '../../lib/csv';
import { errText, useT, type T } from '../../lib/i18n';
import type { Key } from '../../../shared/i18n';
import { GOLIVE_PHRASE, type CutoverRecord, type FxDecision, type GoLivePreview, type GoLiveStatus, type ReadinessCheck, type TypeCount } from '../../../shared/golive';
import { fmtDateTime } from '../../../shared/time';
import { Icon } from '../../ui/Icon';
import { Empty, Field, PageHead, toast } from '../../ui/kit';

/** Record types grouped the way the family talks about them. */
const GROUP: Record<string, Key> = {
  'location.upsert': 'gl.g.places',
  'size.upsert': 'gl.g.sizes',
  'vendor.upsert': 'gl.g.vendors',
  'garment.upsert': 'gl.g.garments',
  'price.set': 'gl.g.prices',
  'settings.set': 'gl.g.settings',
  'fx.set': 'gl.g.rates',
  'purchase.record': 'gl.g.purchases',
  'purchase.collect': 'gl.g.purchases',
  'purchase.inspect': 'gl.g.purchases',
  'purchase.return': 'gl.g.purchases',
  'vendor.payment': 'gl.g.payments',
  'payment.allocate': 'gl.g.payments',
  'shipment.dispatch': 'gl.g.shipments',
  'shipment.receive': 'gl.g.shipments',
  'shipment.cost': 'gl.g.shipments',
  'stock.adjust': 'gl.g.stock',
  'expense.record': 'gl.g.expenses',
  'worker.issue': 'gl.g.workerDays',
  'worker.return': 'gl.g.workerDays',
  'worker.settle': 'gl.g.workerDays',
  'worker.review': 'gl.g.workerDays',
  'op.void': 'gl.g.corrections',
  'op.resolve': 'gl.g.corrections',
};

function grouped(rows: TypeCount[], category: TypeCount['category']): [Key, number][] {
  const m = new Map<Key, number>();
  for (const r of rows) if (r.category === category) m.set(GROUP[r.type] ?? 'gl.g.other', (m.get(GROUP[r.type] ?? 'gl.g.other') ?? 0) + r.count);
  return [...m];
}

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

const CHECK_TEXT: Record<ReadinessCheck['key'], Record<ReadinessCheck['status'], Key>> = {
  backup: { ok: 'gl.c.backupOk', warn: 'gl.c.backupBlock', block: 'gl.c.backupBlock' },
  unsent: { ok: 'gl.c.unsentOk', warn: 'gl.c.unsentBlock', block: 'gl.c.unsentBlock' },
  unknown_devices: { ok: 'gl.c.unknownOk', warn: 'gl.c.unknownWarn', block: 'gl.c.unknownWarn' },
  rebuild: { ok: 'gl.c.rebuildOk', warn: 'gl.c.rebuildBlock', block: 'gl.c.rebuildBlock' },
  approvals: { ok: 'gl.c.approvalsOk', warn: 'gl.c.approvalsWarn', block: 'gl.c.approvalsWarn' },
};

export function GoLivePage() {
  const { user, demo, online } = useApp();
  const t = useT();
  const [status, setStatus] = useState<GoLiveStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setStatus(await api<GoLiveStatus>('GET', '/admin/golive', undefined, store.token));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? (e.offline ? t('gl.online') : errText(e.message)) : t('c.somethingWrong'));
    }
  }, [t]);
  useEffect(() => {
    if (!demo && user?.role === 'owner') void load();
  }, [demo, online, user, load]);

  if (demo || user?.role !== 'owner')
    return (
      <div className="page">
        <PageHead title={t('gl.title')} />
        <Empty icon="key" title={t('gl.ownerOnly')} />
      </div>
    );
  return (
    <div className="page" style={{ maxWidth: 880 }}>
      <PageHead eyebrow={t('gl.eyebrow')} title={t('gl.title')} lead={t('gl.lead')} />
      {error && <div className="error-box">{error}</div>}
      {!status && !error && <div className="muted">{t('c.opening')}</div>}
      {status?.phase === 'live' && <Done record={status.cutover} />}
      {status?.phase === 'pre_release' && <Preview p={status} reload={load} onDone={setStatus} />}
    </div>
  );
}

function Done({ record }: { record: CutoverRecord | null }) {
  const t = useT();
  return (
    <section className="card card-pad stack">
      <span className="pill lagoon" style={{ alignSelf: 'flex-start' }}>
        <Icon name="check" size={15} /> {t('gl.doneBadge')}
      </span>
      {record && (
        <dl className="kv">
          <dt>{t('gl.doneWhen')}</dt>
          <dd>{fmtDateTime(record.at)}</dd>
          <dt>{t('gl.doneBy')}</dt>
          <dd>{record.actorName}</dd>
          <dt>{t('gl.doneKept')}</dt>
          <dd>{record.scope.kept}</dd>
          <dt>{t('gl.doneRemoved')}</dt>
          <dd>{record.scope.removed}</dd>
          <dt>{t('gl.doneRates')}</dt>
          <dd>{record.scope.fx === 'keep' ? t('gl.fxKeep') : t('gl.fxRemove')}</dd>
          <dt>{t('gl.doneBackup')}</dt>
          <dd className="mono">
            {fmtDateTime(record.backupAt)} · {record.backupSha256.slice(0, 16)}…
          </dd>
        </dl>
      )}
      <p className="soft" style={{ margin: 0 }}>
        {t('gl.doneBody')}
      </p>
    </section>
  );
}

function Preview({ p, reload, onDone }: { p: GoLivePreview; reload: () => Promise<void>; onDone: (s: GoLiveStatus) => void }) {
  const t = useT();
  const [fx, setFx] = useState<FxDecision | null>(p.rates.length ? null : 'keep');
  const [phrase, setPhrase] = useState('');
  const [pin, setPin] = useState('');
  const [acceptDevices, setAcceptDevices] = useState(false);
  const [busy, setBusy] = useState<'backup' | 'run' | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const blocking = p.checks.filter((c) => c.status === 'block');
  const unknown = p.devices.filter((d) => d.state === 'unknown').length;
  const ready = !blocking.length && fx !== null && phrase.trim() === GOLIVE_PHRASE && pin.length >= 6 && (!unknown || acceptDevices) && p.backup !== null;
  const removed = grouped(p.byType, 'remove');
  const removedTotal = removed.reduce((n, [, c]) => n + c, 0);

  const makeBackup = async () => {
    setBusy('backup');
    try {
      const res = await fetch('/api/admin/golive/backup', { method: 'POST', headers: { authorization: `Bearer ${store.token}` }, cache: 'no-store' });
      const text = await res.text();
      if (!res.ok) throw new ApiError(res.status, 'error', (JSON.parse(text) as { message?: string }).message ?? `Server error (${res.status}).`);
      // Checked before it is saved: the file is complete (hash) and reads back (parses, right number of records).
      const expected = res.headers.get('x-backup-sha256');
      const parsed = JSON.parse(text) as { ops?: unknown[]; fingerprint?: { ops: number } };
      if (!expected || (await sha256(text)) !== expected || parsed.ops?.length !== parsed.fingerprint?.ops) throw new Error('verify');
      downloadBlob(`mabubu-golive-backup-${new Date().toISOString().slice(0, 10)}-${expected.slice(0, 8)}.json`, new Blob([text], { type: 'application/json' }));
      toast(t('gl.backupDone'));
      await reload();
    } catch (e) {
      toast(e instanceof ApiError ? errText(e.message) : t('gl.backupFailed'), 'error');
    } finally {
      setBusy(null);
    }
  };

  const run = async () => {
    if (!ready || !p.backup || !fx) return;
    setBusy('run');
    setRunError(null);
    try {
      const done = await api<GoLiveStatus>(
        'POST',
        '/admin/golive/execute',
        { pin, phrase, fx, backupSha256: p.backup.sha256, fingerprint: p.fingerprint, acceptUnknownDevices: acceptDevices },
        store.token,
      );
      setPin('');
      if (done.phase === 'live' && done.cutover) await store.afterGoLive(done.cutover.ledger);
      toast(t('gl.doneToast'));
      onDone(done);
    } catch (e) {
      setPin('');
      setRunError(e instanceof ApiError ? errText(e.message) : t('c.somethingWrong'));
      void reload();
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <div className="note-box">{t('gl.noteOnce')}</div>

      <section className="card card-pad stack">
        <span className="section-title">1 · {t('gl.keptTitle')}</span>
        <dl className="kv">
          <dt>{t('gl.g.places')}</dt>
          <dd>{p.kept.places.join(', ') || '—'}</dd>
          <dt>{t('gl.g.sizes')}</dt>
          <dd>{p.kept.sizes.join(', ') || '—'}</dd>
          <dt>{t('gl.g.vendors')}</dt>
          <dd>{p.kept.vendors.join(', ') || '—'}</dd>
          <dt>{t('gl.g.garments')}</dt>
          <dd>{p.kept.garments.join(' · ') || '—'}</dd>
          <dt>{t('gl.g.prices')}</dt>
          <dd>{p.kept.prices}</dd>
          <dt>{t('gl.g.people')}</dt>
          <dd>{p.people.map((x) => `${x.name}${x.active ? '' : ` (${t('pp.archived')})`}`).join(', ')}</dd>
        </dl>
        <p className="hint" style={{ margin: 0 }}>
          {t('gl.keptHint')}
        </p>
      </section>

      <section className="card card-pad stack">
        <span className="section-title">2 · {t('gl.removedTitle', { n: removedTotal })}</span>
        {removed.length ? (
          <dl className="kv">
            {removed.map(([k, n]) => (
              <span key={k} style={{ display: 'contents' }}>
                <dt>{t(k)}</dt>
                <dd>{n}</dd>
              </span>
            ))}
          </dl>
        ) : (
          <p className="soft">{t('gl.nothingRemoved')}</p>
        )}
        <p className="hint" style={{ margin: 0 }}>
          {t('gl.removedHint')}
        </p>
      </section>

      {p.rates.length > 0 && (
        <section className="card card-pad stack">
          <span className="section-title">3 · {t('gl.fxTitle')}</span>
          <p className="soft" style={{ margin: 0 }}>
            {t('gl.fxBody', { rates: p.rates.join(', ') })}
          </p>
          <div className="stack-sm" role="radiogroup" aria-label={t('gl.fxTitle')}>
            {(['keep', 'remove'] as const).map((v) => (
              <label key={v} className="check">
                <input type="radio" name="fx" checked={fx === v} onChange={() => setFx(v)} /> {v === 'keep' ? t('gl.fxKeep') : t('gl.fxRemove')}
              </label>
            ))}
          </div>
        </section>
      )}

      <section className="card">
        <div className="card-head">
          <span className="section-title">4 · {t('gl.devicesTitle')}</span>
          <span className="hint">{t('gl.devicesHint')}</span>
        </div>
        <div className="table-wrap" style={{ marginTop: 8 }}>
          <table className="data">
            <thead>
              <tr>
                <th>{t('pp.device')}</th>
                <th>{t('pp.allowed')}</th>
                <th>{t('gl.lastSync')}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {p.devices.map((d) => (
                <tr key={d.code}>
                  <td>
                    {d.label} <span className="mono muted">{d.code}</span>
                  </td>
                  <td>{d.people.join(', ')}</td>
                  <td className="nowrap">{d.lastSyncAt ? fmtDateTime(d.lastSyncAt) : '—'}</td>
                  <td>
                    <span className={`pill ${d.state === 'ok' ? 'lagoon' : d.state === 'unsent' ? 'red' : 'saffron'}`}>
                      {d.state === 'ok' ? t('gl.devOk') : d.state === 'unsent' ? t('gl.devUnsent', { n: d.pending ?? 0 }) : t('gl.devUnknown')}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card card-pad stack">
        <span className="section-title">5 · {t('gl.backupTitle')}</span>
        <p className="soft" style={{ margin: 0 }}>
          {t('gl.backupBody')}
        </p>
        {p.backup && (
          <div className="info-box mono" style={{ fontSize: 13 }}>
            {t('gl.backupMade', { when: fmtDateTime(p.backup.at), n: p.backup.ops })} · {p.backup.sha256.slice(0, 16)}…
          </div>
        )}
        <button className="btn" style={{ alignSelf: 'flex-start' }} disabled={busy !== null} onClick={() => void makeBackup()}>
          <Icon name="download" size={18} /> {p.backup ? t('gl.backupAgain') : t('gl.backupBtn')}
        </button>
      </section>

      <section className="card card-pad stack">
        <span className="section-title">6 · {t('gl.checksTitle')}</span>
        <ul className="stack-sm" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {p.checks.map((c) => (
            <li key={c.key} className="row" style={{ alignItems: 'flex-start', gap: 10 }}>
              <span className={`pill ${c.status === 'ok' ? 'lagoon' : c.status === 'warn' ? 'saffron' : 'red'}`}>{t(`gl.s.${c.status}` as Key)}</span>
              <span>{checkText(c, t)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="card card-pad stack selvedge">
        <span className="section-title">7 · {t('gl.confirmTitle')}</span>
        <p className="soft" style={{ margin: 0 }}>
          {t('gl.confirmBody', { n: removedTotal })}
        </p>
        {unknown > 0 && (
          <label className="check">
            <input type="checkbox" checked={acceptDevices} onChange={(e) => setAcceptDevices(e.target.checked)} /> {t('gl.acceptDevices', { n: unknown })}
          </label>
        )}
        <div className="form-grid">
          <Field label={t('gl.phraseLabel', { phrase: GOLIVE_PHRASE })} htmlFor="gl-phrase">
            <input id="gl-phrase" className="input mono" value={phrase} onChange={(e) => setPhrase(e.target.value)} autoComplete="off" spellCheck={false} />
          </Field>
          <Field label={t('gl.pinLabel')} htmlFor="gl-pin">
            <input
              id="gl-pin"
              className="input mono"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))}
            />
          </Field>
        </div>
        {runError && (
          <div className="error-box" role="alert">
            {runError}
          </div>
        )}
        <button className="btn btn-danger btn-lg btn-wrap" style={{ alignSelf: 'flex-start' }} disabled={!ready || busy !== null} onClick={() => void run()}>
          {busy === 'run' ? '…' : t('gl.runBtn')}
        </button>
        {!ready && <p className="hint" style={{ margin: 0 }}>{t('gl.notReadyHint')}</p>}
      </section>
    </>
  );
}

function checkText(c: ReadinessCheck, t: T): string {
  return t(CHECK_TEXT[c.key][c.status], { n: c.n ?? 0 });
}
