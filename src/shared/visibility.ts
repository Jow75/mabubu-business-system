// Who may see a record. Mirrors the server's download filter in
// src/worker/sync.ts (pull); used by demo mode and by tests.

import type { AnyOp } from './ops';
import { visibilityOf } from './ops';
import { readableClasses, type Capability } from './permissions';

export function canSee(
  op: AnyOp,
  status: 'applied' | 'rejected' | 'pending',
  user: { id: string; caps: readonly Capability[] },
  findOp: (id: string) => AnyOp | undefined,
): boolean {
  if (status === 'rejected') return op.actorId === user.id || user.caps.includes('audit.view');
  if (op.actorId === user.id) return true;
  let target: AnyOp | undefined = op;
  if (op.type === 'op.void') target = findOp(op.payload.targetId);
  if (!target) return false;
  const { vis, subjectId } = visibilityOf(target);
  if (subjectId === user.id) return true;
  return vis !== null && readableClasses(user.caps).includes(vis);
}
