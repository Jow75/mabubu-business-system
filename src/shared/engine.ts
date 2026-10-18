// The business engine: given the current state and one operation, decide
// whether the operation is allowed and what it changes.
//
// It is pure and deterministic. The device runs it to validate input
// instantly (even offline) and to rebuild its view from the operation log;
// the server runs the very same code as the authority before accepting an
// operation. Hard rule violations reject the operation. Physical facts that
// leave the records inconsistent (for example, more garments taken than the
// books say were available) are accepted and flagged for management.

import type { AnyOp, Flag, OpEnvelope, OpType } from './ops';
import { visibilityOf } from './ops';
import type { Capability, VisClass } from './permissions';
import { lineTotal } from './money';
import {
  A,
  K,
  balanceKey,
  isPhysical,
  parseAccount,
  splitBalanceKey,
  type FxSeries,
  type GarmentType,
  type Location,
  type Move,
  type Posting,
  type PriceEntry,
  type PriceList,
  type Purchase,
  type Settings,
  type Shipment,
  type ShipmentCost,
  type SizeCategory,
  type UserRef,
  type Vendor,
  type WorkerDay,
  DEFAULT_SETTINGS,
} from './model';

export interface OpRecord {
  op: AnyOp;
  status: 'applied' | 'rejected' | 'pending';
  voidedBy: string | null;
}

export interface EngineCtx {
  get(key: string): unknown | undefined;
  balance(acct: string, gt: string): number;
  getOp(id: string): OpRecord | undefined;
}

export interface Actor {
  id: string;
  caps: readonly Capability[];
}

export interface Effects {
  writes: Map<string, unknown>;
  moves: Move[];
  postings: Posting[];
  flags: Flag[];
  voids: { targetId: string; voidOpId: string }[];
  vis: VisClass | null;
  subjectId: string | null;
}

export type ErrorCode = 'invalid' | 'forbidden' | 'not_found' | 'conflict';
export type ApplyResult = { ok: true; effects: Effects } | { ok: false; code: ErrorCode; error: string };

class Fail extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
  ) {
    super(message);
  }
}
const invalid = (msg: string) => new Fail('invalid', msg);
const notFound = (msg: string) => new Fail('not_found', msg);

/* ------------------------------------------------------------------ */
/* Permissions per operation                                           */
/* ------------------------------------------------------------------ */

const WRITE_CAP: Record<Exclude<OpType, 'op.void' | 'worker.issue' | 'worker.return' | 'worker.settle'>, Capability> = {
  'location.upsert': 'catalog.manage',
  'size.upsert': 'catalog.manage',
  'vendor.upsert': 'catalog.manage',
  'garment.upsert': 'catalog.manage',
  'price.set': 'pricing.manage',
  'fx.set': 'pricing.manage',
  'settings.set': 'settings.manage',
  'purchase.record': 'purchasing',
  'purchase.collect': 'purchasing',
  'purchase.inspect': 'purchasing',
  'purchase.return': 'purchasing',
  'vendor.payment': 'payments',
  'shipment.dispatch': 'shipments',
  'shipment.receive': 'shipments',
  'shipment.cost': 'shipments',
  'stock.adjust': 'stock.adjust',
  'expense.record': 'expenses',
  'worker.review': 'workers.reconcile',
};

const SELF_VOIDABLE: readonly OpType[] = ['worker.issue', 'worker.return'];
const NOT_VOIDABLE: readonly OpType[] = [
  'op.void',
  'location.upsert',
  'size.upsert',
  'vendor.upsert',
  'garment.upsert',
  'price.set',
  'fx.set',
  'settings.set',
  'worker.review',
];

function authorize(op: AnyOp, ctx: EngineCtx, actor: Actor): void {
  const has = (c: Capability) => actor.caps.includes(c);
  if (op.actorId !== actor.id) throw new Fail('forbidden', 'Records can only be created in your own name.');
  switch (op.type) {
    case 'worker.issue':
    case 'worker.return':
    case 'worker.settle': {
      const own = op.payload.workerId === actor.id;
      if (own ? !has('sales.self') && !has('workers.reconcile') : !has('workers.reconcile')) {
        throw new Fail('forbidden', own ? 'You are not allowed to record sales work.' : 'You can only record your own work.');
      }
      return;
    }
    case 'op.void': {
      if (has('corrections')) return;
      const target = ctx.getOp(op.payload.targetId);
      if (target && target.op.actorId === actor.id && SELF_VOIDABLE.includes(target.op.type) && has('sales.self')) return;
      throw new Fail('forbidden', 'Only a manager can cancel this record.');
    }
    default: {
      const cap = WRITE_CAP[op.type];
      if (!has(cap)) throw new Fail('forbidden', 'You do not have permission for this action.');
    }
  }
}

