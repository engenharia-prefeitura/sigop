/// <reference lib="deno.ns" />
// SIGOP - Edge Function ai-proxy (assistente IA v2)
//
// DEPLOY:
//   1) Rodar documentation/setup_ai_assistant.sql no SQL Editor.
//   2) supabase secrets set AI_KEY_SECRET=<string aleatoria >= 32 chars>
//      (SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ja sao injetados pelo Supabase.)
//      NAO troque AI_KEY_SECRET depois de salvar keys (ficariam ilegiveis).
//   3) supabase functions deploy ai-proxy --no-verify-jwt
//      (o JWT e validado manualmente com auth.getUser; ver supabase/config.toml)
//
// Protocolo: ver lib/ai/types.ts (ProxyRequest / StreamEvent). Tipos copiados abaixo
// porque a funcao e empacotada isoladamente.

import { createClient } from 'npm:@supabase/supabase-js@2';

// ------------------------------------------------------------------ Tipos
type ProviderId = 'openrouter' | 'deepseek' | 'google' | 'anthropic' | 'openai' | 'custom';
type ApiFormat = 'openai' | 'google' | 'anthropic';
type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; attachmentId?: string; mediaType: string; data: string };
interface ToolCall { id: string; name: string; arguments: Record<string, any> }
interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ContentPart[];
  toolCalls?: ToolCall[];
  toolCallId?: string;
  toolName?: string;
}
interface ToolDefinition { name: string; description: string; parameters: Record<string, any> }
interface Usage { inputTokens?: number; outputTokens?: number }
type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; stopReason: 'end' | 'tool_use' | 'max_tokens' | 'other'; usage?: Usage }
  | { type: 'error'; message: string };
interface ModelInfo { id: string; name?: string; vision?: boolean; contextLength?: number }

// ------------------------------------------------------------------ Constantes
const MAX_BODY_BYTES = 25 * 1024 * 1024;
const DEFAULT_MAX_TOKENS = 4096;
const PROVIDERS: Record<ProviderId, { format: ApiFormat; baseUrl: string }> = {
  openrouter: { format: 'openai', baseUrl: 'https://openrouter.ai/api/v1' },
  deepseek: { format: 'openai', baseUrl: 'https://api.deepseek.com' },
  openai: { format: 'openai', baseUrl: 'https://api.openai.com/v1' },
  google: { format: 'google', baseUrl: 'https://generativelanguage.googleapis.com/v1beta' },
  anthropic: { format: 'anthropic', baseUrl: 'https://api.anthropic.com/v1' },
  custom: { format: 'openai', baseUrl: '' },
};
const NO_KEY = '-'; // placeholder para custom sem key (ex.: Ollama local)

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

// ------------------------------------------------------------------ SSRF
function isPrivateIPv4(h: string): boolean {
  const m = h.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127) || a >= 224;
}
function isPrivateIPv6(h: string): boolean {
  const s = h.replace(/^\[|\]$/g, '').toLowerCase();
  if (!s.includes(':')) return false;
  if (s === '::' || s === '::1') return true;
  if (/^f[cd]/.test(s) || /^fe[89ab]/.test(s)) return true;
  const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);
  if (s.startsWith('::ffff:')) return true; // forma hex do mapped: bloqueia por seguranca
  return false;
}
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

async function validateCustomUrl(raw: string): Promise<string> {
  let u: URL;
  try { u = new URL(raw.trim()); } catch { throw new HttpError(400, 'URL base invalida.'); }
  if (u.username || u.password) throw new HttpError(400, 'URL base nao pode conter credenciais.');
  const host = u.hostname.toLowerCase();
  const local = LOCAL_HOSTS.has(host);
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) {
    throw new HttpError(400, 'URL base deve usar https:// (ou http://localhost).');
  }
  if (!local) {
    if (host.endsWith('.internal') || host.endsWith('.local') || host.endsWith('.localhost') ||
        host === 'metadata' || host === '169.254.169.254' || !host.includes('.') && !host.includes(':')) {
      throw new HttpError(400, 'Host da URL base nao permitido.');
    }
    if (isPrivateIPv4(host) || isPrivateIPv6(host)) {
      throw new HttpError(400, 'URL base aponta para rede privada; nao permitido.');
    }
    // Best effort contra DNS rebinding/hosts que resolvem para IP privado.
    try {
      for (const type of ['A', 'AAAA'] as const) {
        const ips = await Deno.resolveDns(host, type).catch(() => [] as string[]);
        for (const ip of ips) {
          if (isPrivateIPv4(ip) || isPrivateIPv6(ip)) {
            throw new HttpError(400, 'URL base resolve para rede privada; nao permitido.');
          }
        }
      }
    } catch (e) {
      if (e instanceof HttpError) throw e;
    }
  }
  u.hash = '';
  u.search = '';
  return u.toString().replace(/\/+$/, '');
}

