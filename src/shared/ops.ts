// Every change to business data is an "operation": an immutable record of
// something that happened (a purchase, a shipment receipt, a worker taking
// garments...). Operations are validated with these schemas on the device
// and again on the server.

import { z } from 'zod';
import { CURRENCY_CODES, isValidRate } from './money';
import { isIsoDate } from './time';
import type { VisClass } from './permissions';

export const ENGINE_VERSION = 1;

const idRe = /^[A-Za-z0-9][A-Za-z0-9_-]{2,63}$/;
export const zId = z.string().regex(idRe, 'Invalid id');
export const zDate = z.string().refine(isIsoDate, 'Invalid date (YYYY-MM-DD)');
const zText = (max: number) => z.string().trim().max(max);
const zName = z.string().trim().min(1, 'Required').max(80);
const zQty = z.number().int().min(0).max(1_000_000);
const zPosQty = z.number().int().min(1, 'Quantity must be at least 1').max(1_000_000);
const zMinor = z.number().int().min(0).max(10_000_000_000_000);
const zPosMinor = z.number().int().min(1, 'Amount must be more than zero').max(10_000_000_000_000);
const zCurrency = z.enum(CURRENCY_CODES);

function uniqueGarments(lines: { garmentTypeId: string }[]): boolean {
  return new Set(lines.map((l) => l.garmentTypeId)).size === lines.length;
}
const UNIQUE_MSG = 'Each garment type may appear only once';

const zQtyLines = z
  .array(z.object({ garmentTypeId: zId, qty: zPosQty }))
  .min(1, 'Add at least one garment line')
  .max(300)
  .refine(uniqueGarments, UNIQUE_MSG);

export const LOCATION_KINDS = ['purchasing', 'transit', 'selling'] as const;
export const PURCHASE_INTAKES = ['collected', 'awaiting', 'inspection'] as const;
export const PAYMENT_METHODS = ['cash', 'mpesa', 'bank', 'other'] as const;
export const SHIPMENT_METHODS = ['bus', 'air', 'sea', 'road', 'other'] as const;
export const SHIPMENT_COST_CATEGORIES = [
  'bus_fare',
  'conductor_border',
  'air_baggage',
  'sea_freight',
  'local_transport',
  'packaging',
  'customs',
  'other',
] as const;
export const ADJUST_REASONS = ['count_correction', 'damaged', 'lost', 'found', 'other'] as const;
export const EXPENSE_CATEGORIES = [
  'transport',
  'food_lodging',
  'packaging',
  'customs_fees',
  'rent_storage',
  'phone_airtime',
  'wages',
  'market_fees',
  'other',
] as const;

/* ------------------------------------------------------------------ */
/* Payload schemas                                                     */
/* ------------------------------------------------------------------ */

