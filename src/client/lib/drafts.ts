// A form whose unsaved entries are kept on this device while they are typed
// (owner, 31 Oct 2026: a sales day typed on the laptop but not yet saved was
// lost when the laptop lost power). One draft per form and context — the
// person, worker, day and place — so opening the same form again brings the
// entries back. Saving the record removes it; so does Clear. A draft is never
// a record: nothing is sent, counted or logged (store.saveDraft).

import { useCallback, useEffect, useRef, useState } from 'react';
import { store, useDrafts, type Draft, type DraftKind } from './store';

export function useFormDraft<F>(kind: DraftKind, id: string, blank: F) {
  const drafts = useDrafts();
  const saved = drafts.list.find((d) => d.kind === kind && d.id === id) as Draft<F> | undefined;
  const [form, setForm] = useState<F>(() => saved?.form ?? blank);
  const [restoredAt, setRestoredAt] = useState<string | null>(() => saved?.updatedAt ?? null);
  const [empty] = useState(() => JSON.stringify(blank));
  const latest = useRef(form);
  latest.current = form;
  /** The person has typed since the form opened. */
  const typed = useRef(false);
  /** This device's drafts have been looked at (they are read a moment after the app opens). */
  const settled = useRef(drafts.ready);
  /** The record was saved: nothing may write this draft again. */
  const closed = useRef(false);
  const pending = useRef<F | null>(null);
  const stored = useRef(JSON.stringify(saved?.form ?? blank));

  const keep = useCallback(() => {
    const f = pending.current;
    pending.current = null;
    if (!f || closed.current) return;
    const text = JSON.stringify(f);
    // A form emptied again leaves no draft behind.
    void (text === empty ? store.deleteDraft(id) : store.saveDraft(kind, id, f)).then((ok) => {
      if (ok) stored.current = text;
    });
  }, [id, kind, empty]);

  useEffect(() => {
    if (settled.current || !drafts.ready) return;
    settled.current = true;
    if (typed.current) {
      // Typing began before the drafts were read: what was typed wins, and is kept.
      pending.current = latest.current;
      keep();
    } else if (saved) {
      setForm(saved.form);
      setRestoredAt(saved.updatedAt);
      stored.current = JSON.stringify(saved.form);
    }
  }, [drafts.ready, saved, keep]);

  useEffect(() => {
    if (closed.current || !settled.current) return;
    if (JSON.stringify(form) === stored.current) {
      pending.current = null; // changed and changed back: nothing to keep
      return;
    }
    pending.current = form;
    const timer = setTimeout(keep, 300);
    return () => clearTimeout(timer);
  }, [form, keep]);

  // Leaving the page — another screen, a refresh, the app going to the background — keeps what was typed last.
  useEffect(() => {
    const now = () => keep();
    window.addEventListener('pagehide', now);
    document.addEventListener('visibilitychange', now);
    return () => {
      window.removeEventListener('pagehide', now);
      document.removeEventListener('visibilitychange', now);
      keep();
    };
  }, [keep]);

  const update = useCallback((next: F | ((f: F) => F)) => {
    typed.current = true;
    setForm(next);
  }, []);

  /** The record was saved: its draft goes. */
  const done = useCallback(() => {
    closed.current = true;
    pending.current = null;
    void store.deleteDraft(id);
  }, [id]);

  /** Start again: the entries and their draft go. */
  const clear = useCallback(() => {
    pending.current = null;
    stored.current = empty;
    setForm(JSON.parse(empty) as F);
    setRestoredAt(null);
    void store.deleteDraft(id);
  }, [id, empty]);

  return { form, update, restoredAt, done, clear };
}
