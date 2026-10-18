import { useState } from 'react';
import { store, useApp } from '../lib/store';
import { describeOp, useLookups } from '../lib/lookups';
import { Icon } from './Icon';
import { Field, Sheet, save } from './kit';

/** Cancel a record with a reason. History is kept; its effects are reversed. */
export function VoidButton({ opId, label = 'Cancel record', small = true }: { opId: string; label?: string; small?: boolean }) {
  const { ledger, user } = useApp();
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
        <Icon name="undo" size={16} /> {label}
      </button>
      {open && (
        <Sheet
          title="Cancel this record?"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn" onClick={() => setOpen(false)}>
                Keep it
              </button>
              <button
                className="btn btn-danger"
                disabled={reason.trim().length < 3}
                onClick={async () => {
                  if (await save(() => store.submit('op.void', { targetId: opId, reason: reason.trim() }), 'Record cancelled')) setOpen(false);
                }}
              >
                Cancel record
              </button>
            </>
          }
        >
          <div className="note-box">{describeOp(rec.op, lk, ledger)}</div>
          <p className="soft">The record stays in the activity log, marked as cancelled. Its effect on stock and money is reversed. Enter the correct record afterwards if needed.</p>
          <Field label="Reason (required)">
            <textarea className="textarea" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. typed 500 instead of 50" />
          </Field>
        </Sheet>
      )}
    </>
  );
}
