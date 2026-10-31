// The business assistant's relay (read-only; docs/AI_ASSISTANT.md). The
// person's own app runs the tools over its own records; this passes the
// conversation to the model with the server's rules and only the tools this
// person may use, and passes back either the model's tool requests or its
// answer. It reads no business records, writes nothing to the database, and
// logs no question, answer or record. The provider key stays on the server.
//
// Off unless configured: AI_PROVIDER (a preset below) and the secret
// AI_API_KEY. The owner chooses the provider (docs/AI_ASSISTANT.md §4).

import type { Session } from './auth';
import type { Env } from './env';
import { HttpError, json, readJson } from './http';
import { APP_NAME } from '../shared/brand';
import { ASSISTANT_LIMITS, AssistantRequest, assistantAllowed, systemPrompt, toolsFor, type AssistantInfo, type AssistantMessage, type AssistantReply, type AssistantToolCall, type UnavailableReason } from '../shared/assistant';
import { businessDate, BUSINESS_OFFSET_MIN } from '../shared/time';

interface Preset {
  label: string;
  baseUrl: string;
  /** Tried in this order. Tested on 27 Oct 2026 for tool calls, exact figures, French, Swahili and "not found" (docs/AI_ASSISTANT.md §3). */
  models: readonly string[];
}

export const PRESETS: Record<string, Preset> = {
  nvidia: {
    label: 'NVIDIA API catalog (trial: for testing)',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    models: [
      // Answered every question of the live run of 28 Oct 2026; minimax timed out there (fine earlier the same day).
      'nvidia/nemotron-3-ultra-550b-a55b',
      'minimaxai/minimax-m3.1-flash',
      'nvidia/nemotron-3.5-super-vl-120b-a12b',
      'openai/gpt-oss-20b',
      'nvidia/nemotron-3.5-lightning-30b-a3b',
      'stepfun-ai/step-5-preview',
      'nvidia/nemotron-3.5-bolt-e4b',
    ],
  },
};

/** Models tried for one step of a question, and the time allowed for them together. */
const MAX_TRIES = 3;
const CALL_TIMEOUT_MS = 25_000;
const STEP_BUDGET_MS = 45_000;

/** Per model, how long to leave it out after a failure (kept in this server instance's memory only). */
const COOLDOWN_MS: Partial<Record<UnavailableReason, number>> = { retired: 24 * 3_600_000, not_available: 3_600_000, busy: 60_000, timeout: 120_000, error: 60_000, invalid: 30_000 };
const cooldown = new Map<string, number>();

function configured(env: Env): Preset | null {
  const p = env.AI_PROVIDER ? PRESETS[env.AI_PROVIDER] : undefined;
  if (!p || !env.AI_API_KEY) return null;
  // Another address for the same kind of service (OpenAI-compatible): HTTPS only, or this computer for testing.
  const base = env.AI_BASE_URL?.trim().replace(/\/+$/, '');
  if (!base) return p;
  return /^https:\/\/[^/]+/.test(base) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/.test(base) ? { ...p, baseUrl: base } : null;
}

function modelsFor(env: Env, p: Preset): string[] {
  const listed = (env.AI_MODELS ?? '')
    .split(',')
    .map((m) => m.trim())
    .filter(Boolean);
  return listed.length ? listed : [...p.models];
}

/** Family-specific switches: answer directly, without long hidden reasoning that can use up the reply. */
function extras(model: string): Record<string, unknown> {
  if (model.startsWith('nvidia/nemotron')) return { chat_template_kwargs: { enable_thinking: false } };
  if (model.startsWith('openai/gpt-oss')) return { reasoning_effort: 'low' };
  return {};
}

function toProvider(m: AssistantMessage): Record<string, unknown> {
  if (m.role === 'user') return { role: 'user', content: m.content };
  if (m.role === 'tool') return { role: 'tool', tool_call_id: m.toolCallId, name: m.name, content: m.content };
  return {
    role: 'assistant',
    content: m.content,
    ...(m.toolCalls?.length ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: c.arguments } })) } : {}),
  };
}

/**
 * The last step of a question: what the tools showed goes into the question
 * as plain text and no tool is offered, so the model can only answer (some
 * models ask for another tool when the earlier tool calls are still there).
 */
function flattened(messages: AssistantMessage[]): Record<string, unknown>[] {
  const q = messages.map((m) => m.role).lastIndexOf('user');
  const read = messages
    .slice(q + 1)
    .filter((m): m is Extract<AssistantMessage, { role: 'tool' }> => m.role === 'tool')
    .map((m) => `[${m.name}]\n${m.content}`)
    .join('\n\n');
  return [...messages.slice(0, q).map(toProvider), { role: 'user', content: `${messages[q]!.content}\n\nWhat the tools showed (read on the device):\n\n${read}` }];
}

type Outcome = { ok: true; reply: AssistantReply } | { ok: false; reason: UnavailableReason };

