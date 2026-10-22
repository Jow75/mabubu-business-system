// Names for ids, and one plain-language sentence per record. Pure, so the
// screens, the reports and the exports describe things in the same words.
import type { Ledger } from './ledger';
import { K, type GarmentType, type Location, type Purchase, type Settings, type Shipment, type SizeCategory, type UserRef, type Vendor, DEFAULT_SETTINGS } from './model';
import { formatMoney, type Currency } from './money';
import type { AnyOp } from './ops';
import { tEn, type Key, type T } from './i18n';

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


/** One plain-language sentence describing a record, in the given language (English by default). */
export function describeOp(op: AnyOp, lk: Lookups, ledger: Ledger, t: T = tEn, depth = 0): string {
  const L = (table: string, code: string) => t(`lbl.${table}.${code}` as Key);
  switch (op.type) {
    case 'location.upsert':
      return t('op.location', { name: op.payload.name });
    case 'size.upsert':
      return t('op.size', { name: op.payload.name });
    case 'vendor.upsert':
      return t('op.vendor', { name: op.payload.name });
    case 'garment.upsert':
      return t('op.garment', { code: op.payload.code, name: op.payload.name });
    case 'price.set':
      return t('op.price', {
        code: lk.garment(op.payload.garmentTypeId)?.code ?? '?',
        place: lk.locName(op.payload.locationId),
        amount: formatMoney(op.payload.currency, op.payload.retail),
        wholesale: op.payload.wholesale ? t('op.priceWholesale', { amount: formatMoney(op.payload.currency, op.payload.wholesale) }) : '',
        date: op.payload.effectiveFrom,
      });
    case 'fx.set':
      return t('op.fx', { from: op.payload.from, rate: op.payload.rate, to: op.payload.to, date: op.payload.date });
    case 'settings.set':
      return t('op.settings');
    case 'purchase.record':
      return t('op.purchase', { vendor: lk.vendor(op.payload.vendorId)?.name ?? t('c.vendor'), n: pcs(op.payload.lines), intake: L('intake', op.payload.intake).toLowerCase() });
    case 'purchase.collect':
      return t('op.collect', { n: pcs(op.payload.lines), vendor: purchaseVendor(op.payload.purchaseId, lk, ledger, t) });
    case 'purchase.inspect': {
      const a = op.payload.lines.reduce((s, l) => s + l.accepted, 0);
      const r = op.payload.lines.reduce((s, l) => s + l.rejected, 0);
      return t('op.inspect', { vendor: purchaseVendor(op.payload.purchaseId, lk, ledger, t), a, r });
    }
    case 'purchase.return':
      return t('op.purchaseReturn', { n: pcs(op.payload.lines), vendor: purchaseVendor(op.payload.purchaseId, lk, ledger, t) });
    case 'vendor.payment':
      return t('op.payment', {
        vendor: lk.vendor(op.payload.vendorId)?.name ?? t('c.vendor'),
        amount: formatMoney(op.payload.currency, op.payload.amount),
        method: L('payment', op.payload.method),
        ref: op.payload.reference ? t('op.paymentRef', { ref: op.payload.reference }) : '',
        untied: op.payload.purchaseId ? '' : t('op.paymentUntied'),
      });
    case 'shipment.dispatch':
      return t('op.dispatch', { code: op.payload.code, n: pcs(op.payload.lines), from: lk.locName(op.payload.fromLocationId), to: lk.locName(op.payload.toLocationId) });
    case 'shipment.receive': {
      const r = op.payload.lines.reduce((s, l) => s + l.received, 0);
      const m = op.payload.lines.reduce((s, l) => s + l.missing, 0);
      return t('op.receive', { code: shipCode(op.payload.shipmentId, ledger, t), n: r, missing: m ? t('op.receiveMissing', { n: m }) : '' });
    }
    case 'shipment.cost':
      return t('op.shipCost', {
        category: L('shipCost', op.payload.category),
        code: shipCode(op.payload.shipmentId, ledger, t),
        amount: formatMoney(op.payload.currency, op.payload.amount),
        estimate: op.payload.status === 'estimated' ? t('op.estimate') : '',
      });
    case 'stock.adjust':
      return t('op.adjust', {
        reason: L('adjust', op.payload.reason),
        place: lk.locName(op.payload.locationId),
        lines: op.payload.lines.map((l) => `${l.delta > 0 ? '+' : ''}${l.delta} ${lk.garment(l.garmentTypeId)?.code ?? '?'}`).join(', '),
      });
    case 'expense.record':
      return t('op.expense', { category: L('expense', op.payload.category), description: op.payload.description, amount: formatMoney(op.payload.currency, op.payload.amount) });
    case 'worker.issue':
      return t('op.issue', { name: lk.personName(op.payload.workerId), n: pcs(op.payload.lines), lines: lineText(lk, op.payload.lines) });
    case 'worker.return':
      return t('op.return', { name: lk.personName(op.payload.workerId), n: pcs(op.payload.lines), lines: lineText(lk, op.payload.lines) });
    case 'worker.settle': {
      const sold = op.payload.lines.reduce((s, l) => s + l.sold, 0);
      return t('op.settle', { name: lk.personName(op.payload.workerId), n: sold, amount: formatMoney(op.payload.currency as Currency, op.payload.cash + op.payload.mobile) });
    }
    case 'worker.review':
      return t(op.payload.decision === 'approved' ? 'op.reviewApproved' : 'op.reviewQueried', {
        name: lk.personName(op.payload.workerId),
        date: op.payload.workDate,
        note: op.payload.note ? ` — “${op.payload.note}”` : '',
      });
    case 'op.void': {
      const tg = ledger.getOp(op.payload.targetId);
      return t('op.void', { what: tg && depth < 1 ? describeOp(tg.op, lk, ledger, t, depth + 1) : t('op.aRecord'), reason: op.payload.reason });
    }
    case 'op.resolve': {
      const tg = ledger.getOp(op.payload.targetId);
      const what = tg && depth < 1 ? describeOp(tg.op, lk, ledger, t, depth + 1) : t('op.aRecord');
      return op.payload.decision === 'accept'
        ? t('op.resolveAccept', { what, note: op.payload.reason ? ` — “${op.payload.reason}”` : '' })
        : t('op.resolveReject', { what, reason: op.payload.reason });
    }
  }
}

function purchaseVendor(id: string, lk: Lookups, ledger: Ledger, t: T) {
  const p = ledger.get(K.purchase(id)) as Purchase | undefined;
  return lk.vendor(p?.vendorId)?.name ?? t('c.vendor');
}
function shipCode(id: string, ledger: Ledger, t: T) {
  return (ledger.get(K.shipment(id)) as Shipment | undefined)?.code ?? t('c.shipment');
}
