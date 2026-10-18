// Tiny hash router: #/purchases/abc → ['purchases', 'abc'].
import { useSyncExternalStore } from 'react';

function current(): string {
  const h = window.location.hash.replace(/^#/, '');
  return h.startsWith('/') ? h : '/';
}

function subscribe(fn: () => void) {
  window.addEventListener('hashchange', fn);
  return () => window.removeEventListener('hashchange', fn);
}

export function useRoute(): { path: string; parts: string[]; query: URLSearchParams } {
  const full = useSyncExternalStore(subscribe, current);
  const [path = '/', q = ''] = full.split('?');
  return { path, parts: path.split('/').filter(Boolean), query: new URLSearchParams(q) };
}

export function navigate(to: string) {
  window.location.hash = to;
  window.scrollTo({ top: 0 });
}

export function href(to: string) {
  return `#${to}`;
}
