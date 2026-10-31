import { useEffect, useState, type ReactNode } from 'react';
import { store, useApp } from './lib/store';
import { href, navigate, useRoute } from './lib/router';
import type { Capability } from '../shared/permissions';
import type { SessionUser } from '../shared/api';
import { applyLang, useT } from './lib/i18n';
import type { Key } from '../shared/i18n';
import { LanguageChoice } from './screens/auth/Language';
import { Icon, type IconName } from './ui/Icon';
import { Brand } from './ui/Brand';
import { Empty, LocalCountToggle, Monogram, Sheet, SyncBadge, Toasts } from './ui/kit';
import { TemporaryRibbon } from './ui/Temporary';
import { TEMP_SIGNIN } from '../shared/api';
import { StorageBlocked, Welcome } from './screens/auth/Welcome';
import { useUpdateReady } from './lib/update';
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
import { GoLivePage } from './screens/manage/GoLive';
import { AssistantPage } from './screens/manage/Assistant';
import { StarterSetup } from './screens/manage/StarterSetup';

const MANAGEMENT_CAPS: Capability[] = ['workers.reconcile', 'purchasing', 'shipments', 'costs.view', 'catalog.manage', 'users.manage', 'payments', 'expenses'];

interface NavItem {
  to: string;
  label: Key;
  icon: IconName;
  cap?: Capability | Capability[];
  /** Also open, to look at only, in the owner's temporary sign-in (ADR-006). */
  temporaryOwner?: boolean;
}

const NAV: { group: Key; items: NavItem[] }[] = [
  {
    group: 'nav.group.today',
    items: [
      { to: '/', label: 'nav.overview', icon: 'home' },
      // Anyone who may read a report (docs/AI_ASSISTANT.md); the server re-checks.
      { to: '/assistant', label: 'nav.assistant', icon: 'search', cap: ['costs.view', 'workers.reconcile', 'audit.view', 'purchasing', 'payments', 'shipments', 'stock.adjust', 'expenses', 'catalog.manage', 'pricing.manage'] },
    ],
  },
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
      { to: '/people', label: 'nav.people', icon: 'key', cap: 'users.manage', temporaryOwner: true },
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

function canOpen(user: SessionUser, item: NavItem) {
  return allowed(user.caps, item.cap) || Boolean(item.temporaryOwner && user.temporary && user.role === 'owner');
}

/** Pages that need a right, by their first path part; go live is the owner's own device only. */
const PAGE_RIGHTS: Record<string, NavItem> = {
  ...Object.fromEntries(NAV.flatMap((g) => g.items).map((i) => [i.to.slice(1), i])),
  golive: { to: '/golive', label: 'nav.settings', icon: 'gear', cap: 'users.manage' },
};

/**
 * A page opened from a link or a typed address that this sign-in may not use.
 * The server refuses it anyway; this says why in plain words, instead of an
 * error from the server.
 */
function NotAvailable() {
  const { user } = useApp();
  const t = useT();
  const temp = Boolean(user?.temporary);
  return (
    <div className="page">
      <Empty icon="lock" title={temp ? t('guard.tempTitle') : t('guard.title')}>
        {temp ? t('guard.tempBody') : t('guard.body')}
      </Empty>
      <a className="btn" style={{ alignSelf: 'flex-start' }} href={href('/')}>
        <Icon name="left" size={17} /> {t('guard.home')}
      </a>
    </div>
  );
}

function useTheme() {
  const { prefs } = useApp();
  useEffect(() => {
    const root = document.documentElement;
    if (prefs.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', prefs.theme);
  }, [prefs.theme]);
}

/**
 * After 20 minutes without any touch or key press: lock — or, on a temporary
 * sign-in, sign out (ADR-006; not while its records are still unsent).
 */
function useIdleLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    let last = Date.now();
    const bump = () => {
      last = Date.now();
      store.shareActivity();
    };
    window.addEventListener('pointerdown', bump);
    window.addEventListener('keydown', bump);
    // Work in another tab sharing a temporary sign-in counts too.
    const off = store.onActivity(() => (last = Date.now()));
    const t = setInterval(() => {
      if (Date.now() - last > TEMP_SIGNIN.idleMinutes * 60_000) store.idle();
    }, 30_000);
    return () => {
      window.removeEventListener('pointerdown', bump);
      window.removeEventListener('keydown', bump);
      off();
      clearInterval(t);
    };
  }, [active]);
}

/** Closing the tab during a temporary sign-in with unsent records loses them: let the browser ask first. */
function useLeaveGuard() {
  useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (!store.reloadUnsafe()) return;
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, []);
}


/** A new version is ready: reload now, or it happens by itself when the app is left. */
function UpdateBar() {
  const ready = useUpdateReady();
  const t = useT();
  if (!ready) return null;
  return (
    <div className="update-bar" role="status">
      <span>{t('upd.ready')}</span>
      <button className="btn btn-sm btn-primary" onClick={() => location.reload()}>
        {t('upd.reload')}
      </button>
    </div>
  );
}

export function App() {
  const { phase, user, firstRun, prefs, storageError } = useApp();
  // Applied during render so dates on this very render use the chosen language.
  applyLang(prefs.lang ?? 'en');
  const t = useT();
  useTheme();
  useIdleLock(phase === 'ready');
  useLeaveGuard();
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
      <UpdateBar />
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
  const first = route.parts[0] ?? '';
  const current = (to: string) => (to === '/' ? first === '' : `/${first}` === to);

  const items = NAV.flatMap((g) => g.items).filter((i) => canOpen(user!, i));
  const mobileMain = ['/', '/stock', '/days', '/shipments'].map((to) => items.find((i) => i.to === to)).filter(Boolean) as NavItem[];

  return (
    <div>
      <DemoRibbon />
      <TemporaryRibbon />
      <div className="shell">
        <aside className="sidebar">
          <Brand href={href('/')} size={38} />
          {NAV.map((g) => {
            const visible = g.items.filter((i) => canOpen(user!, i));
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
            <Brand href={href('/')} size={32} />
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
  const { user } = useApp();
  const { parts } = useRoute();
  const [a = '', b, c] = parts;
  const rights = PAGE_RIGHTS[a];
  if (rights && !canOpen(user!, rights)) return <NotAvailable />;
  switch (a) {
    case '':
      return <Overview />;
    case 'assistant':
      return <AssistantPage />;
    case 'stock':
      return b ? <GarmentDetail id={b} /> : <StockPage />;
    case 'purchases':
      return b === 'new' ? <NewPurchase draftId={c ?? null} /> : b ? <PurchaseDetail id={b} /> : <PurchasesPage />;
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
    case 'golive':
      return <GoLivePage />;
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
        <Brand href={href('/')} size={32} />
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
