// Roles give default capabilities; the owner can grant or remove individual
// capabilities per person. The server re-checks these on every request —
// hiding a button in the interface is never treated as security.

export const ROLES = ['owner', 'manager', 'worker'] as const;
export type Role = (typeof ROLES)[number];

export const CAPABILITIES = [
  'sales.self',
  'workers.reconcile',
  'catalog.manage',
  'pricing.manage',
  'purchasing',
  'payments',
  'shipments',
  'stock.adjust',
  'expenses',
  'costs.view',
  'audit.view',
  'corrections',
  'users.manage',
  'settings.manage',
] as const;
export type Capability = (typeof CAPABILITIES)[number];

export const CAPABILITY_LABELS: Record<Capability, string> = {
  'sales.self': 'Take, return and close own sales day',
  'workers.reconcile': 'Record and review other workers’ days',
  'catalog.manage': 'Manage garments, vendors, locations',
  'pricing.manage': 'Set selling prices and exchange rates',
  purchasing: 'Record purchases, collections and inspections',
  payments: 'Record vendor payments',
  shipments: 'Dispatch and receive shipments, shipment costs',
  'stock.adjust': 'Adjust stock counts',
  expenses: 'Record expenses',
  'costs.view': 'See purchase costs, balances and profit',
  'audit.view': 'See the activity log',
  corrections: 'Void any record (with a reason)',
  'users.manage': 'Manage people and devices',
  'settings.manage': 'Change system settings',
};

/** Capabilities that can never be granted to a non-owner. */
export const OWNER_ONLY: readonly Capability[] = ['users.manage', 'settings.manage'];

export const ROLE_CAPABILITIES: Record<Role, readonly Capability[]> = {
  owner: CAPABILITIES,
  manager: [
    'sales.self',
    'workers.reconcile',
    'catalog.manage',
    'pricing.manage',
    'purchasing',
    'payments',
    'shipments',
    'stock.adjust',
    'expenses',
    'costs.view',
    'audit.view',
    'corrections',
  ],
  worker: ['sales.self'],
};

export function effectiveCapabilities(
  role: Role,
  grants: readonly string[] = [],
  revokes: readonly string[] = [],
): Capability[] {
  const set = new Set<Capability>(ROLE_CAPABILITIES[role]);
  for (const g of grants) {
    if ((CAPABILITIES as readonly string[]).includes(g) && (role === 'owner' || !OWNER_ONLY.includes(g as Capability))) {
      set.add(g as Capability);
    }
  }
  for (const r of revokes) {
    // The owner can never lock themselves out of user management.
    if (role === 'owner' && OWNER_ONLY.includes(r as Capability)) continue;
    set.delete(r as Capability);
  }
  return CAPABILITIES.filter((c) => set.has(c));
}

/** Minimum PIN length per role (see ADR-001 §6). */
export const MIN_PIN_LENGTH: Record<Role, number> = { owner: 6, manager: 6, worker: 4 };
export const MAX_PIN_LENGTH = 8;

export function pinPolicyError(role: Role, pin: string): string | null {
  if (!/^\d+$/.test(pin)) return 'The code must contain digits only.';
  if (pin.length < MIN_PIN_LENGTH[role]) return `A ${role} code needs at least ${MIN_PIN_LENGTH[role]} digits.`;
  if (pin.length > MAX_PIN_LENGTH) return `The code can have at most ${MAX_PIN_LENGTH} digits.`;
  if (/^(\d)\1+$/.test(pin)) return 'Avoid codes with one repeated digit.';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'Avoid simple sequences like 1234.';
  return null;
}

/* ------------------------------------------------------------------ */
/* Visibility: who may download which records                          */
/* ------------------------------------------------------------------ */

export const VIS_CLASSES = ['ref', 'vendor', 'fx', 'purchase', 'shipment', 'shipcost', 'stock', 'expense', 'worker'] as const;
export type VisClass = (typeof VIS_CLASSES)[number];

const VIS_READERS: Record<VisClass, readonly Capability[] | 'everyone'> = {
  ref: 'everyone',
  vendor: ['purchasing', 'payments', 'costs.view', 'catalog.manage'],
  fx: ['costs.view', 'pricing.manage'],
  purchase: ['purchasing', 'payments', 'costs.view'],
  shipment: ['shipments', 'costs.view', 'stock.adjust', 'workers.reconcile'],
  shipcost: ['shipments', 'costs.view'],
  stock: ['stock.adjust', 'costs.view', 'audit.view', 'workers.reconcile'],
  expense: ['expenses', 'costs.view'],
  // Worker records are always visible to the worker they belong to.
  worker: ['workers.reconcile'],
};

export function readableClasses(caps: readonly Capability[]): VisClass[] {
  return VIS_CLASSES.filter((v) => {
    const readers = VIS_READERS[v];
    return readers === 'everyone' || readers.some((c) => caps.includes(c));
  });
}