// ------------------------------------------------------------------ Helpers
function textOf(parts: ContentPart[]): string {
  return (parts ?? []).filter((p) => p.type === 'text').map((p) => (p as any).text).join('\n');
}
function imagesOf(parts: ContentPart[]) {
  return (parts ?? []).filter((p) => p.type === 'image') as Extract<ContentPart, { type: 'image' }>[];
}
function safeJson(s: string): any { try { return JSON.parse(s); } catch { return undefined; } }
function redact(msg: string, key: string): string {
  let out = String(msg ?? '');
  if (key && key !== NO_KEY && key.length >= 6) out = out.split(key).join('***');
  return out.replace(/(sk-[A-Za-z0-9_-]{8,}|AIza[0-9A-Za-z_-]{20,})/g, '***');
}
function makeHint(key: string): string {
  if (key === NO_KEY) return '';
  return key.length >= 12 ? `${key.slice(0, 3)}...${key.slice(-4)}` : `...${key.slice(-4)}`;
}
function genId(prefix = 'call'): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
}

async function providerError(res: Response, key: string): Promise<string> {
  const t = (await res.text().catch(() => '')).slice(0, 2000);
  let msg: any = t;
  const j = safeJson(t);
  if (j !== undefined) {
    const e = Array.isArray(j) ? j[0] : j;
    msg = e?.error?.message ?? e?.error ?? e?.message ?? t;
    if (typeof msg !== 'string') msg = JSON.stringify(msg);
  }
  const hint = res.status === 401 || res.status === 403 ? ' Verifique a API key.' :
    res.status === 429 ? ' Limite de requisicoes/credito excedido.' : '';
  return redact(`Erro do provedor (HTTP ${res.status}): ${String(msg).slice(0, 500)}.${hint}`, key);
}

// ------------------------------------------------------------------ SSE reader
async function* sseData(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i: number;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        if (line.startsWith('data:')) yield line.slice(5).trimStart();
      }
    }
    const last = buf.replace(/\r$/, '');
    if (last.startsWith('data:')) yield last.slice(5).trimStart();
  } finally {
    try { reader.releaseLock(); } catch { /* ignore */ }
  }
}

// ------------------------------------------------------------------ Requisicao por formato
interface BuiltReq { url: string; headers: Record<string, string>; body: string }
interface ChatParams {
  provider: ProviderId;
  model: string;
  base: string;
  key: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxTokens: number;
  temperature?: number;
}

// ---- OpenAI-compatible
function toOpenAIMessages(msgs: ChatMessage[]): any[] {
  const out: any[] = [];
  let pendingImgs: any[] = [];
  const flush = () => {
    if (pendingImgs.length) {
      out.push({ role: 'user', content: [{ type: 'text', text: 'Imagens retornadas pela ferramenta:' }, ...pendingImgs] });
      pendingImgs = [];
    }
  };
  for (const m of msgs) {
    if (m.role !== 'tool') flush();
    if (m.role === 'system') {
      out.push({ role: 'system', content: textOf(m.content) });
    } else if (m.role === 'user') {
      const imgs = imagesOf(m.content);
      if (!imgs.length) {
        out.push({ role: 'user', content: textOf(m.content) });
      } else {
        const parts: any[] = [];
        for (const p of m.content) {
          if (p.type === 'text') { if (p.text) parts.push({ type: 'text', text: p.text }); }
          else parts.push({ type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } });
        }
        out.push({ role: 'user', content: parts });
      }
    } else if (m.role === 'assistant') {
      const msg: any = { role: 'assistant', content: textOf(m.content) || null };
      if (m.toolCalls?.length) {
        msg.tool_calls = m.toolCalls.map((c) => ({
          id: c.id, type: 'function',
          function: { name: c.name, arguments: JSON.stringify(c.arguments ?? {}) },
        }));
      }
      out.push(msg);
    } else if (m.role === 'tool') {
      out.push({ role: 'tool', tool_call_id: m.toolCallId ?? '', content: textOf(m.content) || '(sem saida)' });
      for (const p of imagesOf(m.content)) {
        pendingImgs.push({ type: 'image_url', image_url: { url: `data:${p.mediaType};base64,${p.data}` } });
      }
    }
  }
  flush();
  return out;
}

