export type AiRole = 'system' | 'user' | 'assistant';

export interface AiChatMessage {
  role: AiRole;
  content: string;
  images?: string[];
}

export interface AiSettings {
  endpoint: string;
  model: string;
}

export interface AiKnowledgePack {
  name: string;
  version: string;
  updatedAt: string;
  prompts: string[];
  glossary: string[];
  references: string[];
  approvedExamples: string[];
}

const SETTINGS_KEY = 'sigop_ai_settings';
const KNOWLEDGE_KEY = 'sigop_ai_knowledge_pack';

export const DEFAULT_AI_SETTINGS: AiSettings = {
  endpoint: 'http://localhost:11435',
  model: 'qwen2.5vl:3b'
};

export const DEFAULT_KNOWLEDGE_PACK: AiKnowledgePack = {
  name: 'Conhecimento Local SIGOP',
  version: '1.0.0',
  updatedAt: new Date().toISOString(),
  prompts: [
    'Atue como assistente técnico para engenharia pública, perícias, laudos e relatórios fotográficos.',
    'Nunca afirme causa conclusiva apenas por foto. Use termos como indício, compatível com, hipótese provável e recomenda-se verificar.',
    'Sugira perguntas técnicas quando faltarem dados para concluir o laudo.',
    'Mantenha linguagem formal, objetiva e adequada a documentos técnicos.'
  ],
  glossary: [
    'Manifestação patológica: sintoma observável de falha, degradação ou anomalia construtiva.',
    'Fissura: abertura superficial ou passante de pequena espessura, exigindo avaliação de evolução e causa provável.',
    'Infiltração: presença ou passagem indesejada de água, exigindo verificação de origem, recorrência e danos associados.'
  ],
  references: [],
  approvedExamples: []
};

export const loadAiSettings = (): AiSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_AI_SETTINGS;
    const parsed = { ...DEFAULT_AI_SETTINGS, ...JSON.parse(raw) };
    if (parsed.endpoint === 'http://localhost:11434') {
      parsed.endpoint = DEFAULT_AI_SETTINGS.endpoint;
    }
    saveAiSettings(parsed);
    return parsed;
  } catch {
    return DEFAULT_AI_SETTINGS;
  }
};

export const saveAiSettings = (settings: AiSettings) => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};

export const loadKnowledgePack = (): AiKnowledgePack => {
  try {
    const raw = localStorage.getItem(KNOWLEDGE_KEY);
    if (!raw) return DEFAULT_KNOWLEDGE_PACK;
    return { ...DEFAULT_KNOWLEDGE_PACK, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_KNOWLEDGE_PACK;
  }
};

export const saveKnowledgePack = (pack: AiKnowledgePack) => {
  localStorage.setItem(KNOWLEDGE_KEY, JSON.stringify({ ...pack, updatedAt: new Date().toISOString() }));
};

export const exportKnowledgePack = () => {
  const pack = loadKnowledgePack();
  const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `sigop-ai-pack-${pack.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-${pack.version}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const importKnowledgePackFile = async (file: File): Promise<AiKnowledgePack> => {
  const text = await file.text();
  const parsed = JSON.parse(text);
  const pack: AiKnowledgePack = {
    ...DEFAULT_KNOWLEDGE_PACK,
    ...parsed,
    prompts: Array.isArray(parsed.prompts) ? parsed.prompts : [],
    glossary: Array.isArray(parsed.glossary) ? parsed.glossary : [],
    references: Array.isArray(parsed.references) ? parsed.references : [],
    approvedExamples: Array.isArray(parsed.approvedExamples) ? parsed.approvedExamples : []
  };
  saveKnowledgePack(pack);
  return pack;
};

export const addApprovedExample = (example: string) => {
  if (!example.trim()) return;
  const pack = loadKnowledgePack();
  const nextExamples = [example.trim(), ...pack.approvedExamples.filter(item => item.trim() !== example.trim())].slice(0, 80);
  saveKnowledgePack({ ...pack, approvedExamples: nextExamples });
};

export const stripDataUrlPrefix = (image: string) => image.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');

export const checkOllama = async (settings = loadAiSettings()) => {
  const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/tags`);
  if (!response.ok) throw new Error('Ollama local não respondeu.');
  return response.json();
};

export const pullModel = async (
  settings = loadAiSettings(),
  onProgress?: (message: string) => void
) => {
  const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: settings.model, stream: true })
  });

  if (!response.ok || !response.body) throw new Error('Não foi possível baixar o modelo.');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    lines.forEach((line) => {
      if (!line.trim()) return;
      try {
        const event = JSON.parse(line);
        const completed = event.completed && event.total
          ? ` (${Math.round((event.completed / event.total) * 100)}%)`
          : '';
        onProgress?.(`${event.status || 'Baixando'}${completed}`);
      } catch {
        onProgress?.(line);
      }
    });
  }
};