export const payloadSchemas = {
  'location.upsert': z.object({
    id: zId,
    name: zName,
    kind: z.enum(LOCATION_KINDS),
    currency: zCurrency,
    active: z.boolean(),
  }),
  'size.upsert': z.object({
    id: zId,
    name: zName,
    sort: z.number().int().min(0).max(1000),
    active: z.boolean(),
  }),
  'vendor.upsert': z.object({
    id: zId,
    name: zName,
    phone: zText(40),
    notes: zText(500),
    active: z.boolean(),
  }),
  'garment.upsert': z.object({
    id: zId,
    code: z
      .string()
      .trim()
      .regex(/^[A-Z0-9][A-Z0-9-]{0,15}$/, 'Code: capital letters, digits and dashes (max 16)'),
    name: zName,
    sizeCategoryId: zId.nullable(),
    vendorId: zId.nullable(),
    description: zText(500),
    swatch: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    active: z.boolean(),
  }),
  'price.set': z.object({
    id: zId,
    garmentTypeId: zId,
    locationId: zId,
    currency: zCurrency,
    retail: zPosMinor,
    wholesale: zPosMinor.nullable(),
    effectiveFrom: zDate,
  }),
  'fx.set': z.object({
    id: zId,
    from: zCurrency,
    to: zCurrency,
    rate: z.string().refine(isValidRate, 'Rate must be a positive decimal number'),
    date: zDate,
    source: zText(120),
    /** actual = rate really received in an exchange; market = a published reference saved on purpose; manual = typed in. Older records have none (treated as manual). */
    basis: z.enum(['actual', 'market', 'manual']).optional(),
  }),
  'settings.set': z.object({
    localCountLabel: zText(40).min(1).optional(),
    denominations: z.array(z.number().int().min(1).max(1_000_000)).max(20).optional(),
    businessName: zText(60).min(1).optional(),
  }),

  'purchase.record': z.object({
    id: zId,
    vendorId: zId,
    locationId: zId,
    date: zDate,
    currency: zCurrency,
    intake: z.enum(PURCHASE_INTAKES),
    lines: z
      .array(z.object({ garmentTypeId: zId, qty: zPosQty, unitCost: zMinor }))
      .min(1, 'Add at least one garment line')
      .max(300)
      .refine(uniqueGarments, UNIQUE_MSG),
    note: zText(500),
  }),
  'purchase.collect': z.object({ purchaseId: zId, date: zDate, lines: zQtyLines, note: zText(500) }),
  'purchase.inspect': z.object({
    purchaseId: zId,
    date: zDate,
    lines: z
      .array(z.object({ garmentTypeId: zId, accepted: zQty, rejected: zQty, reason: zText(200) }))
      .min(1)
      .max(300)
      .refine(uniqueGarments, UNIQUE_MSG)
      .refine((ls) => ls.some((l) => l.accepted + l.rejected > 0), 'Enter at least one accepted or rejected quantity'),
    note: zText(500),
  }),
  'purchase.return': z.object({ purchaseId: zId, date: zDate, lines: zQtyLines, note: zText(500) }),
  'vendor.payment': z.object({
    vendorId: zId,
    purchaseId: zId.nullable(),
    date: zDate,
    amount: zPosMinor,
    currency: zCurrency,
    method: z.enum(PAYMENT_METHODS),
    reference: zText(80),
    note: zText(500),
  }),

  'shipment.dispatch': z.object({
    id: zId,
    code: zText(40).min(1, 'Give the shipment a label'),
    fromLocationId: zId,
    toLocationId: zId,
    method: z.enum(SHIPMENT_METHODS),
    carrier: zText(80),
    packages: z
      .array(z.object({ label: zText(40), weightKg: z.number().min(0).max(1000).nullable() }))
      .max(100),
    lines: zQtyLines,
    date: zDate,
    expectedDate: zDate.nullable(),
    note: zText(500),
  }),
  'shipment.receive': z.object({
    shipmentId: zId,
    date: zDate,
    lines: z
      .array(z.object({ garmentTypeId: zId, received: zQty, missing: zQty }))
      .min(1)
      .max(300)
      .refine(uniqueGarments, UNIQUE_MSG)
      .refine((ls) => ls.some((l) => l.received + l.missing > 0), 'Enter at least one received or missing quantity'),
    note: zText(500),
  }),
  'shipment.cost': z.object({
    shipmentId: zId,
    category: z.enum(SHIPMENT_COST_CATEGORIES),
    description: zText(200),
    amount: zPosMinor,
    currency: zCurrency,
    status: z.enum(['estimated', 'actual']),
    date: zDate,
    reference: zText(80),
    supersedesId: zId.nullable(),
  }),

  'stock.adjust': z.object({
    locationId: zId,
    date: zDate,
    reason: z.enum(ADJUST_REASONS),
    lines: z
      .array(
        z.object({
          garmentTypeId: zId,
          delta: z
            .number()
            .int()
            .min(-1_000_000)
            .max(1_000_000)
            .refine((d) => d !== 0, 'Change cannot be zero'),
        }),
      )
      .min(1)
      .max(300)
      .refine(uniqueGarments, UNIQUE_MSG),
    note: zText(500),
  }),
  'expense.record': z.object({
    locationId: zId,
    date: zDate,
    category: z.enum(EXPENSE_CATEGORIES),
    description: zText(200).min(1, 'Say what the money was for'),
    amount: zPosMinor,
    currency: zCurrency,
    shipmentId: zId.nullable(),
  }),

  'worker.issue': z.object({ workerId: zId, locationId: zId, workDate: zDate, lines: zQtyLines }),
  'worker.return': z.object({ workerId: zId, locationId: zId, workDate: zDate, lines: zQtyLines }),
  'worker.settle': z.object({
    workerId: zId,
    locationId: zId,
    workDate: zDate,
    currency: zCurrency,
    lines: z
      .array(
        z.object({
          garmentTypeId: zId,
          held: zQty,
          sold: zQty,
          wholesaleQty: zQty,
          retailPrice: zMinor,
          wholesalePrice: zMinor,
          carried: zQty,
          lost: zQty,
        }),
      )
      .max(300)
      .refine(uniqueGarments, UNIQUE_MSG),
    cash: zMinor,
    mobile: zMinor,
    expenses: z.array(z.object({ description: zText(120).min(1), amount: zPosMinor })).max(30),
    note: zText(500),
  }),
  'worker.review': z.object({
    workerId: zId,
    workDate: zDate,
    decision: z.enum(['approved', 'queried']),
    note: zText(500),
  }),

  'op.void': z.object({ targetId: zId, reason: zText(300).min(3, 'Give a short reason') }),
} as const;