/* ------------------------------------------------------------------ */
/* Transaction builder                                                 */
/* ------------------------------------------------------------------ */

class Tx {
  writes = new Map<string, unknown>();
  moves: Move[] = [];
  postings: Posting[] = [];
  flags: Flag[] = [];
  voids: { targetId: string; voidOpId: string }[] = [];

  constructor(
    readonly ctx: EngineCtx,
    /** The operation whose payload is applied (the target, when voiding). */
    readonly op: AnyOp,
    /** +1 to apply, −1 to reverse (void). */
    readonly sign: 1 | -1,
    /** Id of the operation being processed now (the void's id, when voiding). */
    readonly applyingId: string,
    /**
     * Replaying a record the server already accepted. A device only holds the
     * records its user may see (a worker never receives vendors), so checks
     * that a referenced record exists are skipped for such references.
     */
    readonly replay = false,
  ) {}

  get<T>(key: string): T | undefined {
    return (this.writes.has(key) ? this.writes.get(key) : this.ctx.get(key)) as T | undefined;
  }
  /** A mutable copy of an entity, so failed operations never leak changes. */
  edit<T>(key: string): T | undefined {
    if (this.writes.has(key)) return this.writes.get(key) as T;
    const v = this.ctx.get(key);
    if (v === undefined || v === null) return undefined;
    const copy = structuredClone(v) as T;
    this.writes.set(key, copy);
    return copy;
  }
  put(key: string, value: unknown) {
    this.writes.set(key, value);
  }
  move(from: string, to: string, gt: string, qty: number) {
    if (qty === 0) return;
    if (qty < 0) throw invalid('Quantity cannot be negative.');
    this.moves.push(this.sign === 1 ? { from, to, gt, qty } : { from: to, to: from, gt, qty });
  }
  post(p: Omit<Posting, 'opId'>) {
    if (p.amount === 0) return;
    this.postings.push({ ...p, amount: p.amount * this.sign, opId: this.applyingId });
  }
  flag(code: Flag['code'], message: string) {
    this.flags.push({ code, message });
  }
  dependent(list: string[]): string[] {
    if (this.sign === 1) return list.includes(this.op.id) ? list : [...list, this.op.id];
    return list.filter((id) => id !== this.op.id);
  }
}

/* ------------------------------------------------------------------ */
/* Lookups                                                             */
/* ------------------------------------------------------------------ */

function needLocation(tx: Tx, id: string): Location {
  const l = tx.get<Location>(K.location(id));
  if (!l) throw notFound('Unknown location.');
  return l;
}
function needVendor(tx: Tx, id: string): Vendor {
  const v = tx.get<Vendor>(K.vendor(id));
  if (!v) throw notFound('Unknown vendor.');
  return v;
}
function needGarment(tx: Tx, id: string): GarmentType {
  const g = tx.get<GarmentType>(K.garment(id));
  if (!g) throw notFound('Unknown garment type.');
  return g;
}
function needUser(tx: Tx, id: string): UserRef {
  const u = tx.get<UserRef>(K.user(id));
  if (!u) throw notFound('Unknown person.');
  return u;
}
function gtLabel(tx: Tx, id: string): string {
  return tx.get<GarmentType>(K.garment(id))?.code ?? id.slice(0, 8);
}

/** Price in force for a garment at a location on a date (latest entry wins). */
export function priceFor(get: (key: string) => unknown, gt: string, loc: string, date: string): PriceEntry | null {
  const list = get(K.price(gt, loc)) as PriceList | undefined;
  if (!list) return null;
  let found: PriceEntry | null = null;
  for (const e of list.entries) if (e.effectiveFrom <= date) found = e;
  return found;
}

/** Exchange rate in force on a date (1 from = rate to); tries the inverse. */
export function rateFor(get: (key: string) => unknown, from: string, to: string, date: string): number | null {
  if (from === to) return 1;
  const pick = (s: FxSeries | undefined) => {
    if (!s) return null;
    let found: string | null = null;
    for (const e of s.entries) if (e.date <= date) found = e.rate;
    return found;
  };
  const direct = pick(get(K.fx(from, to)) as FxSeries | undefined);
  if (direct) return Number(direct);
  const inverse = pick(get(K.fx(to, from)) as FxSeries | undefined);
  if (inverse) return 1 / Number(inverse);
  return null;
}

