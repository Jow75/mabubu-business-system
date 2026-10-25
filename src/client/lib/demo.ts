import { buildDemo, DEMO_USERS } from '../../shared/demo-data';
import { kvSet, type LocalOp, type RecordsDb } from './db';

export { DEMO_USERS };

/** Fill the demo database with sample history (local only, never synced). */
export async function seedDemo(db: RecordsDb) {
  const records: LocalOp[] = buildDemo().map((r) => ({
    id: r.op.id,
    op: r.op,
    status: 'applied',
    seq: r.seq,
    serverTime: r.serverTime,
    actorName: r.actorName,
    clockSkewMs: 0,
    error: null,
    flags: [],
    localOrder: 0,
  }));
  await db.ops.bulkPut(records);
  await kvSet(db, 'seeded', true);
}
