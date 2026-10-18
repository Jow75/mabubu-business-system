// Convenience lookups over the current ledger, plus human sentences for records.
import { useMemo } from 'react';
import { buildLookups, type Lookups } from '../../shared/describe';
import { useApp } from './store';

export { buildLookups, describeOp, type Lookups } from '../../shared/describe';

export function useLookups(): Lookups {
  const { ledger, directory, version } = useApp();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildLookups(ledger, directory), [ledger, directory, version]);
}