function buildOpenAI(p: ChatParams): BuiltReq {
  const body: any = {
    model: p.model,
    messages: toOpenAIMessages(p.messages),
    stream: true,
  };
  if (p.provider === 'openai') body.max_completion_tokens = p.maxTokens;
  else body.max_tokens = p.maxTokens;
  if (p.provider !== 'custom') body.stream_options = { include_usage: true };
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.tools?.length) {
    body.tools = p.tools.map((t) => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters },
    }));
  }
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (p.key !== NO_KEY) headers['Authorization'] = `Bearer ${p.key}`;
  if (p.provider === 'openrouter') headers['X-Title'] = 'SIGOP';
  // OpenCode (Zen/Go) exige um id de sessao para rotear a requisicao.
  if (/(^|\.)opencode\.ai(\/|$)/.test(p.base.replace(/^https?:\/\//, ''))) headers['x-opencode-session'] = `sigop-${crypto.randomUUID()}`;
  return { url: `${p.base}/chat/completions`, headers, body: JSON.stringify(body) };
}

async function* parseOpenAI(res: Response): AsyncGenerator<StreamEvent> {
  const calls = new Map<number, { id: string; name: string; args: string }>();
  let finish: string | undefined;
  let usage: Usage | undefined;
  for await (const data of sseData(res)) {
    if (data === '[DONE]') break;
    const j = safeJson(data);
    if (!j) continue;
    if (j.error) {
      yield { type: 'error', message: `Erro do provedor: ${j.error.message ?? JSON.stringify(j.error)}`.slice(0, 600) };
      return;
    }
    if (j.usage) usage = { inputTokens: j.usage.prompt_tokens, outputTokens: j.usage.completion_tokens };
    const ch = j.choices?.[0];
    if (!ch) continue;
    const d = ch.delta ?? {};
    if (typeof d.content === 'string' && d.content) yield { type: 'text_delta', text: d.content };
    for (const tc of d.tool_calls ?? []) {
      const idx = typeof tc.index === 'number' ? tc.index : 0;
      let c = calls.get(idx);
      if (!c) { c = { id: '', name: '', args: '' }; calls.set(idx, c); }
      if (tc.id && !c.id) c.id = tc.id;
      if (tc.function?.name && !c.name) c.name = tc.function.name;
      if (tc.function?.arguments) c.args += tc.function.arguments;
    }
    if (ch.finish_reason) finish = ch.finish_reason;
  }
  for (const [, c] of [...calls.entries()].sort((a, b) => a[0] - b[0])) {
    const args = c.args.trim() ? safeJson(c.args) : {};
    if (args === undefined || typeof args !== 'object' || args === null) {
      yield { type: 'error', message: `Argumentos invalidos na chamada da ferramenta "${c.name}".` };
      return;
    }
    yield { type: 'tool_call', call: { id: c.id || genId(), name: c.name, arguments: args } };
  }
  const stopReason = calls.size ? 'tool_use' : finish === 'length' ? 'max_tokens' :
    (finish === 'stop' || finish === undefined) ? 'end' : 'other';
  yield { type: 'done', stopReason, usage };
}

// ---- Google Gemini
function sanitizeGoogleSchema(s: any): any {
  if (Array.isArray(s)) return s.map(sanitizeGoogleSchema);
  if (s && typeof s === 'object') {
    const o: any = {};
    for (const [k, v] of Object.entries(s)) {
      if (['additionalProperties', '$schema', 'default', '$id', 'examples', 'title'].includes(k) && typeof v !== 'object') continue;
      if (k === 'additionalProperties' || k === '$schema') continue;
      o[k] = k === 'properties' && v && typeof v === 'object'
        ? Object.fromEntries(Object.entries(v as any).map(([pk, pv]) => [pk, sanitizeGoogleSchema(pv)]))
        : sanitizeGoogleSchema(v);
    }
    return o;
  }
  return s;
}

function toGoogleContents(msgs: ChatMessage[]): { system?: any; contents: any[] } {
  const sys: string[] = [];
  const contents: any[] = [];
  const nameById = new Map<string, string>();
  const push = (role: 'user' | 'model', parts: any[]) => {
    if (!parts.length) return;
    const last = contents[contents.length - 1];
    if (last && last.role === role) last.parts.push(...parts);
    else contents.push({ role, parts });
  };
  const inline = (p: Extract<ContentPart, { type: 'image' }>) => ({ inlineData: { mimeType: p.mediaType, data: p.data } });
  for (const m of msgs) {
    if (m.role === 'system') {
      const t = textOf(m.content);
      if (t) sys.push(t);
    } else if (m.role === 'user') {
      const parts: any[] = [];
      for (const p of m.content) {
        if (p.type === 'text') { if (p.text) parts.push({ text: p.text }); } else parts.push(inline(p));
      }
      push('user', parts);
    } else if (m.role === 'assistant') {
      const parts: any[] = [];
      const t = textOf(m.content);
      if (t) parts.push({ text: t });
      for (const c of m.toolCalls ?? []) {
        nameById.set(c.id, c.name);
        parts.push({ functionCall: { name: c.name, args: c.arguments ?? {} } });
      }
      push('model', parts);
    } else if (m.role === 'tool') {
      const name = m.toolName ?? nameById.get(m.toolCallId ?? '') ?? 'tool';
      const parts: any[] = [{ functionResponse: { name, response: { output: textOf(m.content) || '(sem saida)' } } }];
      for (const p of imagesOf(m.content)) parts.push(inline(p));
      push('user', parts);
    }
  }
  return { system: sys.length ? { parts: [{ text: sys.join('\n\n') }] } : undefined, contents };
}

function buildGoogle(p: ChatParams): BuiltReq {
  const { system, contents } = toGoogleContents(p.messages);
  const body: any = {
    contents,
    generationConfig: { maxOutputTokens: p.maxTokens },
  };
  if (p.temperature !== undefined) body.generationConfig.temperature = p.temperature;
  if (system) body.systemInstruction = system;
  if (p.tools?.length) {
    body.tools = [{
      functionDeclarations: p.tools.map((t) => ({
        name: t.name, description: t.description, parameters: sanitizeGoogleSchema(t.parameters),
      })),
    }];
  }
  const model = p.model.replace(/^models\//, '');
  return {
    url: `${p.base}/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': p.key },
    body: JSON.stringify(body),
  };
}

async function* parseGoogle(res: Response): AsyncGenerator<StreamEvent> {
  let finish: string | undefined;
  let usage: Usage | undefined;
  let hasCalls = false;
  for await (const data of sseData(res)) {
    const j = safeJson(data);
    if (!j) continue;
    if (j.error) {
      yield { type: 'error', message: `Erro do provedor: ${j.error.message ?? JSON.stringify(j.error)}`.slice(0, 600) };
      return;
    }
    if (j.promptFeedback?.blockReason) {
      yield { type: 'error', message: `Prompt bloqueado pelo provedor (${j.promptFeedback.blockReason}).` };
      return;
    }
    if (j.usageMetadata) {
      usage = { inputTokens: j.usageMetadata.promptTokenCount, outputTokens: j.usageMetadata.candidatesTokenCount };
    }
    const cand = j.candidates?.[0];
    if (!cand) continue;
    for (const part of cand.content?.parts ?? []) {
      if (part.thought) continue;
      if (typeof part.text === 'string' && part.text) yield { type: 'text_delta', text: part.text };
      if (part.functionCall) {
        hasCalls = true;
        yield {
          type: 'tool_call',
          call: { id: genId(), name: part.functionCall.name, arguments: part.functionCall.args ?? {} },
        };
      }
    }
    if (cand.finishReason) finish = cand.finishReason;
  }
  const stopReason = hasCalls ? 'tool_use' : finish === 'MAX_TOKENS' ? 'max_tokens' :
    (finish === 'STOP' || finish === undefined) ? 'end' : 'other';
  if (!hasCalls && finish && !['STOP', 'MAX_TOKENS'].includes(finish)) {
    yield { type: 'error', message: `Resposta interrompida pelo provedor (${finish}).` };
    return;
  }
  yield { type: 'done', stopReason, usage };
}

// ---- Anthropic
function toAnthropic(msgs: ChatMessage[]): { system?: string; messages: any[] } {
  const sys: string[] = [];
  const out: any[] = [];
  const push = (role: 'user' | 'assistant', blocks: any[]) => {
    if (!blocks.length) return;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else out.push({ role, content: blocks });
  };
  const img = (p: Extract<ContentPart, { type: 'image' }>) => ({
    type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.data },
  });
  for (const m of msgs) {
    if (m.role === 'system') {
      const t = textOf(m.content);
      if (t) sys.push(t);
    } else if (m.role === 'user') {
      const blocks: any[] = [];
      for (const p of m.content) {
        if (p.type === 'text') { if (p.text) blocks.push({ type: 'text', text: p.text }); } else blocks.push(img(p));
      }
      push('user', blocks);
    } else if (m.role === 'assistant') {
      const blocks: any[] = [];
      const t = textOf(m.content);
      if (t) blocks.push({ type: 'text', text: t });
      for (const c of m.toolCalls ?? []) {
        blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments ?? {} });
      }
      push('assistant', blocks);
    } else if (m.role === 'tool') {
      const inner: any[] = [];
      const t = textOf(m.content);
      inner.push({ type: 'text', text: t || '(sem saida)' });
      for (const p of imagesOf(m.content)) inner.push(img(p));
      // tool_result deve vir antes de qualquer outro bloco no mesmo turno user
      const last = out[out.length - 1];
      const block = { type: 'tool_result', tool_use_id: m.toolCallId ?? '', content: inner };
      if (last && last.role === 'user' && last.content.every((b: any) => b.type === 'tool_result')) last.content.push(block);
      else push('user', [block]);
    }
  }
  return { system: sys.length ? sys.join('\n\n') : undefined, messages: out };
}

function buildAnthropic(p: ChatParams): BuiltReq {
  const { system, messages } = toAnthropic(p.messages);
  const body: any = { model: p.model, max_tokens: p.maxTokens, messages, stream: true };
  if (system) body.system = system;
  if (p.temperature !== undefined) body.temperature = p.temperature;
  if (p.tools?.length) {
    body.tools = p.tools.map((t) => ({
      name: t.name, description: t.description, input_schema: t.parameters,
    }));
  }
  return {
    url: `${p.base}/messages`,
    headers: { 'Content-Type': 'application/json', 'x-api-key': p.key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify(body),
  };
}

async function* parseAnthropic(res: Response): AsyncGenerator<StreamEvent> {
  const blocks = new Map<number, { id: string; name: string; json: string; tool: boolean }>();
  let stop: string | undefined;
  let usage: Usage = {};
  let hasCalls = false;
  for await (const data of sseData(res)) {
    const j = safeJson(data);
    if (!j) continue;
    switch (j.type) {
      case 'message_start':
        usage.inputTokens = j.message?.usage?.input_tokens;
        break;
      case 'content_block_start': {
        const cb = j.content_block ?? {};
        blocks.set(j.index, { id: cb.id ?? '', name: cb.name ?? '', json: '', tool: cb.type === 'tool_use' });
        break;
      }
      case 'content_block_delta': {
        const d = j.delta ?? {};
        if (d.type === 'text_delta' && d.text) yield { type: 'text_delta', text: d.text };
        else if (d.type === 'input_json_delta') {
          const b = blocks.get(j.index);
          if (b) b.json += d.partial_json ?? '';
        }
        break;
      }
      case 'content_block_stop': {
        const b = blocks.get(j.index);
        if (b?.tool) {
          const args = b.json.trim() ? safeJson(b.json) : {};
          if (args === undefined || typeof args !== 'object' || args === null) {
            yield { type: 'error', message: `Argumentos invalidos na chamada da ferramenta "${b.name}".` };
            return;
          }
          hasCalls = true;
          yield { type: 'tool_call', call: { id: b.id || genId(), name: b.name, arguments: args } };
        }
        blocks.delete(j.index);
        break;
      }
      case 'message_delta':
        if (j.delta?.stop_reason) stop = j.delta.stop_reason;
        if (j.usage?.output_tokens !== undefined) usage.outputTokens = j.usage.output_tokens;
        if (j.usage?.input_tokens !== undefined) usage.inputTokens = j.usage.input_tokens;
        break;
      case 'error':
        yield { type: 'error', message: `Erro do provedor: ${j.error?.message ?? 'desconhecido'}`.slice(0, 600) };
        return;
    }
  }
  const stopReason = hasCalls || stop === 'tool_use' ? 'tool_use' : stop === 'max_tokens' ? 'max_tokens' :
    (stop === 'end_turn' || stop === 'stop_sequence' || stop === undefined) ? 'end' : 'other';
  yield { type: 'done', stopReason, usage };
}

// ------------------------------------------------------------------ Execucao do chat (generator)
function buildRequest(format: ApiFormat, p: ChatParams): BuiltReq {
  return format === 'google' ? buildGoogle(p) : format === 'anthropic' ? buildAnthropic(p) : buildOpenAI(p);
}

async function* runChat(format: ApiFormat, p: ChatParams, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  try {
    const rq = buildRequest(format, p);
    const res = await fetch(rq.url, {
      method: 'POST', headers: rq.headers, body: rq.body, signal, redirect: 'error',
    });
    if (!res.ok) {
      yield { type: 'error', message: await providerError(res, p.key) };
      return;
    }
    const gen = format === 'google' ? parseGoogle(res) : format === 'anthropic' ? parseAnthropic(res) : parseOpenAI(res);
    yield* gen;
  } catch (e) {
    if (signal.aborted) return;
    yield { type: 'error', message: redact(`Falha ao contatar o provedor: ${(e as Error).message}`, p.key) };
  }
}

// ------------------------------------------------------------------ Modelos
const OPENAI_NON_CHAT = /embedding|whisper|tts|dall-e|moderation|davinci|babbage|transcribe|realtime|audio|image|search-preview/i;
const VISION_RE = /gpt-4o|gpt-4\.1|gpt-4-turbo|gpt-4-vision|gpt-5|chatgpt-4o|(^|[/-])o[134](-|$)|vision|(^|[-_/])vl([-_:]|$)|llava|pixtral|gemini|claude|omni|llama-?3\.2-.*(11|90)b|llama-?4|qwen.*vl|minicpm-v|gemma-?3/i;

async function listModels(format: ApiFormat, provider: ProviderId, base: string, key: string, signal: AbortSignal): Promise<ModelInfo[]> {
  let url: string;
  const headers: Record<string, string> = {};
  if (format === 'google') { url = `${base}/models?pageSize=1000`; headers['x-goog-api-key'] = key; }
  else if (format === 'anthropic') {
    url = `${base}/models?limit=1000`; headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01';
  } else {
    url = `${base}/models`;
    if (key !== NO_KEY) headers['Authorization'] = `Bearer ${key}`;
  }
  const res = await fetch(url, { headers, signal, redirect: 'error' });
  if (!res.ok) throw new HttpError(502, await providerError(res, key));
  const j = await res.json().catch(() => ({}));

  if (format === 'google') {
    return (j.models ?? [])
      .filter((m: any) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m: any): ModelInfo => {
        const id = String(m.name ?? '').replace(/^models\//, '');
        return { id, name: m.displayName, contextLength: m.inputTokenLimit, vision: /gemini/i.test(id) };
      });
  }
  if (format === 'anthropic') {
    return (j.data ?? []).map((m: any): ModelInfo => ({ id: m.id, name: m.display_name, vision: true }));
  }
  let list: any[] = j.data ?? j.models ?? [];
  if (provider === 'openai') list = list.filter((m) => !OPENAI_NON_CHAT.test(String(m.id)));
  return list.map((m: any): ModelInfo => {
    const id = String(m.id ?? m.name ?? m.model ?? '');
    // Formatos: OpenRouter (architecture.input_modalities) e OpenCode (modalities.input, ex.: 'image/png').
    const mods: string[] | undefined = m.architecture?.input_modalities ?? m.modalities?.input;
    const vision = Array.isArray(mods) ? mods.some((x) => String(x).startsWith('image')) : (provider === 'deepseek' ? false : VISION_RE.test(id));
    return { id, name: m.name && m.name !== id ? m.name : undefined, vision, contextLength: m.context_length ?? m.limit?.context };
  }).filter((m) => m.id);
}

// ------------------------------------------------------------------ Handler
// deno-lint-ignore no-explicit-any
const admin: any = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  { auth: { persistSession: false, autoRefreshToken: false } },
);

function getSecret(): string {
  const s = Deno.env.get('AI_KEY_SECRET');
  if (!s || s.length < 16) throw new HttpError(500, 'Servidor nao configurado (AI_KEY_SECRET ausente).');
  return s;
}

function assertProvider(p: unknown): ProviderId {
  if (typeof p !== 'string' || !(p in PROVIDERS)) throw new HttpError(400, 'Provedor invalido.');
  return p as ProviderId;
}

async function authenticate(req: Request): Promise<string> {
  const h = req.headers.get('Authorization') ?? '';
  const token = h.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'Nao autenticado.');
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, 'Sessao invalida ou expirada.');
  return data.user.id as string;
}

async function loadCreds(userId: string, provider: ProviderId, reqBase?: string) {
  const { data: key, error } = await admin.rpc('ai_get_key', {
    p_user: userId, p_provider: provider, p_secret: getSecret(),
  });
  if (error) { console.error('ai_get_key failed', error.code); throw new HttpError(500, 'Falha ao ler a chave.'); }
  if (!key) throw new HttpError(400, `Nenhuma API key configurada para "${provider}".`);
  let base = PROVIDERS[provider].baseUrl;
  if (provider === 'custom') {
    const { data: row } = await admin.from('user_ai_keys').select('base_url')
      .eq('user_id', userId).eq('provider', provider).maybeSingle();
    const raw = row?.base_url || reqBase;
    if (!raw) throw new HttpError(400, 'URL base nao informada para provedor custom.');
    base = await validateCustomUrl(raw);
  }
  return { key: key as string, base, format: PROVIDERS[provider].format };
}

function sseResponse(events: AsyncGenerator<StreamEvent>, abort: AbortController): Response {
  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (ev: StreamEvent) => controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
      let terminal = false;
      try {
        for await (const ev of events) {
          send(ev);
          if (ev.type === 'done' || ev.type === 'error') { terminal = true; break; }
        }
        if (!terminal && !abort.signal.aborted) send({ type: 'done', stopReason: 'other' });
      } catch (e) {
        try { send({ type: 'error', message: 'Erro interno no proxy de IA.' }); } catch { /* fechado */ }
        console.error('chat stream error', (e as Error).name);
      }
      try { controller.close(); } catch { /* ja fechado */ }
    },
    cancel() { abort.abort(); },
  });
  return new Response(stream, {
    headers: { ...CORS, 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
  });
}

async function handle(req: Request): Promise<Response> {
  if (req.method !== 'POST') throw new HttpError(405, 'Metodo nao permitido.');
  const len = Number(req.headers.get('content-length') ?? '0');
  if (len > MAX_BODY_BYTES) throw new HttpError(413, 'Requisicao grande demais (max 25MB).');
  const userId = await authenticate(req);

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'Requisicao grande demais (max 25MB).');
  const body = safeJson(raw);
  if (!body || typeof body !== 'object') throw new HttpError(400, 'JSON invalido.');

  switch (body.action) {
    case 'key_status': {
      const { data, error } = await admin.from('user_ai_keys')
        .select('provider,key_hint,base_url,updated_at').eq('user_id', userId);
      if (error) throw new HttpError(500, 'Falha ao consultar chaves.');
      const rows = new Map<string, any>((data ?? []).map((r: any) => [r.provider, r]));
      const keys = (Object.keys(PROVIDERS) as ProviderId[]).map((provider) => {
        const r = rows.get(provider);
        return r
          ? { provider, configured: true, hint: r.key_hint || undefined, baseUrl: r.base_url || undefined, updatedAt: r.updated_at }
          : { provider, configured: false };
      });
      return json({ keys });
    }

    case 'save_key': {
      const provider = assertProvider(body.provider);
      let apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
      if (!apiKey && provider === 'custom') apiKey = NO_KEY;
      if (!apiKey) throw new HttpError(400, 'API key vazia.');
      if (apiKey.length > 512 || /\s/.test(apiKey)) throw new HttpError(400, 'API key invalida.');
      let baseUrl: string | null = null;
      if (provider === 'custom') {
        if (typeof body.baseUrl !== 'string' || !body.baseUrl) throw new HttpError(400, 'Informe a URL base.');
        baseUrl = await validateCustomUrl(body.baseUrl);
      }
      const { error } = await admin.rpc('ai_save_key', {
        p_user: userId, p_provider: provider, p_key: apiKey,
        p_hint: makeHint(apiKey), p_base_url: baseUrl, p_secret: getSecret(),
      });
      if (error) { console.error('ai_save_key failed', error.code); throw new HttpError(500, 'Falha ao salvar a chave.'); }
      return json({ ok: true });
    }

    case 'delete_key': {
      const provider = assertProvider(body.provider);
      const { error } = await admin.from('user_ai_keys').delete().eq('user_id', userId).eq('provider', provider);
      if (error) throw new HttpError(500, 'Falha ao remover a chave.');
      return json({ ok: true });
    }

    case 'models': {
      const provider = assertProvider(body.provider);
      const c = await loadCreds(userId, provider, body.baseUrl);
      const models = await listModels(c.format, provider, c.base, c.key, AbortSignal.timeout(30000));
      models.sort((a, b) => a.id.localeCompare(b.id));
      return json({ models });
    }

    case 'test': {
      const provider = assertProvider(body.provider);
      const c = await loadCreds(userId, provider, body.baseUrl);
      const signal = AbortSignal.timeout(30000);
      try {
        if (typeof body.model === 'string' && body.model) {
          const params: ChatParams = {
            provider, model: body.model, base: c.base, key: c.key, maxTokens: 16,
            messages: [{ role: 'user', content: [{ type: 'text', text: 'Responda apenas: ok' }] }],
          };
          for await (const ev of runChat(c.format, params, signal)) {
            if (ev.type === 'error') return json({ ok: false, message: ev.message });
            if (ev.type === 'done') break;
          }
          return json({ ok: true, message: 'Conexao e modelo funcionando.' });
        }
        const models = await listModels(c.format, provider, c.base, c.key, signal);
        return json({ ok: true, message: `Conexao ok (${models.length} modelos disponiveis).` });
      } catch (e) {
        return json({ ok: false, message: redact((e as Error).message, c.key) });
      }
    }

    case 'chat': {
      const provider = assertProvider(body.provider);
      if (typeof body.model !== 'string' || !body.model) throw new HttpError(400, 'Modelo nao informado.');
      if (!Array.isArray(body.messages) || !body.messages.length) throw new HttpError(400, 'Mensagens ausentes.');
      const c = await loadCreds(userId, provider, body.baseUrl);
      const maxTokens = Number.isFinite(body.maxTokens) && body.maxTokens > 0
        ? Math.min(Math.floor(body.maxTokens), 64000) : DEFAULT_MAX_TOKENS;
      const params: ChatParams = {
        provider, model: body.model, base: c.base, key: c.key,
        messages: body.messages as ChatMessage[],
        tools: Array.isArray(body.tools) ? body.tools : undefined,
        maxTokens,
        temperature: typeof body.temperature === 'number' ? body.temperature : undefined,
      };
      const abort = new AbortController();
      req.signal.addEventListener('abort', () => abort.abort());
      return sseResponse(runChat(c.format, params, abort.signal), abort);
    }

    default:
      throw new HttpError(400, 'Acao desconhecida.');
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { status: 200, headers: CORS });
  try {
    return await handle(req);
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error('ai-proxy unexpected error', (e as Error).name);
    return json({ error: 'Erro interno.' }, 500);
  }
});
