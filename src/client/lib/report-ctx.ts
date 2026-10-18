import type { ReportCtx } from '../../shared/reports';
import { store } from './store';

/** The records and person a report is built from: exactly what this device holds and shows. */
export function reportCtx(): ReportCtx {
  const s = store.getSnapshot();
  if (!s.user) throw new Error('Not signed in.');
  return { ledger: s.ledger, directory: s.directory, user: s.user, meta: (id) => s.records.get(id) };
}
