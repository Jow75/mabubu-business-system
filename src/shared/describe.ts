// Names for ids, and one plain-language sentence per record. Pure, so the
// screens, the reports and the exports describe things in the same words.
import type { Ledger } from './ledger';
import { K, type GarmentType, type Location, type Purchase, type Settings, type Shipment, type SizeCategory, type UserRef, type Vendor, DEFAULT_SETTINGS } from './model';
import { formatMoney, type Currency } from './money';
import type { AnyOp } from './ops';
import { ADJUST_LABEL, EXPENSE_LABEL, INTAKE_LABEL, PAYMENT_LABEL, SHIP_COST_LABEL } from './labels';

export interface Lookups {
  locations: Location[];
  garments: GarmentType[];
  activeGarments: GarmentType[];
  vendors: Vendor[];
  sizes: SizeCategory[];
  people: UserRef[];
  settings: Settings;
  loc: (id: string | null | undefined) => Location | undefined;
  garment: (id: string) => GarmentType | undefined;
  vendor: (id: string | null | undefined) => Vendor | undefined;
  size: (id: string | null | undefined) => SizeCategory | undefined;
  person: (id: string | null | undefined) => UserRef | undefined;
  locName: (id: string | null | undefined) => string;
  personName: (id: string | null | undefined) => string;
}

export function buildLookups(ledger: Ledger, directory: UserRef[]): Lookups {
  const locations = ledger.list<Location>('loc').sort((a, b) => a.name.localeCompare(b.name));
  const garments = ledger.list<GarmentType>('gt').sort((a, b) => a.code.localeCompare(b.code));
  const vendors = ledger.list<Vendor>('vendor').sort((a, b) => a.name.localeCompare(b.name));
  const sizes = ledger.list<SizeCategory>('size').sort((a, b) => a.sort - b.sort);
  const byId = <T extends { id: string }>(list: T[]) => new Map(list.map((x) => [x.id, x]));
  const L = byId(locations);
  const G = byId(garments);
  const V = byId(vendors);
  const S = byId(sizes);
  const P = byId(directory);
  return {
    locations,
    garments,
    activeGarments: garments.filter((g) => g.active),
    vendors,
    sizes,
    people: directory,
    settings: { ...DEFAULT_SETTINGS, ...((ledger.get(K.settings()) as Settings | undefined) ?? {}) },
    loc: (id) => (id ? L.get(id) : undefined),
    garment: (id) => G.get(id),
    vendor: (id) => (id ? V.get(id) : undefined),
    size: (id) => (id ? S.get(id) : undefined),
    person: (id) => (id ? P.get(id) : undefined),
    locName: (id) => (id ? (L.get(id)?.name ?? 'Unknown place') : '—'),
    personName: (id) => (id ? (P.get(id)?.name ?? 'Someone') : '—'),
  };
}

const pcs = (lines: readonly { qty: number }[]) => lines.reduce((s, l) => s + l.qty, 0);
const lineText = (lk: Lookups, lines: readonly { garmentTypeId: string; qty: number }[]) =>
  lines.map((l) => `${l.qty} × ${lk.garment(l.garmentTypeId)?.code ?? '?'}`).join(', ');

