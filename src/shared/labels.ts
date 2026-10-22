import type { OpType } from './ops';

export const INTAKE_LABEL = {
  collected: 'Paid & collected',
  awaiting: 'To collect later',
  inspection: 'Delivered for inspection',
} as const;

export const METHOD_LABEL = { bus: 'Bus', air: 'Air (baggage)', sea: 'Sea', road: 'Road', other: 'Other' } as const;

export const PAYMENT_LABEL = { cash: 'Cash', mpesa: 'M-Pesa', bank: 'Bank', other: 'Other' } as const;

export const SHIP_COST_LABEL = {
  bus_fare: 'Bus booking',
  conductor_border: 'Conductor / border',
  air_baggage: 'Air baggage allowance',
  sea_freight: 'Sea freight',
  local_transport: 'Local transport',
  packaging: 'Packaging',
  customs: 'Customs / fees',
  other: 'Other',
} as const;

export const EXPENSE_LABEL = {
  transport: 'Transport',
  food_lodging: 'Food & lodging',
  packaging: 'Packaging',
  customs_fees: 'Customs & fees',
  rent_storage: 'Rent & storage',
  phone_airtime: 'Phone & airtime',
  wages: 'Wages',
  market_fees: 'Market fees',
  other: 'Other',
} as const;

export const ADJUST_LABEL = {
  count_correction: 'Count correction',
  damaged: 'Damaged',
  lost: 'Lost',
  found: 'Found / opening stock',
  other: 'Other',
} as const;

export const LOCATION_KIND_LABEL = { purchasing: 'Buying & storage', transit: 'Transit / storage', selling: 'Selling' } as const;

export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', worker: 'Worker' } as const;

export const OP_GROUP: Record<OpType, string> = {
  'location.upsert': 'Catalogue',
  'size.upsert': 'Catalogue',
  'vendor.upsert': 'Catalogue',
  'garment.upsert': 'Catalogue',
  'price.set': 'Prices',
  'fx.set': 'Prices',
  'settings.set': 'Settings',
  'purchase.record': 'Purchasing',
  'purchase.collect': 'Purchasing',
  'purchase.inspect': 'Purchasing',
  'purchase.return': 'Purchasing',
  'vendor.payment': 'Payments',
  'payment.allocate': 'Payments',
  'shipment.dispatch': 'Shipments',
  'shipment.receive': 'Shipments',
  'shipment.cost': 'Shipments',
  'stock.adjust': 'Stock',
  'expense.record': 'Expenses',
  'worker.issue': 'Sales day',
  'worker.return': 'Sales day',
  'worker.settle': 'Sales day',
  'worker.review': 'Sales day',
  'op.void': 'Corrections',
  'op.resolve': 'Sales day',
};

export const FLAG_LABEL = {
  NEGATIVE_STOCK: 'Stock below zero',
  HOLDING_MISMATCH: 'Holding mismatch',
  PRICE_MISMATCH: 'Price differs',
  CLOCK_SKEW: 'Clock wrong',
  BACKDATED: 'Back-dated',
  LATE_SYNC: 'Synced late',
  CASH_VARIANCE: 'Cash difference',
} as const;

const PALETTE = ['#2e3a87', '#1f7a78', '#b0532e', '#7a4a8c', '#3f6e2a', '#8a5a0e', '#a23b5b', '#2f5f8a'];
export function personColor(id: string) {
  let h = 0;
  for (const c of id) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length]!;
}

export const SWATCHES = ['#c8553d', '#e0a13a', '#2e3a87', '#1f7a78', '#7a4a8c', '#3f6e2a', '#a23b5b', '#2f5f8a', '#8a5a0e', '#5b5f6b', '#d97757', '#4b8b6f'];
