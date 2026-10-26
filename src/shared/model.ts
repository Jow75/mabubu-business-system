// Entity shapes produced by the engine, stock account naming, and the
// keys under which entities are stored.

import { lineTotal, type Currency } from './money';
import type { Role } from './permissions';
import type {
  ADJUST_REASONS,
  EXPENSE_CATEGORIES,
  LOCATION_KINDS,
  PAYMENT_METHODS,
  PURCHASE_INTAKES,
  SHIPMENT_COST_CATEGORIES,
  SHIPMENT_METHODS,
} from './ops';

export interface Location {
  id: string;
  name: string;
  kind: (typeof LOCATION_KINDS)[number];
  currency: Currency;
  active: boolean;
}
export interface SizeCategory {
  id: string;
  name: string;
  sort: number;
  active: boolean;
}
export interface Vendor {
  id: string;
  name: string;
  phone: string;
  notes: string;
  active: boolean;
}
export interface GarmentType {
  id: string;
  code: string;
  name: string;
  sizeCategoryId: string | null;
  vendorId: string | null;
  description: string;
  swatch: string;
  active: boolean;
}
export interface PriceEntry {
  id: string;
  effectiveFrom: string;
  currency: Currency;
  retail: number;
  wholesale: number | null;
  opId: string;
}
export interface PriceList {
  garmentTypeId: string;
  locationId: string;
  entries: PriceEntry[];
}
export interface FxEntry {
  id: string;
  date: string;
  rate: string;
  source: string;
  basis?: 'actual' | 'market' | 'manual';
}
export interface FxSeries {
  from: Currency;
  to: Currency;
  entries: FxEntry[];
}
export interface Settings {
  localCountLabel: string;
  denominations: number[];
  businessName: string;
  /**
   * The business's own contact details, printed on reports. Empty until the
   * owner types them in Settings — never a made-up number.
   */
  phoneKenya: string;
  phoneComoros: string;
  email: string;
}
export const DEFAULT_SETTINGS: Settings = {
  localCountLabel: 'local count',
  // Comorian franc banknotes; the owner should confirm in Settings.
  denominations: [10000, 5000, 2000, 1000, 500],
  businessName: 'Mabubu',
  phoneKenya: '',
  phoneComoros: '',
  email: '',
};

export interface PurchaseLine {
  garmentTypeId: string;
  qty: number;
  unitCost: number;
  collected: number;
  accepted: number;
  rejected: number;
  returned: number;
}
export interface Purchase {
  id: string;
  vendorId: string;
  locationId: string;
  date: string;
  currency: Currency;
  intake: (typeof PURCHASE_INTAKES)[number];
  note: string;
  lines: PurchaseLine[];
  paid: number;
  status: 'active' | 'voided';
  opId: string;
  actorId: string;
  /** Applied (non-voided) operations that depend on this purchase. */
  dependents: string[];
}

/** What a purchase costs us: its value, or only the accepted pieces for a delivery on inspection. */
export function purchasePayable(p: Purchase): number {
  if (p.status === 'voided') return 0;
  return p.lines.reduce((s, l) => s + lineTotal(p.intake === 'inspection' ? l.accepted : l.qty, l.unitCost), 0);
}

/**
 * How the owner chose to split one vendor payment across that vendor's
 * purchases (payment.allocate, ADR-002 §5). It records a choice, not a
 * balance: what is owed is still worked out only by vendorAccounts(). The part
 * of the payment not split onto a purchase is credit with the vendor.
 */
export interface PaymentSplit {
  paymentId: string;
  vendorId: string;
  currency: Currency;
  allocations: { purchaseId: string; amount: number }[];
  /** The payment.allocate record in force. */
  opId: string;
}

export interface ShipmentLine {
  garmentTypeId: string;
  qty: number;
  received: number;
  missing: number;
}
export interface ShipmentCost {
  id: string;
  category: (typeof SHIPMENT_COST_CATEGORIES)[number];
  description: string;
  amount: number;
  currency: Currency;
  status: 'estimated' | 'actual';
  date: string;
  reference: string;
  supersedes: string | null;
  supersededBy: string | null;
  voided: boolean;
}
export interface Shipment {
  id: string;
  code: string;
  fromLocationId: string;
  toLocationId: string;
  method: (typeof SHIPMENT_METHODS)[number];
  carrier: string;
  packages: { label: string; weightKg: number | null }[];
  lines: ShipmentLine[];
  date: string;
  expectedDate: string | null;
  note: string;
  status: 'in_transit' | 'partial' | 'received' | 'voided';
  costs: ShipmentCost[];
  opId: string;
  actorId: string;
  dependents: string[];
}

