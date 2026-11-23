/**
 * SIGOP - Assistente IA (v2) - CONTRATO COMPARTILHADO
 * Todos os modulos de lib/ai, components/ai, pages e a Edge Function seguem estes tipos.
 * Nao altere assinaturas sem avisar quem coordena.
 */

// ---------------------------------------------------------------- Provedores
export type ProviderId = 'openrouter' | 'deepseek' | 'google' | 'anthropic' | 'openai' | 'custom';

/** Formato de API que o adaptador da Edge Function usa. */
export type ApiFormat = 'openai' | 'google' | 'anthropic';

export interface ProviderPreset {
  id: ProviderId;
  name: string;
  format: ApiFormat;
  baseUrl: string; // 'custom' => usuario informa
  keyHint: string; // ex.: "sk-or-..."
  docsUrl: string;
}

/** Funcoes (papeis) que podem ter um modelo diferente cada. */
export type AiFunctionKey = 'chat' | 'writer' | 'vision' | 'reviewer';

export interface ModelChoice {
  provider: ProviderId;
  model: string;
  /** So para provider 'custom'. */
  baseUrl?: string;
}

/** Linha de user_ai_settings.models (jsonb). */
export type FunctionModels = Partial<Record<AiFunctionKey, ModelChoice>>;

export interface UserAiSettings {
  models: FunctionModels;
  /** 'chat_only' | 'propose' | 'autonomous' */
  defaultMode: ChatMode;
  /** Usuario aceitou o aviso de privacidade (dados vao a terceiros). */
  privacyAccepted: boolean;
}

/** Status de key devolvido ao front. A key em si NUNCA volta ao navegador. */
export interface KeyStatus {
  provider: ProviderId;
  configured: boolean;
  /** Ex.: "sk-...a3f9" (so inicio/fim). */
  hint?: string;
  baseUrl?: string; // so custom
  updatedAt?: string;
}

export interface ModelInfo {
  id: string;
  name?: string;
  vision?: boolean;
  contextLength?: number;
}

// ---------------------------------------------------------------- Mensagens
export type ChatMode = 'chat_only' | 'propose' | 'autonomous';

export type ContentPart =
  | { type: 'text'; text: string }
  /** data = base64 SEM prefixo data:. attachmentId liga ao anexo original. */
  | { type: 'image'; attachmentId: string; mediaType: string; data: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, any>;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: ContentPart[];
  /** Presente em role 'assistant' quando o modelo chamou ferramentas. */
  toolCalls?: ToolCall[];
  /** Presente em role 'tool': id do ToolCall respondido. */
  toolCallId?: string;
  toolName?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema (type: 'object'). */
  parameters: Record<string, any>;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

// -------------------------------------------- Protocolo front <-> Edge Function
// Edge Function: POST {SUPABASE_URL}/functions/v1/ai-proxy
// Header Authorization: Bearer <JWT do usuario>. Body = ProxyRequest.

export type ProxyRequest =
  | {
      action: 'chat';
      provider: ProviderId;
      model: string;
      baseUrl?: string;
      messages: ChatMessage[];
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
    }
  | { action: 'models'; provider: ProviderId; baseUrl?: string }
  | { action: 'test'; provider: ProviderId; baseUrl?: string; model?: string }
  | { action: 'save_key'; provider: ProviderId; apiKey: string; baseUrl?: string }
  | { action: 'delete_key'; provider: ProviderId }
  | { action: 'key_status' };

/** action 'chat' responde SSE (text/event-stream), cada `data:` = um StreamEvent JSON. */
export type StreamEvent =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; call: ToolCall }
  | { type: 'done'; stopReason: 'end' | 'tool_use' | 'max_tokens' | 'other'; usage?: Usage }
  | { type: 'error'; message: string };

/** Demais actions respondem JSON: */
export interface ModelsResponse { models: ModelInfo[] }
export interface TestResponse { ok: boolean; message?: string }
export interface KeyStatusResponse { keys: KeyStatus[] }
export interface OkResponse { ok: true }
export interface ErrorResponse { error: string }

// ---------------------------------------------------------------- Documento
export interface DocPhotoItem {
  id: number;
  /** data URL (jpeg comprimido) como o Editor ja usa. */
  url: string;
  caption: string;
}

export interface DocSection {
  id: number;
  title: string;
  type: 'text' | 'photos';
  /** HTML simples (b, i, u, br, p, ul, li) como o Editor ja usa. */
  content: string;
  items: DocPhotoItem[];
}

export interface DocState {
  title: string;
  description: string;
  eventDate: string;
  typeName: string;
  sections: DocSection[];
}

/**
 * Ponte entre as ferramentas e o Editor. O Editor implementa e injeta.
 * Atualizacoes devem ser imutaveis (novo array/objetos).
 */
export interface DocumentBridge {
  getState(): DocState;
  /** Aplica mutacao pura sobre o estado atual. */
  update(mutator: (state: DocState) => DocState): void;
  /** true se o documento esta editavel (status draft). */
  isEditable(): boolean;
}

// ---------------------------------------------------------------- Anexos (fotos)
export interface Attachment {
  /** 'foto_1', 'foto_2'... unico na conversa. */
  id: string;
  name: string;
  /** Arquivo ORIGINAL, sem perda. */
  original: Blob;
  width: number;
  height: number;
  /** Versao redimensionada p/ IA (jpeg), base64 sem prefixo. */
  aiData: string;
  aiMediaType: string;
  /** miniatura data URL p/ UI. */
  thumbUrl: string;
}

// ---------------------------------------------------------------- Ferramentas / Propostas
export type ToolName =
  | 'listar_secoes'
  | 'ler_secao'
  | 'criar_secao'
  | 'editar_secao'
  | 'renomear_secao'
  | 'mover_secao'
  | 'apagar_secao'
  | 'editar_metadados'
  | 'ver_foto'
  | 'anexar_fotos_na_secao'
  | 'editar_legenda'
  | 'remover_foto';

export type ProposalStatus = 'pending' | 'applied' | 'rejected' | 'undone' | 'failed';

export interface Proposal {
  id: string;
  callId: string; // ToolCall.id
  tool: ToolName;
  args: Record<string, any>;
  /** Frase curta p/ UI: "Criar secao 'Conclusao'". */
  summary: string;
  destructive: boolean;
  status: ProposalStatus;
  /** Para diff na UI (texto/HTML). */
  before?: string;
  after?: string;
  error?: string;
}

/** Resultado de executar uma ferramenta (volta ao modelo como mensagem 'tool'). */
export interface ToolResult {
  ok: boolean;
  /** Texto/JSON-string enviado ao modelo. */
  output: string;
  /** Imagens a devolver ao modelo (ex.: ver_foto). */
  images?: Extract<ContentPart, { type: 'image' }>[];
}

export interface ToolContext {
  bridge: DocumentBridge;
  /** Anexos do chat por id. */
  getAttachment(id: string): Attachment | undefined;
  /** Comprime o ORIGINAL com o pipeline do Editor (800px, jpeg 0.6) -> data URL. */
  compressForDocument(original: Blob): Promise<string>;
}
