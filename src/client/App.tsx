import { useEffect, useState, type ReactNode } from 'react';
import { store, useApp } from './lib/store';
import { href, navigate, useRoute } from './lib/router';
import type { Capability } from '../shared/permissions';
import { ROLE_LABEL } from './lib/labels';
import { DeraMark, Icon, type IconName } from './ui/Icon';
import { LocalCountToggle, Monogram, Sheet, SyncBadge, Toasts } from './ui/kit';
import { Welcome } from './screens/auth/Welcome';
import { Setup } from './screens/auth/Setup';
import { CloseDay, ReturnGarments, TakeGarments } from './screens/sales/SalesDay';
import { WorkerHistory, WorkerToday } from './screens/worker/WorkerHome';
import { CashCounter, SyncCenter } from './screens/shared/Tools';
import { CurrencyConverter } from './screens/shared/Converter';
import { Overview } from './screens/manage/Overview';
import { GarmentDetail, StockPage } from './screens/manage/Stock';
import { NewPurchase, PurchaseDetail, PurchasesPage, VendorDetail, VendorsPage } from './screens/manage/Purchases';
import { NewShipment, ShipmentDetail, ShipmentsPage } from './screens/manage/Shipments';
import { DayDetail, DaysPage } from './screens/manage/Days';
import { ExpensesPage } from './screens/manage/Expenses';
import { ReportsPage } from './screens/manage/Reports';
import { ActivityPage } from './screens/manage/Activity';
import { CataloguePage } from './screens/manage/Catalogue';
import { PeoplePage } from './screens/manage/People';
import { SettingsPage } from './screens/manage/Settings';
import { StarterSetup } from './screens/manage/StarterSetup';

const MANAGEMENT_CAPS: Capability[] = ['workers.reconcile', 'purchasing', 'shipments', 'costs.view', 'catalog.manage', 'users.manage', 'payments', 'expenses'];

interface NavItem {
  to: string;
  label: string;
  icon: IconName;
  cap?: Capability | Capability[];
}

const NAV: { group: string; items: NavItem[] }[] = [
  { group: 'Today', items: [{ to: '/', label: 'Overview', icon: 'home' }] },
  {
    group: 'Goods',
    items: [
      { to: '/stock', label: 'Stock', icon: 'box' },
      { to: '/purchases', label: 'Purchases', icon: 'bag', cap: ['purchasing', 'payments', 'costs.view'] },
      { to: '/vendors', label: 'Vendors', icon: 'store', cap: ['purchasing', 'payments', 'costs.view'] },
      { to: '/shipments', label: 'Shipments', icon: 'ship', cap: ['shipments', 'costs.view', 'workers.reconcile', 'stock.adjust'] },
    ],
  },
  {
    group: 'Money',
    items: [
      { to: '/days', label: 'Sales days', icon: 'people', cap: 'workers.reconcile' },
      { to: '/expenses', label: 'Expenses', icon: 'receipt', cap: ['expenses', 'costs.view'] },
      { to: '/reports', label: 'Reports', icon: 'chart', cap: 'costs.view' },
    ],
  },
  {
    group: 'Records',
    items: [
      { to: '/activity', label: 'Activity log', icon: 'clock', cap: 'audit.view' },
      { to: '/catalogue', label: 'Garments & prices', icon: 'tag' },
      { to: '/people', label: 'People & devices', icon: 'key', cap: 'users.manage' },
      { to: '/settings', label: 'Settings', icon: 'gear' },
      { to: '/counter', label: 'Count banknotes', icon: 'coins' },
      { to: '/convert', label: 'Currency converter', icon: 'swap' },
    ],
  },
];

function allowed(caps: readonly Capability[], cap?: Capability | Capability[]) {
  if (!cap) return true;
  return (Array.isArray(cap) ? cap : [cap]).some((c) => caps.includes(c));
}

function useTheme() {
  const { prefs } = useApp();
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);
}