/* ------------------------------------------------------------------ */
/* Handlers                                                            */
/* ------------------------------------------------------------------ */

type Handler<T extends OpType> = (tx: Tx, op: OpEnvelope<T>) => void;
type Handlers = { [T in Exclude<OpType, 'op.void'>]: Handler<T> };

function upsertGuard(tx: Tx) {
  if (tx.sign !== 1) throw invalid('This record is changed by editing, not cancelling.');
}

const handlers: Handlers = {
  'location.upsert'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    tx.put(K.location(p.id), { ...p } satisfies Location);
  },
  'size.upsert'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    tx.put(K.size(p.id), { ...p } satisfies SizeCategory);
  },
  'vendor.upsert'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    tx.put(K.vendor(p.id), { ...p } satisfies Vendor);
  },
  'garment.upsert'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    if (!tx.replay) {
      if (p.sizeCategoryId && !tx.get<SizeCategory>(K.size(p.sizeCategoryId))) throw notFound('Unknown size category.');
      if (p.vendorId) needVendor(tx, p.vendorId);
    }
    tx.put(K.garment(p.id), { ...p } satisfies GarmentType);
  },
  'price.set'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    needGarment(tx, p.garmentTypeId);
    const loc = needLocation(tx, p.locationId);
    if (p.currency !== loc.currency) throw invalid(`Prices at ${loc.name} must be in ${loc.currency}.`);
    const key = K.price(p.garmentTypeId, p.locationId);
    const list = tx.edit<PriceList>(key) ?? { garmentTypeId: p.garmentTypeId, locationId: p.locationId, entries: [] };
    const entry: PriceEntry = {
      id: p.id,
      effectiveFrom: p.effectiveFrom,
      currency: p.currency,
      retail: p.retail,
      wholesale: p.wholesale,
      opId: op.id,
    };
    // Keep sorted by date; a later entry for the same date overrides an earlier one.
    const entries = list.entries.filter((e) => e.id !== p.id);
    let i = entries.length;
    while (i > 0 && entries[i - 1]!.effectiveFrom > entry.effectiveFrom) i--;
    entries.splice(i, 0, entry);
    tx.put(key, { ...list, entries });
  },
  'fx.set'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    if (p.from === p.to) throw invalid('Pick two different currencies.');
    const key = K.fx(p.from, p.to);
    const s = tx.edit<FxSeries>(key) ?? { from: p.from, to: p.to, entries: [] };
    const entries = s.entries.filter((e) => e.id !== p.id);
    let i = entries.length;
    while (i > 0 && entries[i - 1]!.date > p.date) i--;
    entries.splice(i, 0, { id: p.id, date: p.date, rate: p.rate, source: p.source, ...(p.basis ? { basis: p.basis } : {}) });
    tx.put(key, { ...s, entries });
  },
  'settings.set'(tx, op) {
    upsertGuard(tx);
    const cur = tx.get<Settings>(K.settings()) ?? DEFAULT_SETTINGS;
    const p = op.payload;
    tx.put(K.settings(), {
      localCountLabel: p.localCountLabel ?? cur.localCountLabel,
      denominations: p.denominations ?? cur.denominations,
      businessName: p.businessName ?? cur.businessName,
    } satisfies Settings);
  },

  /* ---------------- Purchasing ---------------- */

  'purchase.record'(tx, op) {
    const p = op.payload;
    const key = K.purchase(p.id);
    if (tx.sign === 1) {
      if (tx.get(key)) throw new Fail('conflict', 'This purchase was already recorded.');
      needVendor(tx, p.vendorId);
      needLocation(tx, p.locationId);
      for (const l of p.lines) needGarment(tx, l.garmentTypeId);
      tx.put(key, {
        id: p.id,
        vendorId: p.vendorId,
        locationId: p.locationId,
        date: p.date,
        currency: p.currency,
        intake: p.intake,
        note: p.note,
        lines: p.lines.map((l) => ({
          garmentTypeId: l.garmentTypeId,
          qty: l.qty,
          unitCost: l.unitCost,
          collected: p.intake === 'collected' ? l.qty : 0,
          accepted: 0,
          rejected: 0,
          returned: 0,
        })),
        paid: 0,
        status: 'active',
        opId: op.id,
        actorId: op.actorId,
        dependents: [],
      } satisfies Purchase);
    } else {
      const pur = tx.edit<Purchase>(key);
      if (!pur) throw notFound('Purchase not found.');
      if (pur.dependents.length) {
        throw invalid('Cancel the collections, inspections, returns and payments of this purchase first.');
      }
      pur.status = 'voided';
      if (p.intake === 'collected') for (const l of pur.lines) l.collected = 0;
    }
    const to = (gt: string) =>
      p.intake === 'collected'
        ? A.avail(p.locationId)
        : p.intake === 'awaiting'
          ? A.awaiting(p.locationId, p.id)
          : A.inspection(p.locationId, p.id);
    for (const l of p.lines) tx.move(A.vendor(p.vendorId), to(l.garmentTypeId), l.garmentTypeId, l.qty);
    if (p.intake !== 'inspection') {
      const total = p.lines.reduce((s, l) => s + lineTotal(l.qty, l.unitCost), 0);
      tx.post({ kind: 'payable', currency: p.currency, amount: total, date: p.date, vendorId: p.vendorId, purchaseId: p.id, locationId: p.locationId });
    }
  },

  'purchase.collect'(tx, op) {
    const p = op.payload;
    const pur = activePurchase(tx, p.purchaseId);
    if (pur.intake !== 'awaiting') throw invalid('This purchase was not waiting for collection.');
    for (const l of p.lines) {
      const pl = purchaseLine(tx, pur, l.garmentTypeId);
      const left = pl.qty - pl.collected;
      if (tx.sign === 1 && l.qty > left) throw invalid(`${gtLabel(tx, l.garmentTypeId)}: only ${left} left to collect.`);
      pl.collected += tx.sign * l.qty;
      tx.move(A.awaiting(pur.locationId, pur.id), A.avail(pur.locationId), l.garmentTypeId, l.qty);
    }
    pur.dependents = tx.dependent(pur.dependents);
  },

  'purchase.inspect'(tx, op) {
    const p = op.payload;
    const pur = activePurchase(tx, p.purchaseId);
    if (pur.intake !== 'inspection') throw invalid('This purchase was not delivered for inspection.');
    let payable = 0;
    for (const l of p.lines) {
      if (l.accepted + l.rejected === 0) continue;
      const pl = purchaseLine(tx, pur, l.garmentTypeId);
      if (tx.sign === 1) {
        const pending = pl.qty - pl.accepted - pl.rejected;
        if (l.accepted + l.rejected > pending) {
          throw invalid(`${gtLabel(tx, l.garmentTypeId)}: only ${pending} still waiting for inspection.`);
        }
      } else if (pl.rejected - l.rejected < pl.returned) {
        throw invalid('Some of these rejected pieces were already returned to the vendor. Cancel the return first.');
      }
      pl.accepted += tx.sign * l.accepted;
      pl.rejected += tx.sign * l.rejected;
      tx.move(A.inspection(pur.locationId, pur.id), A.avail(pur.locationId), l.garmentTypeId, l.accepted);
      tx.move(A.inspection(pur.locationId, pur.id), A.rejected(pur.locationId, pur.id), l.garmentTypeId, l.rejected);
      payable += lineTotal(l.accepted, pl.unitCost);
    }
    tx.post({ kind: 'payable', currency: pur.currency, amount: payable, date: p.date, vendorId: pur.vendorId, purchaseId: pur.id, locationId: pur.locationId });
    pur.dependents = tx.dependent(pur.dependents);
  },

  'purchase.return'(tx, op) {
    const p = op.payload;
    const pur = activePurchase(tx, p.purchaseId);
    for (const l of p.lines) {
      const pl = purchaseLine(tx, pur, l.garmentTypeId);
      const left = pl.rejected - pl.returned;
      if (tx.sign === 1 && l.qty > left) throw invalid(`${gtLabel(tx, l.garmentTypeId)}: only ${left} rejected pieces are waiting to go back.`);
      pl.returned += tx.sign * l.qty;
      tx.move(A.rejected(pur.locationId, pur.id), A.vendor(pur.vendorId), l.garmentTypeId, l.qty);
    }
    pur.dependents = tx.dependent(pur.dependents);
  },

  'vendor.payment'(tx, op) {
    const p = op.payload;
    needVendor(tx, p.vendorId);
    if (p.purchaseId) {
      const pur = tx.edit<Purchase>(K.purchase(p.purchaseId));
      if (!pur) throw notFound('Purchase not found.');
      if (tx.sign === 1 && pur.status === 'voided') throw invalid('This purchase was cancelled.');
      if (pur.vendorId !== p.vendorId) throw invalid('This purchase belongs to another vendor.');
      if (pur.currency !== p.currency) throw invalid(`Pay this purchase in ${pur.currency}.`);
      pur.paid += tx.sign * p.amount;
      pur.dependents = tx.dependent(pur.dependents);
    }
    tx.post({
      kind: 'payment',
      currency: p.currency,
      amount: p.amount,
      date: p.date,
      vendorId: p.vendorId,
      ...(p.purchaseId ? { purchaseId: p.purchaseId } : {}),
      category: p.method,
    });
  },

  /* ---------------- Shipments ---------------- */

  'shipment.dispatch'(tx, op) {
    const p = op.payload;
    const key = K.shipment(p.id);
    if (tx.sign === 1) {
      if (tx.get(key)) throw new Fail('conflict', 'This shipment was already recorded.');
      if (p.fromLocationId === p.toLocationId) throw invalid('Origin and destination must be different.');
      needLocation(tx, p.fromLocationId);
      needLocation(tx, p.toLocationId);
      for (const l of p.lines) needGarment(tx, l.garmentTypeId);
      tx.put(key, {
        id: p.id,
        code: p.code,
        fromLocationId: p.fromLocationId,
        toLocationId: p.toLocationId,
        method: p.method,
        carrier: p.carrier,
        packages: p.packages,
        lines: p.lines.map((l) => ({ garmentTypeId: l.garmentTypeId, qty: l.qty, received: 0, missing: 0 })),
        date: p.date,
        expectedDate: p.expectedDate,
        note: p.note,
        status: 'in_transit',
        costs: [],
        opId: op.id,
        actorId: op.actorId,
        dependents: [],
      } satisfies Shipment);
    } else {
      const sh = tx.edit<Shipment>(key);
      if (!sh) throw notFound('Shipment not found.');
      if (sh.dependents.length) throw invalid('Cancel this shipment’s receipts and cost lines first.');
      sh.status = 'voided';
    }
    for (const l of p.lines) tx.move(A.avail(p.fromLocationId), A.transit(p.toLocationId, p.id), l.garmentTypeId, l.qty);
  },

  'shipment.receive'(tx, op) {
    const p = op.payload;
    const sh = tx.edit<Shipment>(K.shipment(p.shipmentId));
    if (!sh) throw notFound('Shipment not found.');
    if (sh.status === 'voided') throw invalid('This shipment was cancelled.');
    for (const l of p.lines) {
      if (l.received + l.missing === 0) continue;
      const sl = sh.lines.find((x) => x.garmentTypeId === l.garmentTypeId);
      if (!sl) throw invalid(`${gtLabel(tx, l.garmentTypeId)} was not in this shipment. Record extra pieces as a stock adjustment.`);
      const outstanding = sl.qty - sl.received - sl.missing;
      if (tx.sign === 1 && l.received + l.missing > outstanding) {
        throw invalid(`${gtLabel(tx, l.garmentTypeId)}: only ${outstanding} still expected in this shipment.`);
      }
      sl.received += tx.sign * l.received;
      sl.missing += tx.sign * l.missing;
      tx.move(A.transit(sh.toLocationId, sh.id), A.avail(sh.toLocationId), l.garmentTypeId, l.received);
      tx.move(A.transit(sh.toLocationId, sh.id), A.adj(sh.toLocationId), l.garmentTypeId, l.missing);
    }
    const done = sh.lines.every((l) => l.received + l.missing >= l.qty);
    const any = sh.lines.some((l) => l.received + l.missing > 0);
    sh.status = done ? 'received' : any ? 'partial' : 'in_transit';
    sh.dependents = tx.dependent(sh.dependents);
  },

  'shipment.cost'(tx, op) {
    const p = op.payload;
    const sh = tx.edit<Shipment>(K.shipment(p.shipmentId));
    if (!sh) throw notFound('Shipment not found.');
    const base = { kind: 'shipcost' as const, shipmentId: sh.id, locationId: sh.fromLocationId };
    if (tx.sign === 1) {
      if (sh.status === 'voided') throw invalid('This shipment was cancelled.');
      if (p.supersedesId) {
        const old = sh.costs.find((c) => c.id === p.supersedesId);
        if (!old || old.voided || old.supersededBy) throw invalid('The cost being replaced is not an active cost line of this shipment.');
        old.supersededBy = op.id;
        tx.postings.push({ ...base, currency: old.currency, amount: -old.amount, date: old.date, category: old.category, opId: tx.applyingId });
      }
      const cost: ShipmentCost = {
        id: op.id,
        category: p.category,
        description: p.description,
        amount: p.amount,
        currency: p.currency,
        status: p.status,
        date: p.date,
        reference: p.reference,
        supersedes: p.supersedesId,
        supersededBy: null,
        voided: false,
      };
      sh.costs = [...sh.costs, cost];
      tx.post({ ...base, currency: p.currency, amount: p.amount, date: p.date, category: p.category });
    } else {
      const cost = sh.costs.find((c) => c.id === op.id);
      if (!cost || cost.voided) throw notFound('Cost line not found.');
      if (cost.supersededBy) throw invalid('This cost was replaced by a later one. Cancel the later one first.');
      cost.voided = true;
      tx.post({ ...base, currency: cost.currency, amount: cost.amount, date: cost.date, category: cost.category });
      if (cost.supersedes) {
        const old = sh.costs.find((c) => c.id === cost.supersedes);
        if (old) {
          old.supersededBy = null;
          tx.postings.push({ ...base, currency: old.currency, amount: old.amount, date: old.date, category: old.category, opId: tx.applyingId });
        }
      }
    }
    sh.dependents = tx.dependent(sh.dependents);
  },

  /* ---------------- Stock & expenses ---------------- */

  'stock.adjust'(tx, op) {
    const p = op.payload;
    needLocation(tx, p.locationId);
    if (p.reason === 'other' && !p.note) throw invalid('Explain the adjustment in the note.');
    for (const l of p.lines) {
      needGarment(tx, l.garmentTypeId);
      if (l.delta < 0) tx.move(A.avail(p.locationId), A.adj(p.locationId), l.garmentTypeId, -l.delta);
      else tx.move(A.adj(p.locationId), A.avail(p.locationId), l.garmentTypeId, l.delta);
    }
  },

  'expense.record'(tx, op) {
    const p = op.payload;
    needLocation(tx, p.locationId);
    if (p.shipmentId && !tx.replay && !tx.get(K.shipment(p.shipmentId))) throw notFound('Shipment not found.');
    tx.post({
      kind: 'expense',
      currency: p.currency,
      amount: p.amount,
      date: p.date,
      locationId: p.locationId,
      category: p.category,
      ...(p.shipmentId ? { shipmentId: p.shipmentId } : {}),
    });
  },

  /* ---------------- Worker sales day ---------------- */

  'worker.issue'(tx, op) {
    const p = op.payload;
    const day = workerDay(tx, op, p.workerId, p.locationId, p.workDate);
    for (const l of p.lines) {
      needGarment(tx, l.garmentTypeId);
      day.issued[l.garmentTypeId] = (day.issued[l.garmentTypeId] ?? 0) + tx.sign * l.qty;
      if (day.issued[l.garmentTypeId] === 0) delete day.issued[l.garmentTypeId];
      tx.move(A.avail(p.locationId), A.worker(p.locationId, p.workerId), l.garmentTypeId, l.qty);
    }
    day.opIds = tx.dependent(day.opIds);
  },

  'worker.return'(tx, op) {
    const p = op.payload;
    const day = workerDay(tx, op, p.workerId, p.locationId, p.workDate);
    for (const l of p.lines) {
      needGarment(tx, l.garmentTypeId);
      day.returned[l.garmentTypeId] = (day.returned[l.garmentTypeId] ?? 0) + tx.sign * l.qty;
      if (day.returned[l.garmentTypeId] === 0) delete day.returned[l.garmentTypeId];
      tx.move(A.worker(p.locationId, p.workerId), A.avail(p.locationId), l.garmentTypeId, l.qty);
    }
    day.opIds = tx.dependent(day.opIds);
  },

  'worker.settle'(tx, op) {
    const p = op.payload;
    const loc = needLocation(tx, p.locationId);
    if (p.currency !== loc.currency) throw invalid(`Sales at ${loc.name} are recorded in ${loc.currency}.`);
    const key = K.day(p.workerId, p.workDate);
    let day: WorkerDay;
    if (tx.sign === 1) {
      day = workerDay(tx, op, p.workerId, p.locationId, p.workDate);
    } else {
      const d = tx.edit<WorkerDay>(key);
      if (!d || d.status !== 'settled' || d.settlement?.opId !== op.id) throw invalid('This day is not closed by this record.');
      day = d;
    }

    let expected = 0;
    for (const l of p.lines) {
      needGarment(tx, l.garmentTypeId);
      const label = gtLabel(tx, l.garmentTypeId);
      if (l.sold + l.carried + l.lost !== l.held) throw invalid(`${label}: sold + kept + lost must equal the ${l.held} held.`);
      if (l.wholesaleQty > l.sold) throw invalid(`${label}: wholesale pieces cannot be more than pieces sold.`);
      if (l.sold - l.wholesaleQty > 0 && l.retailPrice <= 0) throw invalid(`${label}: no selling price set.`);
      if (l.wholesaleQty > 0 && l.wholesalePrice <= 0) throw invalid(`${label}: enter the wholesale price.`);
      expected += lineTotal(l.sold - l.wholesaleQty, l.retailPrice) + lineTotal(l.wholesaleQty, l.wholesalePrice);
      tx.move(A.worker(p.locationId, p.workerId), A.sold(p.locationId), l.garmentTypeId, l.sold);
      tx.move(A.worker(p.locationId, p.workerId), A.adj(p.locationId), l.garmentTypeId, l.lost);
      if (tx.sign === 1) {
        const holding = tx.ctx.balance(A.worker(p.locationId, p.workerId), l.garmentTypeId);
        if (holding !== l.held) {
          tx.flag('HOLDING_MISMATCH', `${label}: closing says ${l.held} held, records show ${holding}.`);
        }
        const price = priceFor((k) => tx.get(k), l.garmentTypeId, p.locationId, p.workDate);
        if (l.sold - l.wholesaleQty > 0 && price && price.retail !== l.retailPrice) {
          tx.flag('PRICE_MISMATCH', `${label}: closed at ${l.retailPrice} ${p.currency}, price list says ${price.retail}.`);
        }
      }
    }
    const expensesTotal = p.expenses.reduce((s, e) => s + e.amount, 0);
    const handed = p.cash + p.mobile;
    const variance = expected - expensesTotal - handed;

    if (tx.sign === 1) {
      day.status = 'settled';
      day.settlement = {
        opId: op.id,
        currency: p.currency,
        lines: p.lines,
        expected,
        expensesTotal,
        expenses: p.expenses,
        cash: p.cash,
        mobile: p.mobile,
        handed,
        variance,
        note: p.note,
        at: op.deviceTime,
      };
      if (variance !== 0) {
        tx.flag('CASH_VARIANCE', variance > 0 ? `Short by ${variance} ${p.currency}.` : `Over by ${-variance} ${p.currency}.`);
      }
    } else {
      day.status = 'open';
      day.settlement = null;
      day.review = null;
    }
    const base = { currency: p.currency, date: p.workDate, locationId: p.locationId, workerId: p.workerId };
    tx.post({ ...base, kind: 'sale', amount: expected });
    tx.post({ ...base, kind: 'worker_expense', amount: expensesTotal });
    tx.post({ ...base, kind: 'cash_in', amount: handed });
    day.opIds = tx.dependent(day.opIds);
  },

  'worker.review'(tx, op) {
    upsertGuard(tx);
    const p = op.payload;
    const day = tx.edit<WorkerDay>(K.day(p.workerId, p.workDate));
    if (!day || day.status !== 'settled') throw invalid('Only a closed day can be reviewed.');
    day.review = { opId: op.id, decision: p.decision, note: p.note, by: op.actorId, at: op.deviceTime };
  },
};