/** One plain-language sentence describing a record. */
export function describeOp(op: AnyOp, lk: Lookups, ledger: Ledger, depth = 0): string {
  switch (op.type) {
    case 'location.upsert':
      return `Saved location “${op.payload.name}”`;
    case 'size.upsert':
      return `Saved size group “${op.payload.name}”`;
    case 'vendor.upsert':
      return `Saved vendor “${op.payload.name}”`;
    case 'garment.upsert':
      return `Saved garment ${op.payload.code} — ${op.payload.name}`;
    case 'price.set':
      return `Set price of ${lk.garment(op.payload.garmentTypeId)?.code ?? '?'} at ${lk.locName(op.payload.locationId)}: ${formatMoney(op.payload.currency, op.payload.retail)}${op.payload.wholesale ? ` (wholesale ${formatMoney(op.payload.currency, op.payload.wholesale)})` : ''} from ${op.payload.effectiveFrom}`;
    case 'fx.set':
      return `Exchange rate: 1 ${op.payload.from} = ${op.payload.rate} ${op.payload.to} (${op.payload.date})`;
    case 'settings.set':
      return 'Changed settings';
    case 'purchase.record':
      return `Purchase from ${lk.vendor(op.payload.vendorId)?.name ?? 'vendor'}: ${pcs(op.payload.lines)} pcs, ${INTAKE_LABEL[op.payload.intake].toLowerCase()}`;
    case 'purchase.collect':
      return `Collected ${pcs(op.payload.lines)} pcs from ${purchaseVendor(op.payload.purchaseId, lk, ledger)}`;
    case 'purchase.inspect': {
      const a = op.payload.lines.reduce((s, l) => s + l.accepted, 0);
      const r = op.payload.lines.reduce((s, l) => s + l.rejected, 0);
      return `Inspected ${purchaseVendor(op.payload.purchaseId, lk, ledger)} delivery: ${a} accepted, ${r} rejected`;
    }
    case 'purchase.return':
      return `Returned ${pcs(op.payload.lines)} rejected pcs to ${purchaseVendor(op.payload.purchaseId, lk, ledger)}`;
    case 'vendor.payment':
      return `Paid ${lk.vendor(op.payload.vendorId)?.name ?? 'vendor'} ${formatMoney(op.payload.currency, op.payload.amount)} by ${PAYMENT_LABEL[op.payload.method]}${op.payload.reference ? ` (ref. ${op.payload.reference})` : ''}${op.payload.purchaseId ? '' : ' — not tied to one purchase'}`;
    case 'shipment.dispatch':
      return `Dispatched ${op.payload.code}: ${pcs(op.payload.lines)} pcs, ${lk.locName(op.payload.fromLocationId)} → ${lk.locName(op.payload.toLocationId)}`;
    case 'shipment.receive': {
      const r = op.payload.lines.reduce((s, l) => s + l.received, 0);
      const m = op.payload.lines.reduce((s, l) => s + l.missing, 0);
      return `Received ${shipCode(op.payload.shipmentId, ledger)}: ${r} pcs${m ? `, ${m} missing` : ''}`;
    }
    case 'shipment.cost':
      return `${SHIP_COST_LABEL[op.payload.category]} for ${shipCode(op.payload.shipmentId, ledger)}: ${formatMoney(op.payload.currency, op.payload.amount)}${op.payload.status === 'estimated' ? ' (estimate)' : ''}`;
    case 'stock.adjust':
      return `${ADJUST_LABEL[op.payload.reason]} at ${lk.locName(op.payload.locationId)}: ${op.payload.lines.map((l) => `${l.delta > 0 ? '+' : ''}${l.delta} ${lk.garment(l.garmentTypeId)?.code ?? '?'}`).join(', ')}`;
    case 'expense.record':
      return `${EXPENSE_LABEL[op.payload.category]}: ${op.payload.description} — ${formatMoney(op.payload.currency, op.payload.amount)}`;
    case 'worker.issue':
      return `${lk.personName(op.payload.workerId)} took ${pcs(op.payload.lines)} pcs to sell (${lineText(lk, op.payload.lines)})`;
    case 'worker.return':
      return `${lk.personName(op.payload.workerId)} returned ${pcs(op.payload.lines)} pcs (${lineText(lk, op.payload.lines)})`;
    case 'worker.settle': {
      const sold = op.payload.lines.reduce((s, l) => s + l.sold, 0);
      return `${lk.personName(op.payload.workerId)} closed the day: ${sold} pcs sold, handed over ${formatMoney(op.payload.currency as Currency, op.payload.cash + op.payload.mobile)}`;
    }
    case 'worker.review':
      return `${op.payload.decision === 'approved' ? 'Approved' : 'Queried'} ${lk.personName(op.payload.workerId)}’s day ${op.payload.workDate}${op.payload.note ? ` — “${op.payload.note}”` : ''}`;
    case 'op.void': {
      const t = ledger.getOp(op.payload.targetId);
      return `Cancelled: ${t && depth < 1 ? describeOp(t.op, lk, ledger, depth + 1) : 'a record'} — “${op.payload.reason}”`;
    }
  }
}

function purchaseVendor(id: string, lk: Lookups, ledger: Ledger) {
  const p = ledger.get(K.purchase(id)) as Purchase | undefined;
  return lk.vendor(p?.vendorId)?.name ?? 'vendor';
}
function shipCode(id: string, ledger: Ledger) {
  return (ledger.get(K.shipment(id)) as Shipment | undefined)?.code ?? 'shipment';
}
