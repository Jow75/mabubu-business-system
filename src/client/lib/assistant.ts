// Asking the business assistant (docs/AI_ASSISTANT.md). The server relays the
// conversation to the model; every tool the model asks for runs here, over
// this device's own records, through the same report builders as the
// downloads. The conversation lives in this page only: it is never written to
// the device, and it is forgotten when the app locks or someone else signs in.

import { useSyncExternalStore } from 'react';
import { ASSISTANT_LIMITS, type AssistantMessage, type AssistantReply } from '../../shared/assistant';
import { runTool, unverifiedFigures, type AssistantCtx, type ToolSource } from '../../shared/assistant-tools';
import type { Lang } from '../../shared/i18n';
import { uuidv7 } from '../../shared/ids';
import { api, ApiError } from './api';
import { reportCtx } from './report-ctx';
import { store } from './store';

export interface Turn {
  id: string;
  question: string;
  at: string;
  state: 'asking' | 'done' | 'failed';
  answer?: string;
  model?: string;
  /** What the answer was based on: each report read, with its filters. */
  sources: ToolSource[];
  /** Figures in the answer not found in anything read for it: to be checked (unverifiedFigures). */
  unverified?: string[];
  /** While asking: the tool being run on this device. */
  reading?: string;
  error?: { code: string; message: string };
}

let turns: readonly Turn[] = [];
/** Who the conversation belongs to: the person signed in when it started. */
let owner: string | null = store.getSnapshot().user?.id ?? null;
const listeners = new Set<() => void>();

function emit(next: readonly Turn[]) {
  turns = next;
  for (const l of listeners) l();
}

// The conversation belongs to the person signed in: locking or switching person forgets it.
store.subscribe(() => {
  const id = store.getSnapshot().user?.id ?? null;
  if (id === owner) return;
  owner = id;
  if (turns.length) emit([]);
});

export function useTurns(): readonly Turn[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    () => turns,
  );
}

export function clearTurns() {
  emit([]);
}

/** The conversation now (outside React). */
export function getTurns(): readonly Turn[] {
  return turns;
}

function patch(id: string, p: Partial<Turn>) {
  if (turns.some((t) => t.id === id)) emit(turns.map((t) => (t.id === id ? { ...t, ...p } : t)));
}

function assistantCtx(): AssistantCtx {
  const s = store.getSnapshot();
  return { ...reportCtx(), sync: { lastSyncAt: s.sync.lastSyncAt, pending: s.sync.pending, held: s.sync.held, rejected: s.sync.rejected, online: s.online } };
}

/** Earlier questions and answers, so a follow-up question makes sense (each answer re-reads the reports it needs). */
function history(): AssistantMessage[] {
  return turns
    .filter((t) => t.state === 'done' && t.answer)
    .slice(-3)
    .flatMap((t): AssistantMessage[] => [
      { role: 'user', content: t.question.slice(0, ASSISTANT_LIMITS.question) },
      { role: 'assistant', content: t.answer!.slice(0, 8_000) },
    ]);
}

function unique(sources: ToolSource[]): ToolSource[] {
  const seen = new Set<string>();
  return sources.filter((s) => {
    const k = `${s.tool}|${s.filters}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Ask one question: send it, run on this device each report the model asks for, until it answers. */
export async function ask(question: string, lang: Lang): Promise<void> {
  const q = question.trim().slice(0, ASSISTANT_LIMITS.question);
  if (!q) return;
  const before = history();
  const id = uuidv7();
  owner = store.getSnapshot().user?.id ?? null;
  emit([...turns, { id, question: q, at: new Date().toISOString(), state: 'asking', sources: [] }]);
  const messages: AssistantMessage[] = [...before, { role: 'user', content: q }];
  const sources: ToolSource[] = [];
  const read: string[] = [];
  let prefer: string | null = null;
  try {
    for (let step = 0; step <= ASSISTANT_LIMITS.rounds; step++) {
      const reply: AssistantReply = await api<AssistantReply>('POST', '/assistant', { messages, lang, prefer }, store.token);
      prefer = reply.model;
      if (reply.kind === 'answer') {
        patch(id, { state: 'done', answer: reply.text, model: reply.model, sources: unique(sources), unverified: unverifiedFigures(reply.text, read, q), reading: undefined });
        return;
      }
      messages.push({ role: 'assistant', content: reply.content, toolCalls: reply.calls });
      for (const c of reply.calls) {
        patch(id, { reading: c.name });
        const r = runTool(assistantCtx(), c.name, c.arguments);
        if (r.source) sources.push(r.source);
        read.push(r.text);
        messages.push({ role: 'tool', toolCallId: c.id, name: c.name, content: r.text });
      }
    }
    throw new ApiError(500, 'assistant_steps', 'Too many steps.');
  } catch (e) {
    const error = e instanceof ApiError ? { code: e.offline ? 'offline' : e.code, message: e.message } : { code: 'error', message: e instanceof Error ? e.message : String(e) };
    patch(id, { state: 'failed', error, sources: unique(sources), reading: undefined });
  }
}

/** Ask a failed question again (it is replaced, not repeated). */
export function retry(id: string, lang: Lang): Promise<void> {
  const t = turns.find((x) => x.id === id);
  if (!t) return Promise.resolve();
  emit(turns.filter((x) => x.id !== id));
  return ask(t.question, lang);
}