function activePurchase(tx: Tx, id: string): Purchase {
  const pur = tx.edit<Purchase>(K.purchase(id));
  if (!pur) throw notFound('Purchase not found.');
  if (tx.sign === 1 && pur.status === 'voided') throw invalid('This purchase was cancelled.');
  return pur;
}
function purchaseLine(tx: Tx, pur: Purchase, gt: string) {
  const pl = pur.lines.find((l) => l.garmentTypeId === gt);
  if (!pl) throw invalid(`${gtLabel(tx, gt)} is not part of this purchase.`);
  return pl;
}

/** Load (or start) the worker's day and check it may still change. */
function workerDay(tx: Tx, op: AnyOp, workerId: string, locationId: string, workDate: string): WorkerDay {
  needUser(tx, workerId);
  const loc = needLocation(tx, locationId);
  const key = K.day(workerId, workDate);
  let day = tx.edit<WorkerDay>(key);
  if (!day) {
    if (tx.sign === -1) throw notFound('Work day not found.');
    day = {
      key,
      workerId,
      locationId,
      workDate,
      issued: {},
      returned: {},
      opIds: [],
      status: 'open',
      settlement: null,
      review: null,
      firstActivityAt: op.deviceTime,
    };
    tx.put(key, day);
  }
  if (day.locationId !== locationId) throw invalid(`This day was started at another location, not ${loc.name}.`);
  if (day.status === 'settled') throw invalid('This day is already closed. Ask a manager to reopen it.');
  return day;
}

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

