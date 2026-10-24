import { useApp } from '../lib/store';
import { useLookups } from '../lib/lookups';
import { useT } from '../lib/i18n';
import type { OpRecord } from '../../shared/engine';

/**
 * Where a late record stands (ADR-004): waiting for a manager, accepted, or
 * not accepted with the manager's reason. `worker` uses the plain wording of
 * the worker's own screens.
 */
export function LatePill({ rec, worker = false }: { rec: OpRecord; worker?: boolean }) {
  const { ledger, records } = useApp();
  const lk = useLookups();
  const t = useT();
  if (!rec.review) return null;
  // The worker's wording is a full sentence; a rejection carries the manager's reason: both wrap on a phone.
  if (rec.review === 'waiting') return <span className={`pill saffron ${worker ? 'wrap' : ''}`}>{t(worker ? 'w.lateWaiting' : 'late.waiting')}</span>;
  const decision = rec.resolvedBy ? ledger.getOp(rec.resolvedBy) : undefined;
  const name = (rec.resolvedBy ? records.get(rec.resolvedBy)?.actorName : undefined) ?? lk.personName(decision?.op.actorId);
  if (rec.review === 'accepted') return <span className="pill green">{t(worker ? 'w.lateAccepted' : 'late.accepted', { name })}</span>;
  const reason = decision?.op.type === 'op.resolve' ? decision.op.payload.reason : '';
  return <span className="pill red wrap">{worker ? t('w.lateRejected', { name, reason }) : `${t('late.rejected', { name })}${reason ? ` — “${reason}”` : ''}`}</span>;
}
