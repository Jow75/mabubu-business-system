// Who may see a record. Mirrors the server's download filter in
// src/worker/sync.ts (pull); used by demo mode and by tests.

import type { AnyOp, LateReview } from './ops';
import { subjectOf, visibilityOf } from './ops';
import { readableClasses, type Capability } from './permissions';

export function canSee(
  op: AnyOp,
  status: 'applied' | 'rejected' | 'pending',
  user: { id: string; caps: readonly Capability[] },
  findOp: (id: string) => AnyOp | undefined,
  /** Set on a late record (kept for a manager's decision). */
  review: LateReview | null = null,
): boolean {
  if (op.actorId === user.id) return true;
  if (status === 'rejected' && !review) return user.caps.includes('audit.view');
  const target = subjectOf(op, findOp);
  if (!target) return false;
  const { vis, subjectId } = visibilityOf(target);
  if (subjectId === user.id) return true;
  if (status === 'rejected' && user.caps.includes('audit.view')) return true;
  return vis !== null && readableClasses(user.caps).includes(vis);
}