/**
 * Apply one operation. Pass `actor` to enforce permissions (new input);
 * pass `null` to replay an operation the server already accepted.
 */
export function applyOp(op: AnyOp, ctx: EngineCtx, actor: Actor | null): ApplyResult {
  try {
    if (actor) authorize(op, ctx, actor);
    let tx: Tx;
    let vis: VisClass | null;
    let subjectId: string | null;
    if (op.type === 'op.void') {
      const target = ctx.getOp(op.payload.targetId);
      if (!target || target.status === 'rejected') throw notFound('The record to cancel was not found.');
      if (target.voidedBy) throw new Fail('conflict', 'This record was already cancelled.');
      if (NOT_VOIDABLE.includes(target.op.type)) throw invalid('This kind of record is changed by editing, not cancelling.');
      tx = new Tx(ctx, target.op, -1, op.id, actor === null);
      (handlers[target.op.type as Exclude<OpType, 'op.void'>] as Handler<OpType>)(tx, target.op as never);
      tx.voids.push({ targetId: target.op.id, voidOpId: op.id });
      ({ vis, subjectId } = visibilityOf(target.op));
    } else {
      tx = new Tx(ctx, op, 1, op.id, actor === null);
      (handlers[op.type] as Handler<OpType>)(tx, op as never);
      ({ vis, subjectId } = visibilityOf(op));
    }
    flagNegativeBalances(tx);
    return {
      ok: true,
      effects: { writes: tx.writes, moves: tx.moves, postings: tx.postings, flags: tx.flags, voids: tx.voids, vis, subjectId },
    };
  } catch (e) {
    if (e instanceof Fail) return { ok: false, code: e.code, error: e.message };
    throw e;
  }
}

