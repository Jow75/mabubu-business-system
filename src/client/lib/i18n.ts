// The interface language for this device. Stored with the other device
// preferences (localStorage), so it works offline, survives reloads and
// installs, and never changes another person's device or any record.
import { Fragment, createElement, useMemo, type ReactNode } from 'react';
import { DICTS, LOCALE, detectLang, greeting, localizeError, makeT, type Lang, type T } from '../../shared/i18n';
import { setDisplayLocale } from '../../shared/time';
import { useApp } from './store';

export type { Lang, T } from '../../shared/i18n';
export { LANGS } from '../../shared/i18n';

let current: Lang = 'en';

/** Apply a language to non-React parts (dates, <html lang>, toasts). */
export function applyLang(lang: Lang) {
  current = lang;
  setDisplayLocale(LOCALE[lang]);
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/** The suggested language for this device's settings. */
export function suggestedLang(): Lang {
  if (typeof navigator === 'undefined') return 'en';
  return detectLang(navigator.languages?.length ? navigator.languages : [navigator.language]);
}

export function currentLang(): Lang {
  return current;
}

/** Translator for code outside React components. */
export function tNow(): T {
  return makeT(current);
}

export function useLang(): Lang {
  return useApp().prefs.lang ?? 'en';
}

export function useT(): T {
  const lang = useLang();
  return useMemo(() => makeT(lang), [lang]);
}

export function errText(message: string | null | undefined): string {
  return localizeError(current, message);
}

export { greeting, DICTS };

/**
 * Put React elements (e.g. a formatted amount) into a translated sentence:
 * rich(t('sd.worth'), { amount: <Money … /> }). The template keeps its
 * {placeholders} because t() was called without values for them.
 */
export function rich(template: string, nodes: Record<string, ReactNode>): ReactNode {
  const parts = template.split(/\{(\w+)\}/);
  return createElement(Fragment, null, ...parts.map((p, i) => (i % 2 ? (nodes[p] ?? `{${p}}`) : p)));
}