export type OpType = keyof typeof payloadSchemas;
export const OP_TYPES = Object.keys(payloadSchemas) as OpType[];
export type PayloadOf<T extends OpType> = z.infer<(typeof payloadSchemas)[T]>;

/* ------------------------------------------------------------------ */
/* Envelope                                                            */
/* ------------------------------------------------------------------ */

const isoInstant = z
  .string()
  .max(40)
  .refine((s) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/.test(s) && !Number.isNaN(Date.parse(s)), 'Invalid timestamp');

export const envelopeSchema = z.object({
  id: zId,
  type: z.enum(OP_TYPES as [OpType, ...OpType[]]),
  payload: z.unknown(),
  actorId: zId,
  deviceId: zId,
  deviceTime: isoInstant,
  tzOffsetMin: z.number().int().min(-720).max(840),
  createdOnline: z.boolean(),
  v: z.number().int().min(1).max(1000),
});

export type OpEnvelope<T extends OpType = OpType> = {
  id: string;
  type: T;
  payload: PayloadOf<T>;
  actorId: string;
  deviceId: string;
  deviceTime: string;
  tzOffsetMin: number;
  createdOnline: boolean;
  v: number;
};

export type AnyOp = { [K in OpType]: OpEnvelope<K> }[OpType];

/** Server-added facts about an operation. */
export interface OpServerMeta {
  seq: number;
  serverTime: string;
  actorName: string;
  clockSkewMs: number | null;
  status: 'applied' | 'rejected';
  error: string | null;
  flags: Flag[];
}

export interface Flag {
  code:
    | 'NEGATIVE_STOCK'
    | 'HOLDING_MISMATCH'
    | 'PRICE_MISMATCH'
    | 'CLOCK_SKEW'
    | 'BACKDATED'
    | 'LATE_SYNC'
    | 'CASH_VARIANCE';
  message: string;
}

export type StoredOp = AnyOp & Partial<OpServerMeta>;

export interface ParseResult {
  ok: boolean;
  op?: AnyOp;
  error?: string;
}

function formatIssues(issues: readonly { path: readonly PropertyKey[]; message: string }[]): string {
  const first = issues[0];
  if (!first) return 'Invalid data';
  const path = first.path.map(String).join('.');
  return path ? `${path}: ${first.message}` : first.message;
}

/** Validate an envelope and its payload. */
export function parseOp(raw: unknown): ParseResult {
  const env = envelopeSchema.safeParse(raw);
  if (!env.success) return { ok: false, error: formatIssues(env.error.issues) };
  const schema = payloadSchemas[env.data.type];
  const payload = schema.safeParse(env.data.payload);
  if (!payload.success) return { ok: false, error: formatIssues(payload.error.issues) };
  return { ok: true, op: { ...env.data, payload: payload.data } as AnyOp };
}

export function parsePayload<T extends OpType>(type: T, raw: unknown): { ok: true; payload: PayloadOf<T> } | { ok: false; error: string } {
  const r = payloadSchemas[type].safeParse(raw);
  if (!r.success) return { ok: false, error: formatIssues(r.error.issues) };
  return { ok: true, payload: r.data as PayloadOf<T> };
}

/* ------------------------------------------------------------------ */
/* Visibility & subject (used by the server download filter)           */
/* ------------------------------------------------------------------ */

const VIS_BY_TYPE: Record<Exclude<OpType, 'op.void'>, VisClass> = {
  'location.upsert': 'ref',
  'size.upsert': 'ref',
  'garment.upsert': 'ref',
  'price.set': 'ref',
  'settings.set': 'ref',
  'vendor.upsert': 'vendor',
  'fx.set': 'fx',
  'purchase.record': 'purchase',
  'purchase.collect': 'purchase',
  'purchase.inspect': 'purchase',
  'purchase.return': 'purchase',
  'vendor.payment': 'purchase',
  'shipment.dispatch': 'shipment',
  'shipment.receive': 'shipment',
  'shipment.cost': 'shipcost',
  'stock.adjust': 'stock',
  'expense.record': 'expense',
  'worker.issue': 'worker',
  'worker.return': 'worker',
  'worker.settle': 'worker',
  'worker.review': 'worker',
};

export function visibilityOf(op: AnyOp): { vis: VisClass | null; subjectId: string | null } {
  if (op.type === 'op.void') return { vis: null, subjectId: null }; // inherits target's
  const vis = VIS_BY_TYPE[op.type];
  const subjectId = vis === 'worker' ? (op.payload as { workerId: string }).workerId : null;
  return { vis, subjectId };
}