export const chatWithLocalAi = async (
  messages: AiChatMessage[],
  settings = loadAiSettings(),
  signal?: AbortSignal
): Promise<string> => {
  const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      model: settings.model,
      stream: false,
      messages,
      options: getModelOptions(settings.model)
    })
  });

  if (!response.ok) {
    const details = await response.text().catch(() => '');
    throw new Error(formatLocalAiError(details) || 'Falha ao conversar com a IA local.');
  }

  const data = await response.json();
  const text = normalizeAiResponse(extractAiResponseText(data));

  if (!text) {
    throw new Error('A IA local respondeu, mas nao enviou texto aproveitavel. Tente novamente com uma pergunta mais curta ou escolha outro modelo.');
  }

  if (isDegenerateResponse(text)) {
    throw new Error('A IA local gerou uma resposta repetitiva ou incompleta. Em computador muito fraco, tente uma foto por vez, reduza a pergunta ou selecione um modelo mais estavel.');
  }

  return text;
};

const getModelOptions = (model: string) => {
  if (model.startsWith('moondream')) {
    return {
      num_predict: 90,
      num_ctx: 1024,
      num_thread: 2,
      temperature: 0.1,
      repeat_penalty: 1.35,
      repeat_last_n: 64
    };
  }

  if (model.startsWith('gemma3')) {
    return {
      num_predict: 260,
      temperature: 0.2,
      repeat_penalty: 1.18,
      repeat_last_n: 128
    };
  }

  return {
    num_predict: 360,
    temperature: 0.2,
    repeat_penalty: 1.15,
    repeat_last_n: 128
  };
};

const extractContentText = (content: any): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map(item => {
        if (typeof item === 'string') return item;
        if (typeof item?.text === 'string') return item.text;
        if (typeof item?.content === 'string') return item.content;
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
};

const extractAiResponseText = (data: any): string => {
  return [
    extractContentText(data?.message?.content),
    extractContentText(data?.response),
    extractContentText(data?.content),
    extractContentText(data?.text),
    extractContentText(data?.output),
    extractContentText(data?.choices?.[0]?.message?.content),
    extractContentText(data?.choices?.[0]?.text)
  ].find(text => text.trim()) || '';
};

const normalizeAiResponse = (text: string) => text
  .replace(/\u0000/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{4,}/g, '\n\n')
  .trim();

const isDegenerateResponse = (text: string) => {
  const normalized = text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (/^(yes|no|sim|nao|ok)\.?$/i.test(normalized.trim())) return true;
  if (/\b([a-z0-9]{1,10})(?:[\s.,;:!?-]+\1){8,}\b/i.test(normalized)) return true;

  const words = normalized.match(/[a-z0-9]{1,20}/g) || [];
  if (words.length < 24) return false;

  const counts = words.reduce<Record<string, number>>((acc, word) => {
    acc[word] = (acc[word] || 0) + 1;
    return acc;
  }, {});
  const mostRepeated = Math.max(...Object.values(counts));
  return mostRepeated / words.length > 0.42;
};

const formatLocalAiError = (details: string) => {
  if (!details) return '';
  try {
    const parsed = JSON.parse(details);
    const rawError = String(parsed.error || details);
    const memoryMatch = rawError.match(/model requires more system memory \(([^)]+)\) than is available \(([^)]+)\)/i);
    if (memoryMatch) {
      return `Este modelo exige mais memoria livre (${memoryMatch[1]}) do que o computador tem disponivel agora (${memoryMatch[2]}). Escolha um modelo mais leve em Assistente IA ou feche programas pesados e tente novamente.`;
    }
    return rawError;
  } catch {
    return details;
  }
};

export const buildKnowledgeContext = (pack = loadKnowledgePack()) => {
  const blocks = [
    pack.prompts.length ? `PROMPTS PADRAO:\n${pack.prompts.map(item => `- ${item}`).join('\n')}` : '',
    pack.glossary.length ? `GLOSSARIO:\n${pack.glossary.map(item => `- ${item}`).join('\n')}` : '',
    pack.references.length ? `REFERENCIAS LOCAIS:\n${pack.references.slice(0, 20).map(item => `- ${item}`).join('\n')}` : '',
    pack.approvedExamples.length ? `EXEMPLOS APROVADOS:\n${pack.approvedExamples.slice(0, 8).map(item => `- ${item}`).join('\n')}` : ''
  ].filter(Boolean);

  return blocks.join('\n\n');
};
