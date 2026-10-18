// The downloadable reports and who may download them. Shared by the app
// (which builds the files from the records on the device) and the server
// (which re-checks the capability before recording the export in the log).

import type { Capability } from './permissions';

export const REPORT_IDS = [
  'profit',
  'sales-days',
  'sales-lines',
  'worker-records',
  'purchases',
  'vendors',
  'catalogue',
  'stock',
  'movements',
  'shipments',
  'expenses',
  'activity',
  'people',
] as const;
export type ReportId = (typeof REPORT_IDS)[number];

export const EXPORT_FORMATS = ['pdf', 'xlsx', 'csv'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

export const REPORT_INFO: Record<ReportId, { title: string; caps: readonly Capability[] }> = {
  profit: { title: 'Profit for the period', caps: ['costs.view'] },
  'sales-days': { title: 'Sales days and cash reconciliation', caps: ['workers.reconcile'] },
  'sales-lines': { title: 'Sales by garment', caps: ['workers.reconcile'] },
  'worker-records': { title: 'Worker take, return and closing records', caps: ['workers.reconcile'] },
  purchases: { title: 'Purchases', caps: ['purchasing', 'payments', 'costs.view'] },
  vendors: { title: 'Vendors, balances and payments', caps: ['purchasing', 'payments', 'costs.view'] },
  catalogue: { title: 'Garments, size groups and selling prices', caps: ['catalog.manage', 'pricing.manage', 'costs.view', 'workers.reconcile'] },
  stock: { title: 'Stock now', caps: ['stock.adjust', 'costs.view', 'audit.view', 'workers.reconcile'] },
  movements: { title: 'Stock movements and adjustments', caps: ['stock.adjust', 'costs.view', 'audit.view', 'workers.reconcile'] },
  shipments: { title: 'Shipments, packages and costs', caps: ['shipments', 'costs.view', 'workers.reconcile', 'stock.adjust'] },
  expenses: { title: 'Expenses', caps: ['expenses', 'costs.view'] },
  activity: { title: 'Activity log', caps: ['audit.view'] },
  people: { title: 'People and devices', caps: ['users.manage'] },
};

export function canExport(caps: readonly Capability[], id: ReportId): boolean {
  return REPORT_INFO[id].caps.some((c) => caps.includes(c));
}
