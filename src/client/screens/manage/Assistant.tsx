import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AssistantInfo } from '../../../shared/assistant';
import { ASSISTANT_LIMITS } from '../../../shared/assistant';
import type { Key } from '../../../shared/i18n';
import { fmtTime } from '../../../shared/time';
import { api, ApiError } from '../../lib/api';
import { ask, clearTurns, retry, useTurns, type Turn } from '../../lib/assistant';
import { useLang, useT } from '../../lib/i18n';
import { store, useApp } from '../../lib/store';
import { Icon } from '../../ui/Icon';
import { Empty, PageHead } from '../../ui/kit';

/** The tool being run on this device, in the words of the screen it comes from. */
const READING: Record<string, Key> = {
  purchases: 'nav.purchases',
  vendors_and_payments: 'nav.vendors',
  stock_now: 'nav.stock',
  stock_movements: 'nav.stock',
  shipments: 'nav.shipments',
  sales_days: 'nav.days',
  sales_by_garment: 'nav.days',
  worker_records: 'nav.days',
  expenses: 'nav.expenses',
  activity_log: 'nav.activity',
  profit: 'nav.reports',
  garments_and_prices: 'nav.catalogue',
  data_status: 'ai.status',
};

const EXAMPLES: Key[] = ['ai.ex.week', 'ai.ex.unpaid', 'ai.ex.owe', 'ai.ex.stock', 'ai.ex.shipments', 'ai.ex.days', 'ai.ex.sync'];

const ERRORS: Record<string, Key> = {
  assistant_off: 'ai.offBody',
  assistant_unavailable: 'ai.err.unavailable',
  assistant_not_allowed: 'ai.notAllowed',
  assistant_too_long: 'ai.err.tooLong',
  offline: 'ai.err.offline',
};

/** **bold** and *italic* inside a line; everything else is plain text (never HTML). */
function inline(s: string): ReactNode[] {
  return s.split(/(\*\*[^*\n]+\*\*|\*[^*\s][^*\n]*\*)/g).map((p, i) =>
    p.length > 4 && p.startsWith('**') && p.endsWith('**') ? <strong key={i}>{p.slice(2, -2)}</strong> : p.length > 2 && p.startsWith('*') && p.endsWith('*') ? <em key={i}>{p.slice(1, -1)}</em> : p,
  );
}

