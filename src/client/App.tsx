import { useEffect, useState, type ReactNode } from 'react';
import { store, useApp } from './lib/store';
import { href, navigate, useRoute } from './lib/router';
import type { Capability } from '../shared/permissions';
import { applyLang, useT } from './lib/i18n';
import type { Key } from '../shared/i18n';
import { LanguageChoice } from './screens/auth/Language';
import { DeraMark, Icon, type IconName } from './ui/Icon';
import { LocalCountToggle, Monogram, Sheet, SyncBadge, Toasts } from './ui/kit';
import { StorageBlocked, Welcome } from './screens/auth/Welcome';
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
  label: Key;
  icon: IconName;
  cap?: Capability | Capability[];
}

const NAV: { group: Key; items: NavItem[] }[] = [
  { group: 'nav.group.today', items: [{ to: '/', label: 'nav.overview', icon: 'home' }] },
  {
    group: 'nav.group.goods',
    items: [
      { to: '/stock', label: 'nav.stock', icon: 'box' },
      { to: '/purchases', label: 'nav.purchases', icon: 'bag', cap: ['purchasing', 'payments', 'costs.view'] },
      { to: '/vendors', label: 'nav.vendors', icon: 'store', cap: ['purchasing', 'payments', 'costs.view'] },
      { to: '/shipments', label: 'nav.shipments', icon: 'ship', cap: ['shipments', 'costs.view', 'workers.reconcile', 'stock.adjust'] },
    ],
  },
  {
    group: 'nav.group.money',
    items: [
      { to: '/days', label: 'nav.days', icon: 'people', cap: 'workers.reconcile' },
      { to: '/expenses', label: 'nav.expenses', icon: 'receipt', cap: ['expenses', 'costs.view'] },
      { to: '/reports', label: 'nav.reports', icon: 'chart', cap: 'costs.view' },
    ],
  },
  {
    group: 'nav.group.records',
    items: [
      { to: '/activity', label: 'nav.activity', icon: 'clock', cap: 'audit.view' },
      { to: '/catalogue', label: 'nav.catalogue', icon: 'tag' },
      { to: '/people', label: 'nav.people', icon: 'key', cap: 'users.manage' },
      { to: '/settings', label: 'nav.settings', icon: 'gear' },
      { to: '/counter', label: 'nav.counter', icon: 'coins' },
      { to: '/convert', label: 'nav.convert', icon: 'swap' },
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
  const { phase, user, firstRun, prefs, storageError } = useApp();
  // Applied during render so dates on this very render use the chosen language.
  applyLang(prefs.lang ?? 'en');
  const t = useT();
  useTheme();
  useIdleLock(phase === 'ready');
  let body: ReactNode;
  if (phase === 'boot') body = <div className="empty" style={{ minHeight: '100dvh', justifyContent: 'center' }}>{t('c.opening')}</div>;
  else if (!prefs.lang) body = <LanguageChoice />;
  else if (storageError) body = <StorageBlocked />;
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
  const t = useT();
  if (!demo) return null;
  return (
    <div className="demo-ribbon">
      {t('demo.ribbon')}
      <button onClick={() => store.lock()}>{t('demo.switch')}</button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Management                                                          */
/* ------------------------------------------------------------------ */

function ManageShell() {
  const { user } = useApp();
  const t = useT();
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
              <nav key={g.group} className="nav-group" aria-label={t(g.group)}>
                <span className="eyebrow">{t(g.group)}</span>
                {visible.map((i) => (
                  <a key={i.to} className="nav-link" href={href(i.to)} aria-current={current(i.to) ? 'page' : undefined}>
                    <Icon name={i.icon} size={19} />
                    {t(i.label)}
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
                  {t(`role.${user!.role}`)}
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
      <nav className="bottom-nav" aria-label={t('nav.main')}>
        {mobileMain.map((i) => (
          <a key={i.to} href={href(i.to)} aria-current={current(i.to) ? 'page' : undefined}>
            <Icon name={i.icon} size={22} />
            {t(i.label === 'nav.days' ? 'nav.daysShort' : i.label)}
          </a>
        ))}
        <button onClick={() => setMore(true)}>
          <Icon name="menu" size={22} />
          {t('nav.more')}
        </button>
      </nav>
      {more && (
        <Sheet title={t('nav.more')} onClose={() => setMore(false)}>
          <div className="stack-sm">
            {items
              .filter((i) => !mobileMain.includes(i))
              .map((i) => (
                <a key={i.to} className="nav-link" href={href(i.to)} onClick={() => setMore(false)}>
                  <Icon name={i.icon} size={19} /> {t(i.label)}
                </a>
              ))}
            <a className="nav-link" href={href('/me')} onClick={() => setMore(false)}>
              <Icon name="phone" size={19} /> {t('nav.account')}
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
  const t = useT();
  const a = parts[0] ?? '';
  const tabs: { to: string; label: Key; icon: IconName }[] = [
    { to: '/', label: 'nav.today', icon: 'home' },
    { to: '/history', label: 'c.history', icon: 'calendar' },
    { to: '/counter', label: 'nav.count', icon: 'coins' },
    { to: '/me', label: 'nav.me', icon: 'phone' },
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
      <nav className="bottom-nav" style={{ display: 'grid' }} aria-label={t('nav.main')}>
        {tabs.map((tab) => (
          <a key={tab.to} href={href(tab.to)} aria-current={(tab.to === '/' ? a === '' : `/${a}` === tab.to) ? 'page' : undefined}>
            <Icon name={tab.icon} size={22} />
            {t(tab.label)}
          </a>
        ))}
      </nav>
    </div>
  );
}
