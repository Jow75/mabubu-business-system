import { useState } from 'react';
import { store, useApp } from '../lib/store';
import { describeOp, useLookups } from '../lib/lookups';
import { Icon } from './Icon';
import { Field, Sheet, save } from './kit';
import { useT } from '../lib/i18n';

/** Cancel a record with a reason. History is kept; its effects are reversed. */
export function VoidButton({ opId, label, small = true, reopen = false }: { opId: string; label?: string; small?: boolean; reopen?: boolean }) {
  const { ledger, user } = useApp();
  const t = useT();
  const lk = useLookups();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const rec = ledger.getOp(opId);
  if (!rec || rec.voidedBy || rec.status === 'rejected') return null;
  const own = rec.op.actorId === user!.id && (rec.op.type === 'worker.issue' || rec.op.type === 'worker.return');
  if (!user!.caps.includes('corrections') && !own) return null;
  return (
    <>
      <button className={`btn btn-ghost ${small ? 'btn-sm' : ''}`} onClick={() => setOpen(true)}>
        <Icon name="undo" size={16} /> {label ?? t('void.cancelRecord')}
      </button>
      {open && (
        <Sheet
          title={reopen ? t('void.reopenTitle') : t('void.title')}
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                {t('void.keep')}
              </button>
              <button
                className="btn btn-danger"
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  if (await save(() => store.submit('op.void', { targetId: opId, reason: reason.trim() }), reopen ? t('void.reopened') : t('void.done'))) setOpen(false);
                }}
              >
                {reopen ? t('void.reopen') : t('void.cancelRecord')}
              </button>
            </>
          }
        >
          <div className="note-box">{describeOp(rec.op, lk, ledger, t)}</div>
          <p className="soft">{reopen ? t('void.reopenExplain') : t('void.explain')}</p>
          <Field label={t('void.reason')}>
            <textarea className="textarea" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t('void.reasonPh')} />
          </Field>
        </Sheet>
      )}
    </>
  );
}