/** The answer's simple formatting — paragraphs, lists, small tables, bold — as React elements. */
function AnswerText({ text }: { text: string }) {
  const out: ReactNode[] = [];
  let para: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  let table: string[][] | null = null;
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{inline(para.join(' '))}</p>);
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>);
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>);
    }
    if (table?.length) {
      const [head, ...rows] = table;
      out.push(
        <div key={out.length} className="table-wrap">
          <table>
            <thead>
              <tr>{head!.map((c, i) => <th key={i}>{inline(c)}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>{r.map((c, j) => <td key={j}>{inline(c)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
    }
    para = [];
    list = null;
    table = null;
  };
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (/^\|.*\|$/.test(line)) {
      if (/^\|[\s:|-]+\|$/.test(line)) continue; // the |---|---| line under a table's header
      if (!table) flush();
      (table ??= []).push(line.slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    const bullet = /^(?:[-*•]\s+|(\d+)[.)]\s+)(.*)$/.exec(line);
    if (bullet) {
      const ordered = Boolean(bullet[1]);
      if (!list || list.ordered !== ordered) flush();
      (list ??= { ordered, items: [] }).items.push(bullet[2]!);
      continue;
    }
    if (!line) {
      flush();
      continue;
    }
    if (list || table) flush();
    para.push(line.replace(/^#{1,4}\s+/, ''));
  }
  flush();
  return <>{out}</>;
}

function TurnView({ turn }: { turn: Turn }) {
  const t = useT();
  const lang = useLang();
  return (
    <div className="ai-turn">
      <div className="ai-q">{turn.question}</div>
      {turn.state === 'asking' && (
        <div className="ai-a ai-working" aria-live="polite">
          <span className="muted">{turn.reading ? t('ai.reading', { what: t(READING[turn.reading] ?? 'ai.status') }) : t('ai.thinking')}</span>
        </div>
      )}
      {turn.state === 'done' && (
        <div className="ai-a">
          <AnswerText text={turn.answer ?? ''} />
          {(turn.unverified?.length ?? 0) > 0 && (
            <div className="note-box" style={{ margin: '4px 0 6px' }}>
              {t('ai.unverified', { list: turn.unverified!.map((n) => Number(n).toLocaleString('en-US')).join(', ') })}
            </div>
          )}
          {turn.sources.length > 0 && (
            <div className="ai-src">
              <span>{t('ai.basedOn')}</span>
              {turn.sources.map((s, i) => (
                <span key={i}>
                  <strong>{s.title}</strong>
                  {s.filters ? ` — ${s.filters}` : ''}
                </span>
              ))}
            </div>
          )}
          {turn.sources.length === 0 && <div className="ai-src">{t('ai.noRecords')}</div>}
          <div className="ai-meta">{t('ai.writtenBy', { model: turn.model ?? '—', time: fmtTime(turn.at) })}</div>
        </div>
      )}
      {turn.state === 'failed' && (
        <div className="ai-a" role="alert">
          <div className="error-box">{t(ERRORS[turn.error?.code ?? ''] ?? 'ai.err.other')}</div>
          <button className="btn btn-sm" style={{ marginTop: 10 }} onClick={() => void retry(turn.id, lang)}>
            <Icon name="refresh" size={15} /> {t('ai.tryAgain')}
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Ask the records (docs/AI_ASSISTANT.md): questions answered by an AI model
 * that may only read the reports this person may download, run on this
 * device. Owner and managers only; it never records or changes anything.
 */
export function AssistantPage() {
  const { demo, online } = useApp();
  const t = useT();
  const lang = useLang();
  const turns = useTurns();
  const [info, setInfo] = useState<AssistantInfo | null>(null);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const end = useRef<HTMLDivElement>(null);
  const busy = turns.some((x) => x.state === 'asking');

  useEffect(() => {
    if (demo || !online) return;
    setInfoError(null);
    api<AssistantInfo>('GET', '/assistant', undefined, store.token)
      .then(setInfo)
      .catch((e: unknown) => setInfoError(e instanceof ApiError && e.offline ? 'offline' : 'error'));
  }, [demo, online]);
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [turns.length, busy]);

  const send = (q: string) => {
    if (!q.trim() || busy) return;
    setQuestion('');
    void ask(q, lang);
  };

  const head = <PageHead title={t('ai.title')} lead={t('ai.lead')} actions={turns.length > 0 && !busy ? <button className="btn btn-ghost btn-sm" onClick={clearTurns}>{t('ai.clear')}</button> : undefined} />;
  if (demo)
    return (
      <div className="page">
        {head}
        <Empty icon="info" title={t('ai.demo')}>
          {t('ai.demoBody')}
        </Empty>
      </div>
    );
  const ready = online && info?.enabled && info.allowed;
  return (
    <div className="page" style={{ maxWidth: 860 }}>
      {head}
      {!online && <div className="info-box">{t('ai.offline')}</div>}
      {online && !info && !infoError && <p className="muted">{t('ai.checking')}</p>}
      {online && infoError && <div className="error-box">{t(infoError === 'offline' ? 'ai.err.offline' : 'ai.err.other')}</div>}
      {online && info && !info.allowed && <Empty icon="lock" title={t('ai.notAllowed')} />}
      {online && info?.allowed && !info.enabled && (
        <Empty icon="info" title={t('ai.off')}>
          {t('ai.offBody')}
        </Empty>
      )}
      <div className="ai-thread">
        {turns.map((x) => (
          <TurnView key={x.id} turn={x} />
        ))}
      </div>
      {ready && turns.length === 0 && (
        <section className="stack-sm">
          <span className="section-title">{t('ai.suggest')}</span>
          <div className="row" style={{ flexWrap: 'wrap', gap: 8 }}>
            {EXAMPLES.map((k) => (
              <button key={k} className="btn btn-sm" onClick={() => send(t(k))}>
                {t(k)}
              </button>
            ))}
          </div>
        </section>
      )}
      {ready && (
        <form
          className="ai-ask"
          onSubmit={(e) => {
            e.preventDefault();
            send(question);
          }}
        >
          <textarea
            className="textarea"
            rows={2}
            maxLength={ASSISTANT_LIMITS.question}
            aria-label={t('ai.placeholder')}
            placeholder={t('ai.placeholder')}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                send(question);
              }
            }}
          />
          <div className="row-between" style={{ gap: 10, flexWrap: 'wrap' }}>
            <span className="hint">{t('ai.sentTo', { provider: info.provider ?? '—' })}</span>
            <button type="submit" className="btn btn-primary" disabled={busy || !question.trim()}>
              <Icon name="search" size={17} /> {t('ai.ask')}
            </button>
          </div>
          <span className="hint">{t('ai.memory')}</span>
        </form>
      )}
      {/* The very end of the page: there the question box rests below the conversation, covering none of it. */}
      <div ref={end} className="ai-end" />
    </div>
  );
}