export function moveDeltas(moves: readonly Move[]): Map<string, number> {
  const deltas = new Map<string, number>();
  for (const m of moves) {
    const f = balanceKey(m.from, m.gt);
    const t = balanceKey(m.to, m.gt);
    deltas.set(f, (deltas.get(f) ?? 0) - m.qty);
    deltas.set(t, (deltas.get(t) ?? 0) + m.qty);
  }
  for (const [k, v] of deltas) if (v === 0) deltas.delete(k);
  return deltas;
}

function flagNegativeBalances(tx: Tx) {
  for (const [k, d] of moveDeltas(tx.moves)) {
    if (d >= 0) continue;
    const [acct, gt] = splitBalanceKey(k);
    if (!isPhysical(acct)) continue;
    const before = tx.ctx.balance(acct, gt);
    if (before + d < 0) {
      tx.flag('NEGATIVE_STOCK', `${describeAccount(acct, (key) => tx.get(key))}: ${gtLabel(tx, gt)} would be ${before + d} (records show ${before}).`);
    }
  }
}

export function describeAccount(acct: string, get: (key: string) => unknown): string {
  const { kind, loc, ref } = parseAccount(acct);
  const locName = loc ? ((get(K.location(loc)) as Location | undefined)?.name ?? 'location') : '';
  switch (kind) {
    case 'avail':
      return `Available at ${locName}`;
    case 'worker':
      return `Held by ${(get(K.user(ref ?? '')) as UserRef | undefined)?.name ?? 'worker'} (${locName})`;
    case 'transit':
      return `In transit (${(get(K.shipment(ref ?? '')) as Shipment | undefined)?.code ?? 'shipment'})`;
    case 'await':
      return `Waiting for collection at ${locName}`;
    case 'insp':
      return `Waiting for inspection at ${locName}`;
    case 'rej':
      return `Rejected at ${locName}`;
    case 'sold':
      return `Sold at ${locName}`;
    case 'adj':
      return `Adjustments at ${locName}`;
    case 'vendor':
      return `Vendor ${(get(K.vendor(ref ?? '')) as Vendor | undefined)?.name ?? ''}`;
  }
}