/** One model, one try. Every failure becomes a reason code; nothing from the provider's error is passed on. */
async function callModel(p: Preset, key: string, model: string, body: Record<string, unknown>, allowed: Set<string>, timeoutMs: number): Promise<Outcome> {
  let res: Response;
  try {
    res = await fetch(`${p.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ ...body, model, ...extras(model) }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    return { ok: false, reason: 'timeout' };
  }
  if (!res.ok) {
    const s = res.status;
    return { ok: false, reason: s === 401 || s === 403 ? 'key' : s === 402 ? 'quota' : s === 404 ? 'not_available' : s === 410 ? 'retired' : s === 429 ? 'busy' : s === 408 || s === 504 ? 'timeout' : 'error' };
  }
  let data: { choices?: { message?: { content?: string | null; tool_calls?: { id?: string; function?: { name?: string; arguments?: string } }[] } }[] };
  try {
    data = (await res.json()) as typeof data;
  } catch {
    return { ok: false, reason: 'invalid' };
  }
  const msg = data.choices?.[0]?.message;
  const raw = msg?.tool_calls ?? [];
  if (raw.length) {
    const calls: AssistantToolCall[] = [];
    for (const [i, c] of raw.entries()) {
      const name = c.function?.name ?? '';
      const args = c.function?.arguments?.trim() || '{}';
      // A tool this person may not use, or arguments that are not a JSON object: not a usable reply.
      if (!allowed.has(name)) return { ok: false, reason: 'invalid' };
      try {
        const v: unknown = JSON.parse(args);
        if (!v || typeof v !== 'object' || Array.isArray(v)) return { ok: false, reason: 'invalid' };
      } catch {
        return { ok: false, reason: 'invalid' };
      }
      calls.push({ id: (c.id || `call_${i}`).slice(0, 100), name, arguments: args.slice(0, 4_000) });
    }
    return { ok: true, reply: { kind: 'tools', calls: calls.slice(0, 8), content: (msg?.content ?? '').slice(0, 8_000), model } };
  }
  const text = (msg?.content ?? '').trim();
  if (!text) return { ok: false, reason: 'invalid' };
  return { ok: true, reply: { kind: 'answer', text: text.slice(0, 8_000), model } };
}

export function assistantInfo(env: Env, session: Session): Response {
  const p = configured(env);
  const info: AssistantInfo = { enabled: Boolean(p), allowed: assistantAllowed(session.user), provider: p?.label ?? null };
  return json(info);
}

export async function assistantChat(env: Env, session: Session, request: Request): Promise<Response> {
  if (!assistantAllowed(session.user)) throw new HttpError(403, 'assistant_not_allowed', 'The assistant is for the owner and managers.');
  const p = configured(env);
  if (!p) throw new HttpError(503, 'assistant_off', 'The assistant is not switched on.');
  const parsed = AssistantRequest.safeParse(await readJson(request));
  if (!parsed.success) throw new HttpError(400, 'bad_request', 'The question could not be read.');
  const req = parsed.data;
  const chars = req.messages.reduce((s, m) => s + m.content.length + (m.role === 'assistant' ? (m.toolCalls ?? []).reduce((t, c) => t + c.arguments.length, 0) : 0), 0);
  if (chars > ASSISTANT_LIMITS.chars) throw new HttpError(413, 'assistant_too_long', 'This needs too much at once. Ask about fewer things, or narrow the dates.');
  if (req.messages[0]?.role !== 'user') throw new HttpError(400, 'bad_request', 'The question could not be read.');

  const tools = toolsFor(session.user.caps);
  const allowed = new Set(tools.map((t) => t.name));
  // Tool steps since the latest question: at the limit, the model must answer with what it has.
  const lastQuestion = req.messages.map((m) => m.role).lastIndexOf('user');
  const steps = req.messages.slice(lastQuestion).filter((m) => m.role === 'assistant' && m.toolCalls?.length).length;
  const finalStep = steps >= ASSISTANT_LIMITS.rounds;
  const now = new Date();
  const system = systemPrompt({
    appName: APP_NAME,
    today: businessDate(now),
    time: new Date(now.getTime() + BUSINESS_OFFSET_MIN * 60_000).toISOString().slice(11, 16),
    lang: req.lang,
    person: session.user.name,
    role: session.user.role,
  });
  const body: Record<string, unknown> = {
    messages: finalStep
      ? [{ role: 'system', content: `${system}\nYou have read enough: answer now with what the tools showed, and say what you could not check.` }, ...flattened(req.messages)]
      : [{ role: 'system', content: system }, ...req.messages.map(toProvider)],
    ...(finalStep ? {} : { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })), tool_choice: 'auto' }),
    temperature: 0.2,
    top_p: 0.95,
    max_tokens: 1_200,
    stream: false,
  };

  const order = modelsFor(env, p);
  const prefer = req.prefer && order.includes(req.prefer) ? req.prefer : null;
  const candidates = [...(prefer ? [prefer] : []), ...order.filter((m) => m !== prefer)];
  const nowMs = Date.now();
  const resting = (m: string) => (cooldown.get(m) ?? 0) > nowMs;
  // Models resting after a recent failure go last, not never: they may be back.
  const queue = [...candidates.filter((m) => !resting(m)), ...candidates.filter(resting)].slice(0, MAX_TRIES);

  const reasons: { model: string; reason: UnavailableReason }[] = [];
  const started = Date.now();
  for (const model of queue) {
    const left = STEP_BUDGET_MS - (Date.now() - started);
    if (left < 3_000) break;
    const out = await callModel(p, env.AI_API_KEY!, model, body, allowed, Math.min(CALL_TIMEOUT_MS, left));
    if (out.ok) {
      cooldown.delete(model);
      return json(out.reply);
    }
    reasons.push({ model, reason: out.reason });
    const rest = COOLDOWN_MS[out.reason];
    if (rest) cooldown.set(model, Date.now() + rest);
    // Model ids and status only: never a question, an answer, a record or a key.
    console.warn(`assistant: ${model} unavailable (${out.reason})`);
    // The key or the account is refused: every model would be.
    if (out.reason === 'key' || out.reason === 'quota') break;
  }
  throw new HttpError(503, 'assistant_unavailable', 'The assistant cannot answer just now. Everything else works as usual.', { reasons });
}

/** For tests: forget the rests between failures. */
export function resetAssistantCooldowns() {
  cooldown.clear();
}