/** Lock after 20 minutes without any touch or key press. */
function useIdleLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const bump = () => (last = Date.now());
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    const t = setInterval(() => {
      if (Date.now() - last > 20 * 60_000) store.lock();
    }, 30_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      clearInterval(t);
    };
  }, [active]);
}

export function App() {
  const { phase, user, firstRun } = useApp();
  useTheme();
  useIdleLock(phase === 'ready');
  let body: ReactNode;
  if (phase === 'boot') body = <div className="empty" style={{ minHeight: '100dvh', justifyContent: 'center' }}>Opening…</div>;
  else if (phase === 'setup') body = <Setup />;
  else if (phase === 'welcome' || !user) body = <Welcome />;
  else if (firstRun) body = <StarterSetup />;
  else body = user.caps.some((c) => MANAGEMENT_CAPS.includes(c)) ? <ManageShell /> : <WorkerShell />;
  return (
    <>
      {body}
      <Toasts />
    </>
  );
}

function DemoRibbon() {
  const { demo } = useApp();
  if (!demo) return null;
  return (
    <div className="demo-ribbon">
      DEMO · sample records only, kept on this device
      <button onClick={() => store.lock()}>Switch person</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Management                                                          */
/* ------------------------------------------------------------------ */

function ManageShell() {
  const { user } = useApp();
  const route = useRoute();
  const [more, setMore] = useState(false);
  const caps = user!.caps;
  const first = route.parts[0] ?? '';
  const current = (to: string) => (to === '/' ? first === '' : `/${first}` === to);

  const items = NAV.flatMap((g) => g.items).filter((i) => allowed(caps, i.cap));
  const mobileMain = ['/', '/stock', '/days', '/shipments'].map((to) => items.find((i) => i.to === to)).filter(Boolean) as NavItem[];

  return (
    <div>
      <DemoRibbon />
      <div className="shell">
        <aside className="sidebar">
          <a className="brand" href={href('/')}>
            <DeraMark />
            <span className="brand-word">mabubu</span>
          </a>
          {NAV.map((g) => {
            const visible = g.items.filter((i) => allowed(caps, i.cap));
            if (!visible.length) return null;
            return (
              <nav key={g.group} className="nav-group" aria-label={g.group}>
                <span className="eyebrow">{g.group}</span>
                {visible.map((i) => (
                  <a key={i.to} className="nav-link" href={href(i.to)} aria-current={current(i.to) ? 'page' : undefined}>
                    <Icon name={i.icon} size={19} />
                    {i.label}
                  </a>
                ))}
              </nav>
            );
          })}
          <div className="sidebar-foot">
            <LocalCountToggle />
            <SyncBadge onClick={() => navigate('/me')} />
            <button className="nav-link" style={{ border: 0, background: 'none', cursor: 'pointer', textAlign: 'left' }} onClick={() => navigate('/me')}>
              <Monogram name={user!.name} id={user!.id} small />
              <span className="stack-sm" style={{ gap: 0 }}>
                <strong style={{ color: 'var(--ink)' }}>{user!.name}</strong>
                <span className="muted" style={{ fontSize: 12.5 }}>
                  {ROLE_LABEL[user!.role]}
                </span>
              </span>
            </button>
          </div>
        </aside>
        <div style={{ minWidth: 0 }}>
          <header className="topbar">
            <a className="brand" href={href('/')}>
              <DeraMark size={28} />
              <span className="brand-word">mabubu</span>
            </a>
            <span className="spacer" />
            <SyncBadge onClick={() => navigate('/me')} />
          </header>
          <main className="main">
            <ManageRoutes />
          </main>
        </div>
      </div>
      <nav className="bottom-nav" aria-label="Main">
        {mobileMain.map((i) => (
          <a key={i.to} href={href(i.to)} aria-current={current(i.to) ? 'page' : undefined}>
            <Icon name={i.icon} size={22} />
            {i.label === 'Sales days' ? 'Sales' : i.label}
          </a>
        ))}
        <button onClick={() => setMore(true)}>
          <Icon name="menu" size={22} />
          More
        </button>
      </nav>
      {more && (
        <Sheet title="More" onClose={() => setMore(false)}>
          <div className="stack-sm">
            {items
              .filter((i) => !mobileMain.includes(i))
              .map((i) => (
                <a key={i.to} className="nav-link" href={href(i.to)} onClick={() => setMore(false)}>
                  <Icon name={i.icon} size={19} /> {i.label}
                </a>
              ))}
            <a className="nav-link" href={href('/me')} onClick={() => setMore(false)}>
              <Icon name="phone" size={19} /> Account & sync
            </a>
            <div style={{ padding: '10px' }}>
              <LocalCountToggle />
            </div>
          </div>
        </Sheet>
      )}
    </div>
  );
}

function ManageRoutes() {
  const { parts } = useRoute();
  const [a = '', b, c] = parts;
  switch (a) {
    case '':
      return <Overview />;
    case 'stock':
      return b ? <GarmentDetail id={b} /> : <StockPage />;
    case 'purchases':
      return b === 'new' ? <NewPurchase /> : b ? <PurchaseDetail id={b} /> : <PurchasesPage />;
    case 'vendors':
      return b ? <VendorDetail id={b} /> : <VendorsPage />;
    case 'shipments':
      return b === 'new' ? <NewShipment /> : b ? <ShipmentDetail id={b} /> : <ShipmentsPage />;
    case 'days':
      return b && c ? <DayDetail workerId={b} date={c} /> : <DaysPage />;
    case 'expenses':
      return <ExpensesPage />;
    case 'reports':
      return <ReportsPage />;
    case 'activity':
      return <ActivityPage />;
    case 'catalogue':
      return <CataloguePage />;
    case 'people':
      return <PeoplePage />;
    case 'settings':
      return <SettingsPage />;
    case 'counter':
      return <CashCounter />;
    case 'convert':
      return <CurrencyConverter />;
    case 'me':
      return <SyncCenter />;
    case 'take':
      return <TakeGarments />;
    case 'return':
      return <ReturnGarments />;
    case 'close':
      return <CloseDay />;
    default:
      return <Overview />;
  }
}

/* ------------------------------------------------------------------ */
/* Worker                                                              */
/* ------------------------------------------------------------------ */

function WorkerShell() {
  const { parts } = useRoute();
  const a = parts[0] ?? '';
  const tabs: { to: string; label: string; icon: IconName }[] = [
    { to: '/', label: 'Today', icon: 'home' },
    { to: '/history', label: 'History', icon: 'calendar' },
    { to: '/counter', label: 'Count', icon: 'coins' },
    { to: '/me', label: 'Me', icon: 'phone' },
  ];
  let page: ReactNode;
  switch (a) {
    case 'take':
      page = <TakeGarments />;
      break;
    case 'return':
      page = <ReturnGarments />;
      break;
    case 'close':
      page = <CloseDay />;
      break;
    case 'history':
      page = <WorkerHistory />;
      break;
    case 'counter':
      page = <CashCounter />;
      break;
    case 'convert':
      page = <CurrencyConverter />;
      break;
    case 'me':
      page = <SyncCenter />;
      break;
    default:
      page = <WorkerToday />;
  }
  return (
    <div>
      <DemoRibbon />
      <header className="topbar" style={{ display: 'flex' }}>
        <a className="brand" href={href('/')}>
          <DeraMark size={28} />
          <span className="brand-word" style={{ fontSize: 22 }}>
            mabubu
          </span>
        </a>
        <span className="spacer" style={{ flex: 1 }} />
        <SyncBadge onClick={() => navigate('/me')} />
      </header>
      <main className="main" style={{ paddingBottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}>
        {page}
      </main>
      <nav className="bottom-nav" style={{ display: 'grid' }} aria-label="Main">
        {tabs.map((t) => (
          <a key={t.to} href={href(t.to)} aria-current={(t.to === '/' ? a === '' : `/${a}` === t.to) ? 'page' : undefined}>
            <Icon name={t.icon} size={22} />
            {t.label}
          </a>
        ))}
      </nav>
    </div>
  );
}
