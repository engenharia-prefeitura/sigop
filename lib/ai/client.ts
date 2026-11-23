import { supabase } from '../supabase';
import type {
  ChatMessage,
  ChatMode,
  FunctionModels,
  KeyStatus,
  KeyStatusResponse,
  ModelInfo,
  ModelsResponse,
  ProviderId,
  ProxyRequest,
  StreamEvent,
  TestResponse,
  UserAiSettings,
} from './types';

const SUPABASE_URL = ((import.meta as any).env?.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
const ANON_KEY = ((import.meta as any).env?.VITE_SUPABASE_ANON_KEY || '').trim();
const PROXY_URL = `${SUPABASE_URL}/functions/v1/ai-proxy`;

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Sessão expirada. Faça login novamente.');
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
    apikey: ANON_KEY,
  };
}

async function errorFromResponse(res: Response): Promise<string> {
  let msg = `Erro ${res.status}`;
  try {
    const text = await res.text();
    try {
      const j = JSON.parse(text);
      msg = j.error || j.message || msg;
    } catch {
      if (text) msg = text.slice(0, 300);
    }
  } catch {
    /* ignore */
  }
  return msg;
}

async function callJson<T>(body: ProxyRequest, signal?: AbortSignal): Promise<T> {
  const res = await fetch(PROXY_URL, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error(await errorFromResponse(res));
  return (await res.json()) as T;
}

export async function keyStatus(): Promise<KeyStatus[]> {
  const r = await callJson<KeyStatusResponse>({ action: 'key_status' });
  return r.keys ?? [];
}

export async function saveKey(provider: ProviderId, apiKey: string, baseUrl?: string): Promise<void> {
  await callJson({ action: 'save_key', provider, apiKey, baseUrl });
}

export async function deleteKey(provider: ProviderId): Promise<void> {
  await callJson({ action: 'delete_key', provider });
}

export async function listModels(provider: ProviderId, baseUrl?: string): Promise<ModelInfo[]> {
  const r = await callJson<ModelsResponse>({ action: 'models', provider, baseUrl });
  return r.models ?? [];
}

export async function testConnection(provider: ProviderId, baseUrl?: string, model?: string): Promise<TestResponse> {
  try {
    return await callJson<TestResponse>({ action: 'test', provider, baseUrl, model });
  } catch (e: any) {
    return { ok: false, message: e?.message || 'Falha ao testar conexão.' };
  }
}

// ------------------------------------------------------------------ Streaming
export async function* streamChat(
  req: Extract<ProxyRequest, { action: 'chat' }>,
  signal?: AbortSignal
): AsyncGenerator<StreamEvent> {
  let res: Response;
  try {
    res = await fetch(PROXY_URL, {
      method: 'POST',
      headers: { ...(await authHeaders()), Accept: 'text/event-stream' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    yield { type: 'error', message: e?.message || 'Falha de rede.' };
    return;
  }
  if (!res.ok) {
    yield { type: 'error', message: await errorFromResponse(res) };
    return;
  }
  if (!res.body) {
    yield { type: 'error', message: 'Resposta sem corpo.' };
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let gotDone = false;

  const parseLine = (rawLine: string): StreamEvent | null => {
    const line = rawLine.replace(/\r$/, '');
    if (!line.startsWith('data:')) return null;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') return null;
    try {
      return JSON.parse(payload) as StreamEvent;
    } catch {
      return null;
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        const ev = parseLine(line);
        if (ev) {
          if (ev.type === 'done') gotDone = true;
          yield ev;
        }
      }
    }
    buffer += decoder.decode();
    const last = parseLine(buffer);
    if (last) {
      if (last.type === 'done') gotDone = true;
      yield last;
    }
    if (!gotDone) yield { type: 'done', stopReason: 'other' };
  } catch (e: any) {
    if (e?.name === 'AbortError') return;
    yield { type: 'error', message: e?.message || 'Conexão interrompida.' };
  } finally {
    try {
      reader.releaseLock();
    } catch {
      /* ignore */
    }
  }
}

// ------------------------------------------------------------------ Configuracoes
export const DEFAULT_USER_SETTINGS: UserAiSettings = {
  models: {},
  defaultMode: 'propose',
  privacyAccepted: false,
};

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user?.id;
  if (!id) throw new Error('Sessão expirada. Faça login novamente.');
  return id;
}

export async function loadUserSettings(): Promise<UserAiSettings> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('user_ai_settings')
    .select('models, default_mode, privacy_accepted')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { ...DEFAULT_USER_SETTINGS };
  return {
    models: (data.models || {}) as FunctionModels,
    defaultMode: (data.default_mode || 'propose') as ChatMode,
    privacyAccepted: !!data.privacy_accepted,
  };
}

export async function saveUserSettings(settings: UserAiSettings): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase.from('user_ai_settings').upsert(
    {
      user_id: userId,
      models: settings.models,
      default_mode: settings.defaultMode,
      privacy_accepted: settings.privacyAccepted,
    },
    { onConflict: 'user_id' }
  );
  if (error) throw new Error(error.message);
}

// ------------------------------------------------------------------ Conversas
export interface AiConversation {
  id: string;
  documentId: string | null;
  title: string;
  messages: ChatMessage[];
  updatedAt: string;
}

/** Remove dados de imagem (mantem attachmentId) antes de persistir. */
export function stripImagesForStorage(messages: ChatMessage[]): ChatMessage[] {
  return messages.map((m) => ({
    ...m,
    content: m.content.map((p) => (p.type === 'image' ? { ...p, data: '' } : p)),
  }));
}

function rowToConversation(r: any): AiConversation {
  return {
    id: r.id,
    documentId: r.document_id ?? null,
    title: r.title || 'Nova conversa',
    messages: (r.messages || []) as ChatMessage[],
    updatedAt: r.updated_at,
  };
}

export async function listConversations(documentId?: string | null): Promise<AiConversation[]> {
  let q = supabase
    .from('ai_conversations')
    .select('id, document_id, title, messages, updated_at')
    .order('updated_at', { ascending: false });
  if (documentId) q = q.eq('document_id', documentId);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data || []).map(rowToConversation);
}

export async function loadConversation(id: string): Promise<AiConversation | null> {
  const { data, error } = await supabase
    .from('ai_conversations')
    .select('id, document_id, title, messages, updated_at')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? rowToConversation(data) : null;
}

/** Cria (sem id) ou atualiza (com id). Retorna a conversa salva. */
export async function saveConversation(conv: {
  id?: string;
  documentId?: string | null;
  title: string;
  messages: ChatMessage[];
}): Promise<AiConversation> {
  const userId = await currentUserId();
  const row: Record<string, any> = {
    user_id: userId,
    document_id: conv.documentId ?? null,
    title: conv.title,
    messages: stripImagesForStorage(conv.messages),
    updated_at: new Date().toISOString(),
  };
  if (conv.id) row.id = conv.id;
  const { data, error } = await supabase
    .from('ai_conversations')
    .upsert(row)
    .select('id, document_id, title, messages, updated_at')
    .single();
  if (error) throw new Error(error.message);
  return rowToConversation(data);
}

export async function deleteConversation(id: string): Promise<void> {
  const { error } = await supabase.from('ai_conversations').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