export interface SettleLine {
  garmentTypeId: string;
  held: number;
  sold: number;
  wholesaleQty: number;
  retailPrice: number;
  wholesalePrice: number;
  carried: number;
  lost: number;
}
export interface Settlement {
  opId: string;
  currency: Currency;
  lines: SettleLine[];
  expected: number;
  expensesTotal: number;
  expenses: { description: string; amount: number }[];
  cash: number;
  mobile: number;
  handed: number;
  /** expected − expenses − handed. Positive = short, negative = over. */
  variance: number;
  note: string;
  at: string;
}
export interface WorkerDay {
  key: string;
  workerId: string;
  locationId: string;
  workDate: string;
  issued: Record<string, number>;
  returned: Record<string, number>;
  opIds: string[];
  status: 'open' | 'settled';
  settlement: Settlement | null;
  review: { opId: string; decision: 'approved' | 'queried'; note: string; by: string; at: string } | null;
  firstActivityAt: string;
}

export interface UserRef {
  id: string;
  name: string;
  role: Role;
  active: boolean;
  locationId: string | null;
}

export type AdjustReason = (typeof ADJUST_REASONS)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/* ------------------------------------------------------------------ */
/* Keys                                                                */
/* ------------------------------------------------------------------ */

export const K = {
  location: (id: string) => `loc:${id}`,
  size: (id: string) => `size:${id}`,
  vendor: (id: string) => `vendor:${id}`,
  garment: (id: string) => `gt:${id}`,
  price: (gt: string, loc: string) => `price:${gt}:${loc}`,
  fx: (from: string, to: string) => `fx:${from}:${to}`,
  settings: () => 'settings:app',
  purchase: (id: string) => `purchase:${id}`,
  shipment: (id: string) => `shipment:${id}`,
  day: (workerId: string, date: string) => `day:${workerId}:${date}`,
  user: (id: string) => `user:${id}`,
  split: (paymentId: string) => `split:${paymentId}`,
};

export function entityKind(key: string): string {
  return key.slice(0, key.indexOf(':'));
}

/* ------------------------------------------------------------------ */
/* Stock accounts (double-entry quantity ledger)                       */
/* ------------------------------------------------------------------ */
// Every movement moves pieces of one garment type from one account to
// another, so pieces are never created or lost silently. "vendor", "sold"
// and "adj" are the edges of the system; all other accounts are physical
// places/states that must never go below zero.

export type AccountKind = 'vendor' | 'await' | 'insp' | 'rej' | 'avail' | 'transit' | 'worker' | 'sold' | 'adj';

export const A = {
  vendor: (vendorId: string) => `vendor|${vendorId}`,
  awaiting: (loc: string, purchaseId: string) => `await|${loc}|${purchaseId}`,
  inspection: (loc: string, purchaseId: string) => `insp|${loc}|${purchaseId}`,
  rejected: (loc: string, purchaseId: string) => `rej|${loc}|${purchaseId}`,
  avail: (loc: string) => `avail|${loc}`,
  transit: (toLoc: string, shipmentId: string) => `transit|${toLoc}|${shipmentId}`,
  worker: (loc: string, workerId: string) => `worker|${loc}|${workerId}`,
  sold: (loc: string) => `sold|${loc}`,
  adj: (loc: string) => `adj|${loc}`,
};

export interface ParsedAccount {
  kind: AccountKind;
  loc: string | null;
  ref: string | null;
}

export function parseAccount(acct: string): ParsedAccount {
  const [kind, a, b] = acct.split('|') as [AccountKind, string | undefined, string | undefined];
  if (kind === 'vendor') return { kind, loc: null, ref: a ?? null };
  return { kind, loc: a ?? null, ref: b ?? null };
}

export const PHYSICAL_KINDS: readonly AccountKind[] = ['await', 'insp', 'rej', 'avail', 'transit', 'worker'];

export function isPhysical(acct: string): boolean {
  return PHYSICAL_KINDS.includes(parseAccount(acct).kind);
}

export const balanceKey = (acct: string, gt: string) => `${acct}#${gt}`;
export function splitBalanceKey(k: string): [string, string] {
  const i = k.lastIndexOf('#');
  return [k.slice(0, i), k.slice(i + 1)];
}

export interface Move {
  from: string;
  to: string;
  gt: string;
  qty: number;
}

export type PostingKind = 'payable' | 'payment' | 'shipcost' | 'expense' | 'sale' | 'worker_expense' | 'cash_in';

export interface Posting {
  kind: PostingKind;
  currency: Currency;
  amount: number;
  date: string;
  opId: string;
  vendorId?: string;
  purchaseId?: string;
  locationId?: string;
  shipmentId?: string;
  workerId?: string;
  category?: string;
}
