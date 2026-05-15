import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addApprovedExample,
  buildKnowledgeContext,
  chatWithLocalAiDetailed,
  checkOllama,
  exportKnowledgePack,
  getTextModel,
  loadAiSettings,
  loadKnowledgePack,
  type AiRequestOptions,
  type AiUsageMetrics,
  type AiChatMessage
} from '../lib/localAi';

interface AIAssistantPanelProps {
  open: boolean;
  onClose: () => void;
  documentContext: {
    title: string;
    typeName: string;
    description: string;
    eventDate: string;
    sections: any[];
  };
  disabled?: boolean;
  onInsertSection: (title: string, content: string) => void;
  onReplaceSection: (sectionId: number, content: string) => void;
}

type AssistantAction =
  | { type: 'insert'; label: string; title: string }
  | { type: 'replace'; label: string; sectionId: number };

type SectionProposalStatus = 'pending' | 'accepted' | 'rejected';
type ProposalMode = 'replace' | 'insert' | 'mixed';

type SuggestionJob =
  | {
      type: 'replace';
      label: string;
      instruction: string;
      section: any;
    }
  | {
      type: 'insert';
      label: string;
      title: string;
      instruction: string;
    };

interface SectionProposal {
  id: string;
  type: 'replace' | 'insert';
  sectionId?: number;
  sectionTitle: string;
  content: string;
  status: SectionProposalStatus;
}

type ChatMessage = AiChatMessage & {
  id: string;
  actions?: AssistantAction[];
  applied?: boolean;
  proposals?: SectionProposal[];
  metrics?: AiUsageMetrics;
  streaming?: boolean;
  liveApproxTokens?: number;
};

interface StoredAiConversation {
  id: string;
  title: string;
  documentTitle: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

interface AiConversationStore {
  activeId: string;
  conversations: StoredAiConversation[];
}

interface FixedSectionTemplate {
  key: string;
  label: string;
  title: string;
  instruction: string;
}

const AI_CONVERSATIONS_KEY = 'sigop_ai_conversations_v1';
const AI_PANEL_WIDTH_KEY = 'sigop_ai_panel_width';
const AI_PANEL_MINIMIZED_KEY = 'sigop_ai_panel_minimized';
const DEFAULT_PANEL_WIDTH = 640;
const MIN_PANEL_WIDTH = 420;
const MAX_PANEL_WIDTH = 980;
const MAX_STORED_CONVERSATIONS = 30;

const SYSTEM_PROMPT = `
Voce e um assistente tecnico local do SIGOP para apoiar a elaboracao de documentos de engenharia publica, pareceres, laudos, relatorios e conclusoes.
Voce trabalha somente com texto. Nao analise imagens e nao afirme que viu fotos.
Use exclusivamente titulo, tipo, descricao, secoes textuais, legendas e mensagens do usuario.
Nao invente fatos, medidas, causas, gravidade, responsaveis, datas, normas ou conclusoes.
Quando faltar dado, diga exatamente qual dado falta e sugira pergunta objetiva ao tecnico.
Quando sugerir substituicao de secao, entregue texto pronto para colar, sem Markdown pesado, sem saudacao e sem explicacao longa.
Quando revisar, seja direto e proponha alteracoes nas secoes existentes.
So proponha nova secao quando o usuario pedir complementar, criar nova secao, adicionar secao ou quando a tarefa pedir parecer/relatorio/conclusao como nova secao.
`;

const REVIEW_INSTRUCTION = `Revise o documento atual por secoes.
Para cada secao textual que puder melhorar, gere uma proposta de substituicao com texto pronto.
Nao crie novas secoes nesta revisao.
Se uma secao nao tiver informacao suficiente, explique a lacuna no resumo e nao invente conteudo.
Use somente fatos existentes.
Nao diga que analisou imagens. Use legendas apenas como texto informado pelo usuario.`;

const CONCLUSION_INSTRUCTION = `Gere uma conclusao tecnica cautelosa para o documento em ate 2 paragrafos curtos.
Use somente fatos textuais existentes.
Se faltarem dados para concluir, escreva uma conclusao condicionada e indique a verificacao necessaria.`;

const IMPROVE_TEXT_INSTRUCTION = `Reescreva o conteudo textual do documento com linguagem tecnica formal.
Mantenha somente os fatos existentes, preserve incertezas e nao acrescente dados novos.
Entregue texto pronto para uso.`;

const OPINION_INSTRUCTION = `Elabore um parecer tecnico com base somente no texto do documento.
Estruture em: objeto, elementos considerados, analise tecnica, pendencias ou limitacoes, manifestacao tecnica e encaminhamento sugerido.
Nao invente fatos ausentes.`;

const REPORT_INSTRUCTION = `Organize o conteudo como relatorio tecnico formal.
Use as secoes existentes, legendas como texto informado e linguagem objetiva.
Nao analise imagens nem crie diagnostico visual.`;

const PENDING_INSTRUCTION = `Liste as pendencias de informacao que impedem um documento tecnico mais completo.
Agrupe por secao quando possivel e escreva perguntas objetivas para o tecnico responder.`;

const COMPLEMENT_INSTRUCTION = `Analise o documento e proponha apenas novas secoes complementares que realmente agreguem valor tecnico.
Nao substitua secoes existentes nesta tarefa.
Use somente fatos existentes e deixe claro quando uma nova secao depender de informacao faltante.`;

const FIXED_SECTION_TEMPLATES: FixedSectionTemplate[] = [
  {
    key: 'analise',
    label: 'Analise Tecnica',
    title: 'Analise Tecnica',
    instruction: 'Redija a secao Analise Tecnica com linguagem formal, objetiva e cautelosa, usando somente os fatos textuais existentes. Maximo 2 paragrafos.'
  },
  {
    key: 'manifestacao',
    label: 'Manifestacao Tecnica',
    title: 'Manifestacao Tecnica',
    instruction: 'Redija a secao Manifestacao Tecnica com base apenas nos fatos informados, sem inventar causa, gravidade, responsavel ou norma. Maximo 2 paragrafos.'
  },
  {
    key: 'encaminhamentos',
    label: 'Encaminhamentos',
    title: 'Encaminhamentos',
    instruction: 'Redija encaminhamentos sugeridos de forma cautelosa. Se nao houver dados suficientes para encaminhar, indique a verificacao necessaria sem inventar providencias.'
  },
  {
    key: 'conclusao',
    label: 'Conclusao',
    title: 'Conclusao',
    instruction: CONCLUSION_INSTRUCTION
  },
  {
    key: 'parecer',
    label: 'Parecer Tecnico',
    title: 'Parecer Tecnico',
    instruction: 'Redija um parecer tecnico sintetico em ate 3 paragrafos, com objeto, analise e manifestacao final no mesmo texto. Use somente fatos existentes.'
  },
  {
    key: 'relatorio',
    label: 'Relatorio Tecnico',
    title: 'Relatorio Tecnico',
    instruction: 'Redija uma sintese de relatorio tecnico em ate 3 paragrafos, organizando objeto, fatos relevantes e consideracoes finais. Use somente fatos existentes.'
  },
  {
    key: 'pendencias',
    label: 'Pendencias',
    title: 'Pendencias de Informacao',
    instruction: 'Liste pendencias de informacao que impedem um documento mais completo. Escreva perguntas objetivas para o tecnico responder, sem inventar fatos.'
  }
];

const getFixedSectionTemplate = (key: string) =>
  FIXED_SECTION_TEMPLATES.find(template => template.key === key) || FIXED_SECTION_TEMPLATES[0];

const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return repairMojibake(div.textContent || div.innerText || '');
};

const repairMojibake = (value: string) => {
  if (!/[ÃÂ]/.test(value)) return value;
  try {
    const encoded = Array.from(value)
      .map(char => {
        const code = char.charCodeAt(0);
        return code < 256 ? `%${code.toString(16).padStart(2, '0')}` : encodeURIComponent(char);
      })
      .join('');
    return decodeURIComponent(encoded);
  } catch {
    return value
      .replace(/Ã(?=s(?:\s|\d|h|$))/g, 'à')
      .replace(/Ã[\u00a0 ]/g, 'à')
      .replace(/Ã§/g, 'ç')
      .replace(/Ã£/g, 'ã')
      .replace(/Ãµ/g, 'õ')
      .replace(/Ã¡/g, 'á')
      .replace(/Ã©/g, 'é')
      .replace(/Ã­/g, 'í')
      .replace(/Ã³/g, 'ó')
      .replace(/Ãº/g, 'ú')
      .replace(/Ã¢/g, 'â')
      .replace(/Ãª/g, 'ê')
      .replace(/Ã´/g, 'ô')
      .replace(/Ã /g, 'à')
      .replace(/Ã‡/g, 'Ç')
      .replace(/Ãƒ/g, 'Ã')
      .replace(/Âº/g, 'º')
      .replace(/Âª/g, 'ª');
  }
};

const isGenericPhotoCaption = (caption: string, index: number) => {
  const normalized = caption.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  return !normalized
    || normalized === 'sem legenda'
    || normalized === `foto ${index + 1}`
    || normalized === `registro fotografico ${index + 1}`
    || /^foto\s*#?\s*\d+$/.test(normalized)
    || /^imagem\s*#?\s*\d+$/.test(normalized);
};

const toHtml = (text: string) => text
  .trim()
  .replace(/\n{3,}/g, '\n\n')
  .replace(/\n/g, '<br/>');

const makeId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const sanitizeMessagesForStorage = (items: ChatMessage[]) => items
  .slice(-80)
  .map(message => ({
    ...message,
    content: repairMojibake(String(message.content || '')),
    actions: message.actions?.map(action => ({
      ...action,
      label: repairMojibake(String(action.label || '')),
      ...(action.type === 'insert' ? { title: repairMojibake(String(action.title || 'Nova secao')) } : {})
    })),
    proposals: message.proposals?.map(proposal => ({
      ...proposal,
      sectionTitle: repairMojibake(String(proposal.sectionTitle || 'Secao')),
      content: repairMojibake(String(proposal.content || ''))
    })),
    streaming: false,
    liveApproxTokens: undefined
  }));

const conversationTitleFromMessages = (items: ChatMessage[], fallback: string) => {
  const firstUserMessage = items.find(message => message.role === 'user' && message.content.trim());
  return repairMojibake(firstUserMessage?.content || fallback || 'Nova conversa').slice(0, 64);
};

const createStoredConversation = (documentTitle = ''): StoredAiConversation => {
  const now = new Date().toISOString();
  return {
    id: makeId(),
    title: documentTitle ? `Conversa - ${repairMojibake(documentTitle).slice(0, 42)}` : 'Nova conversa',
    documentTitle: repairMojibake(documentTitle || ''),
    createdAt: now,
    updatedAt: now,
    messages: []
  };
};

const loadConversationStore = (): AiConversationStore => {
  try {
    const raw = localStorage.getItem(AI_CONVERSATIONS_KEY);
    if (!raw) return { activeId: '', conversations: [] };
    const parsed = JSON.parse(raw);
    const conversations = Array.isArray(parsed?.conversations)
      ? parsed.conversations.map((conversation: any) => ({
        id: String(conversation.id || makeId()),
        title: repairMojibake(String(conversation.title || 'Nova conversa')),
        documentTitle: repairMojibake(String(conversation.documentTitle || '')),
        createdAt: String(conversation.createdAt || new Date().toISOString()),
        updatedAt: String(conversation.updatedAt || new Date().toISOString()),
        messages: sanitizeMessagesForStorage(Array.isArray(conversation.messages) ? conversation.messages : [])
      }))
      : [];
    return {
      activeId: String(parsed?.activeId || conversations[0]?.id || ''),
      conversations
    };
  } catch {
    return { activeId: '', conversations: [] };
  }
};

const saveConversationStore = (store: AiConversationStore) => {
  try {
    localStorage.setItem(AI_CONVERSATIONS_KEY, JSON.stringify(store));
  } catch {}
};

const loadPanelWidth = () => {
  try {
    return clamp(Number(localStorage.getItem(AI_PANEL_WIDTH_KEY)) || DEFAULT_PANEL_WIDTH, MIN_PANEL_WIDTH, MAX_PANEL_WIDTH);
  } catch {
    return DEFAULT_PANEL_WIDTH;
  }
};

const loadPanelMinimized = () => {
  try {
    return localStorage.getItem(AI_PANEL_MINIMIZED_KEY) === 'true';
  } catch {
    return false;
  }
};

const normalizeText = (value: string) => value
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const findSectionFromText = (text: string, sections: any[]) => {
  const normalized = normalizeText(text);
  const byId = normalized.match(/\bsecao\s+(\d+)\b/);
  if (byId) {
    const id = Number(byId[1]);
    const found = sections.find(section => Number(section.id) === id);
    if (found) return found;
  }

  return sections.find(section => {
    const title = normalizeText(String(section.title || ''));
    return title && normalized.includes(title);
  });
};

const looksLikeReplacementRequest = (text: string) => {
  const normalized = normalizeText(text);
  return /(substituir|substitua|trocar|troque|aplicar|aplique|reescrever|reescreva|refazer|refaca|revisar|revise|melhorar|melhore|corrigir|corrija)/.test(normalized)
    && /(secao|secoes|texto|conteudo|documento|todas|geral)/.test(normalized);
};

const looksLikeInsertRequest = (text: string) => {
  const normalized = normalizeText(text);
  return /(complementar|complemente|criar|crie|adicionar|adicione|incluir|inclua|nova secao|novas secoes|parecer|relatorio|conclusao)/.test(normalized)
    && /(secao|secoes|documento|parecer|relatorio|conclusao|complemento)/.test(normalized);
};

const isGeneralReviewRequest = (text: string) => {
  const normalized = normalizeText(text);
  return /(revisao geral|revisar documento|revisar tudo|todas as secoes|secoes existentes|documento inteiro|texto geral)/.test(normalized);
};

const looksLikeDocumentMutationRequest = (text: string) => {
  const normalized = normalizeText(text);
  return /(gerar|gere|criar|crie|elaborar|elabore|montar|monte|fazer|faca|produzir|produza|redigir|redija|organizar|organize|transformar|transforme|melhorar|melhore|revisar|revise|corrigir|corrija|complementar|complemente|alterar|altere|atualizar|atualize)/.test(normalized)
    && /(documento|secao|secoes|texto|laudo|relatorio|parecer|conclusao|analise|manifestacao|encaminhamento|vistoria)/.test(normalized);
};

const getField = (block: string, label: string) => {
  const labels = ['TIPO', 'ID', 'TITULO', 'TEXTO', 'RESUMO'];
  const nextLabels = labels.filter(item => item !== label).join('|');
  const match = block.match(new RegExp(`${label}\\s*:\\s*([\\s\\S]*?)(?=\\s*(?:${nextLabels})\\s*:|$)`, 'i'));
  return repairMojibake(match?.[1]?.trim() || '').replace(/\s+$/g, '');
};

const getTextField = (block: string) => {
  const match = block.match(/TEXTO\s*:\s*([\s\S]*?)(?=\s*RESUMO\s*:|$)/i);
  return repairMojibake(match?.[1]?.trim() || '');
};

const stripProposalSyntax = (text: string) => text
  .replace(/\[(?:\/)?(?:PROPOSTA_SECAO|PROPOSTA_REVISAO|PROPOSTA_NOVA_SECAO|PROPOSED SECOES|PROPOSTA SECAO)\]/gi, '')
  .trim();

const cleanupLooseSectionContent = (value: string) => repairMojibake(value)
  .replace(/\n?Tokens:\s*entrada[\s\S]*$/i, '')
  .replace(/^\s*[-*]\s*\*\*Descri[cç][aã]o:\*\*\s*/i, '')
  .replace(/^\s*[-*]\s*/gm, '')
  .replace(/\*\*/g, '')
  .replace(/#{1,6}/g, '')
  .replace(/[ \t]+\n/g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const parseLooseNumberedSections = (
  rawText: string,
  sections: any[],
  mode: ProposalMode | false
): SectionProposal[] => {
  const text = repairMojibake(rawText)
    .replace(/\r\n/g, '\n')
    .replace(/([^\n#])(#{1,6}\s*\d+\s*[\.\)-])/g, '$1\n$2')
    .replace(/([^\n#])(\d+\s*[\.\)-]\s*\*\*)/g, '$1\n$2');
  const normalized = normalizeText(text);
  const hasSectionCue = /(nova|novas|proposta|propostas|sugerida|sugeridas|substituir|substituicao|revisao|secoes|secao)/.test(normalized);
  if (!mode && !hasSectionCue) return [];

  const headingRegex = /(?:^|\n)\s*(?:#{1,6}\s*)?\d+\s*[\.\)-]\s*(?:\*\*)?\s*([^:\n*]{3,90})\s*:?\s*(?:\*\*)?\s*/g;
  const matches = Array.from(text.matchAll(headingRegex));
  if (matches.length < 1) return [];

  return matches.reduce<SectionProposal[]>((items, match, index) => {
    const title = repairMojibake(String(match[1] || '')).replace(/[*#]/g, '').trim();
    if (!title || /^(tarefa|resumo|observacao|observacoes)$/i.test(normalizeText(title))) return items;

    const start = (match.index || 0) + match[0].length;
    const end = index + 1 < matches.length ? (matches[index + 1].index || text.length) : text.length;
    const content = cleanupLooseSectionContent(text.slice(start, end));
    if (!content || normalizeText(content) === normalizeText(title)) return items;

    const target = sections.find(section => normalizeText(String(section.title || '')) === normalizeText(title));
    const shouldReplace = mode === 'replace' || (mode === 'mixed' && !!target);

    if (shouldReplace && target) {
      items.push({
        id: makeId(),
        type: 'replace',
        sectionId: Number(target.id),
        sectionTitle: String(target.title || title),
        content,
        status: 'pending'
      });
    } else if (mode !== 'replace') {
      items.push({
        id: makeId(),
        type: 'insert',
        sectionTitle: title,
        content,
        status: 'pending'
      });
    }

    return items;
  }, []);
};

const parseSectionProposals = (rawText: string, sections: any[], mode: ProposalMode | false = false) => {
  const proposals: SectionProposal[] = [];
  const normalizedRaw = repairMojibake(rawText);
  const blockRegex = /\[(PROPOSTA_SECAO|PROPOSTA_REVISAO|PROPOSTA_NOVA_SECAO)\]([\s\S]*?)\[\/\1\]/gi;
  const legacyBlocks = normalizedRaw
    .split(/\[(?:PROPOSED SECOES|PROPOSTA SECAO)\]/gi)
    .slice(1)
    .map(block => block.replace(/(?=\[(?:PROPOSED SECOES|PROPOSTA SECAO)\])[\s\S]*$/i, '').trim())
    .filter(Boolean);

  let displayText = normalizedRaw.replace(blockRegex, (_, tag, block) => {
    const titleText = getField(block, 'TITULO');
    const content = getTextField(block);
    const isInsert = String(tag).toUpperCase() === 'PROPOSTA_NOVA_SECAO';
    const idText = getField(block, 'ID').replace(/[^\d]/g, '');
    const id = Number(idText);
    const target = sections.find(section => Number(section.id) === id)
      || sections.find(section => normalizeText(String(section.title || '')) === normalizeText(titleText));

    if (isInsert && titleText && content) {
      proposals.push({
        id: makeId(),
        type: 'insert',
        sectionTitle: titleText,
        content,
        status: 'pending'
      });
    } else if (target && content) {
      proposals.push({
        id: makeId(),
        type: 'replace',
        sectionId: Number(target.id),
        sectionTitle: String(target.title || titleText || `Secao ${target.id}`),
        content,
        status: 'pending'
      });
    }

    return '';
  }).trim();

  legacyBlocks.forEach(block => {
    const idText = getField(block, 'ID').replace(/[^\d]/g, '');
    const titleText = getField(block, 'TITULO');
    const content = getTextField(block);
    const target = sections.find(section => Number(section.id) === Number(idText))
      || sections.find(section => normalizeText(String(section.title || '')) === normalizeText(titleText));
    if (target && content) {
      proposals.push({
        id: makeId(),
        type: 'replace',
        sectionId: Number(target.id),
        sectionTitle: String(target.title || titleText || `Secao ${target.id}`),
        content,
        status: 'pending'
      });
    }
  });

  if (legacyBlocks.length) {
    displayText = normalizedRaw.split(/\[(?:PROPOSED SECOES|PROPOSTA SECAO)\]/i)[0].trim();
  }

  if (!proposals.length) {
    proposals.push(...parseLooseNumberedSections(normalizedRaw, sections, mode));
    if (proposals.length) displayText = '';
  }

  displayText = stripProposalSyntax(displayText)
    .replace(/^RESUMO\s*:\s*/i, '')
    .trim();

  if (!displayText && proposals.length) {
    const replacements = proposals.filter(proposal => proposal.type === 'replace').length;
    const inserts = proposals.filter(proposal => proposal.type === 'insert').length;
    displayText = [
      replacements ? `${replacements} proposta(s) para substituir secoes existentes` : '',
      inserts ? `${inserts} proposta(s) de nova secao` : ''
    ].filter(Boolean).join(' e ') + '.';
  }

  return { displayText, proposals };
};

const formatUsageMetrics = (metrics?: AiUsageMetrics) => {
  if (!metrics) return '';
  const parts = [
    typeof metrics.promptTokens === 'number' ? `entrada ${metrics.promptTokens}` : '',
    typeof metrics.responseTokens === 'number' ? `saida ${metrics.responseTokens}` : '',
    typeof metrics.totalTokens === 'number' ? `total ${metrics.totalTokens}` : '',
    typeof metrics.totalDurationMs === 'number' ? `${Math.max(1, Math.round(metrics.totalDurationMs / 1000))}s` : '',
    metrics.doneReason === 'length' ? 'limite atingido' : ''
  ].filter(Boolean);
  return parts.length ? `Tokens: ${parts.join(' | ')}` : '';
};

const formatLiveUsage = (message: ChatMessage, elapsedSeconds: number) => {
  if (!message.streaming) return '';
  const approx = message.liveApproxTokens || Math.max(1, Math.ceil((message.content || '').length / 4));
  return message.liveApproxTokens
    ? `Gerando resposta... aprox. ${approx} tokens | ${elapsedSeconds}s`
    : `Aguardando o modelo local... ${elapsedSeconds}s`;
};

const getAssistantRequestOptions = (
  model: string,
  proposalMode: ProposalMode | false,
  replacementMode: boolean
): AiRequestOptions => {
  const isSmallModel = model.startsWith('qwen2.5:0.5b') || model.startsWith('smollm2:360m');
  if (proposalMode) {
    return {
      numPredict: isSmallModel ? 1500 : 2400,
      numCtx: isSmallModel ? 4096 : 6144
    };
  }
  if (replacementMode) {
    return {
      numPredict: isSmallModel ? 1000 : 1400,
      numCtx: isSmallModel ? 4096 : 6144
    };
  }
  return {
    numPredict: isSmallModel ? 1200 : 1800,
    numCtx: isSmallModel ? 4096 : 6144
  };
};

const buildDocumentText = (context: AIAssistantPanelProps['documentContext']) => {
  const sectionText = context.sections
    .filter(section => section.type !== 'photos')
    .map(section => `SECAO ${section.id} - ${section.title}:\n${htmlToPlainText(section.content || '') || '[sem texto]'}`)
    .join('\n\n');

  const photoItems = context.sections
    .filter(section => section.type === 'photos')
    .flatMap(section => section.items || []);

  const photoCaptions = photoItems
    .map((photo: any, index: number) => ({ caption: String(photo.caption || ''), index }))
    .filter(item => !isGenericPhotoCaption(item.caption, item.index))
    .map(item => `Foto ${item.index + 1}: ${item.caption.trim()}`)
    .join('\n');

  return [
    `Titulo: ${context.title || 'Sem titulo'}`,
    `Tipo: ${context.typeName || 'Geral'}`,
    `Descricao: ${context.description || 'Sem descricao'}`,
    `Data do evento: ${context.eventDate || 'Nao informada'}`,
    sectionText ? `SECOES TEXTUAIS:\n${sectionText}` : '',
    photoItems.length ? `Registros fotograficos anexados: ${photoItems.length} foto(s). A IA nao analisa imagens.` : '',
    photoCaptions ? `Legendas cadastradas pelo usuario:\n${photoCaptions}` : ''
  ].filter(Boolean).join('\n\n');
};

const buildCompactDocumentText = (
  context: AIAssistantPanelProps['documentContext'],
  currentSectionId?: number
) => {
  const textSections = context.sections.filter(section => section.type !== 'photos');
  const currentSection = textSections.find(section => Number(section.id) === Number(currentSectionId));
  const otherSections = textSections
    .filter(section => Number(section.id) !== Number(currentSectionId))
    .slice(0, 8)
    .map(section => {
      const text = htmlToPlainText(section.content || '').replace(/\s+/g, ' ').trim();
      return `- ${section.title}: ${text.slice(0, 420) || '[sem texto]'}`;
    })
    .join('\n');

  const photoCaptions = context.sections
    .filter(section => section.type === 'photos')
    .flatMap(section => section.items || [])
    .map((photo: any, index: number) => ({ caption: String(photo.caption || ''), index }))
    .filter(item => !isGenericPhotoCaption(item.caption, item.index))
    .slice(0, 8)
    .map(item => `Foto ${item.index + 1}: ${item.caption.trim().slice(0, 220)}`)
    .join('\n');

  return [
    `Titulo: ${context.title || 'Sem titulo'}`,
    `Tipo: ${context.typeName || 'Geral'}`,
    `Descricao: ${context.description || 'Sem descricao'}`,
    `Data do evento: ${context.eventDate || 'Nao informada'}`,
    currentSection ? `Secao atual: ${currentSection.title}` : '',
    otherSections ? `Outras secoes do documento:\n${otherSections}` : '',
    photoCaptions ? `Legendas informadas pelo usuario:\n${photoCaptions}` : ''
  ].filter(Boolean).join('\n\n').slice(0, 5200);
};

const cleanupSuggestionText = (value: string, title?: string) => {
  let text = repairMojibake(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n?Tokens:\s*entrada[\s\S]*$/i, '')
    .replace(/\[(?:\/)?(?:PROPOSTA_SECAO|PROPOSTA_REVISAO|PROPOSTA_NOVA_SECAO|PROPOSED SECOES|PROPOSTA SECAO)\]/gi, '')
    .replace(/^\s*(?:RESUMO|TITULO|TITULO DA SECAO|SECAO|TEXTO)\s*:\s*/gim, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (title) {
    const normalizedTitle = normalizeText(title);
    text = text
      .split('\n')
      .filter((line, index) => index > 0 || normalizeText(line.replace(/[:.-]+$/g, '')) !== normalizedTitle)
      .join('\n')
      .trim();
  }

  return text;
};

const countSuspiciousHeadings = (text: string) => {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  return lines.filter(line =>
    /^#{1,6}\s+/.test(line)
    || /^\d+\s*[\.\)-]\s+/.test(line)
    || /^(informacoes iniciais|registro de campo|analise tecnica|manifestacao tecnica|encaminhamentos|conclusao|parecer tecnico|registros fotograficos)\s*:?$/i.test(normalizeText(line))
  ).length;
};

const hasRepeatedBlocks = (text: string) => {
  const blocks = text
    .toLowerCase()
    .split(/\n{2,}|[.;]\s+/)
    .map(block => normalizeText(block))
    .filter(block => block.length > 50);
  return new Set(blocks).size < blocks.length;
};

const textSimilarity = (a: string, b: string) => {
  const wordsA = new Set(normalizeText(a).split(/\s+/).filter(word => word.length > 2));
  const wordsB = new Set(normalizeText(b).split(/\s+/).filter(word => word.length > 2));
  if (!wordsA.size || !wordsB.size) return 0;
  const shared = Array.from(wordsA).filter(word => wordsB.has(word)).length;
  return shared / Math.max(wordsA.size, wordsB.size);
};

const validateSuggestionText = (
  rawText: string,
  options: {
    title: string;
    currentText?: string;
    doneReason?: string;
  }
) => {
  if (options.doneReason === 'length') {
    return { ok: false as const, reason: 'resposta truncada pelo limite do modelo' };
  }

  const text = cleanupSuggestionText(rawText, options.title);
  const normalized = normalizeText(text);

  if (text.length < 40) return { ok: false as const, reason: 'texto muito curto' };
  if (text.length > 2600) return { ok: false as const, reason: 'texto longo demais' };
  if (/\b(Tokens|PROPOSTA_|TITULO\s*:|TEXTO\s*:)\b/i.test(text)) return { ok: false as const, reason: 'formato interno apareceu na resposta' };
  if (/nao\s+(ha|existe|possuo|tenho).{0,80}(informacao|dados|elementos)/i.test(normalized)) return { ok: false as const, reason: 'faltaram dados para gerar texto seguro' };
  if (countSuspiciousHeadings(text) > 1) return { ok: false as const, reason: 'a IA tentou gerar varias secoes em uma resposta' };
  if (hasRepeatedBlocks(text)) return { ok: false as const, reason: 'texto repetitivo' };
  if (options.currentText && textSimilarity(text, options.currentText) > 0.96) return { ok: false as const, reason: 'texto quase igual ao atual' };

  return { ok: true as const, text };
};

const findTemplateFromPrompt = (prompt: string) => {
  const normalized = normalizeText(prompt);
  return FIXED_SECTION_TEMPLATES.find(template => normalized.includes(template.key))
    || (/(analise|avaliacao)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'analise') : undefined)
    || (/(manifestacao|manifestar)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'manifestacao') : undefined)
    || (/(encaminhamento|providencia)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'encaminhamentos') : undefined)
    || (/(conclusao|concluir)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'conclusao') : undefined)
    || (/(parecer)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'parecer') : undefined)
    || (/(pendencia|pergunta|lacuna)/.test(normalized) ? FIXED_SECTION_TEMPLATES.find(template => template.key === 'pendencias') : undefined);
};

const formatChatHistory = (history: ChatMessage[]) => history
  .filter(message => message.role !== 'system' && message.content.trim())
  .slice(-8)
  .map(message => `${message.role === 'assistant' ? 'IA' : 'Usuario'}: ${message.content}`)
  .join('\n\n');

const AIAssistantPanel: React.FC<AIAssistantPanelProps> = ({
  open,
  onClose,
  documentContext,
  disabled,
  onInsertSection,
  onReplaceSection
}) => {
  const [status, setStatus] = useState<'checking' | 'online' | 'offline'>('checking');
  const [statusMessage, setStatusMessage] = useState('');
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversationStore, setConversationStore] = useState<AiConversationStore>(() => loadConversationStore());
  const [activeConversationId, setActiveConversationId] = useState(() => {
    const store = loadConversationStore();
    return store.activeId || store.conversations[0]?.id || '';
  });
  const [panelWidth, setPanelWidth] = useState(loadPanelWidth);
  const [minimized, setMinimized] = useState(loadPanelMinimized);
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<number | ''>('');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const hydratedConversationIdRef = useRef('');

  const settings = useMemo(() => loadAiSettings(), [open]);
  const knowledge = useMemo(() => loadKnowledgePack(), [open, messages.length]);
  const textSections = documentContext.sections.filter(section => section.type !== 'photos');
  const textModel = getTextModel(settings);
  const selectedSection = textSections.find(section => section.id === selectedSectionId);
  const hasStreamingMessage = messages.some(message => message.streaming);
  const activeConversation = conversationStore.conversations.find(conversation => conversation.id === activeConversationId);

  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages.length, loading]);

  useEffect(() => {
    if (!open) return;
    hydratedConversationIdRef.current = '';
    const stored = loadConversationStore();
    let active = stored.conversations.find(conversation => conversation.id === stored.activeId)
      || stored.conversations[0];

    if (!active) {
      active = createStoredConversation(documentContext.title);
      stored.conversations = [active];
      stored.activeId = active.id;
      saveConversationStore(stored);
    }

    setConversationStore(stored);
    setActiveConversationId(active.id);
    setMessages(sanitizeMessagesForStorage(active.messages || []));
  }, [open]);

  useEffect(() => {
    if (!open || !activeConversationId) return;
    if (hydratedConversationIdRef.current !== activeConversationId) {
      hydratedConversationIdRef.current = activeConversationId;
      return;
    }
    setConversationStore(current => {
      const now = new Date().toISOString();
      const sanitized = sanitizeMessagesForStorage(messages);
      const existing = current.conversations.find(conversation => conversation.id === activeConversationId);
      const updatedConversation: StoredAiConversation = {
        ...(existing || createStoredConversation(documentContext.title)),
        id: activeConversationId,
        title: conversationTitleFromMessages(sanitized, existing?.title || documentContext.title || 'Nova conversa'),
        documentTitle: existing?.documentTitle || repairMojibake(documentContext.title || ''),
        updatedAt: now,
        messages: sanitized
      };
      const conversations = [
        updatedConversation,
        ...current.conversations.filter(conversation => conversation.id !== activeConversationId)
      ].slice(0, MAX_STORED_CONVERSATIONS);
      const next = { activeId: activeConversationId, conversations };
      saveConversationStore(next);
      return next;
    });
  }, [messages, activeConversationId, open, documentContext.title]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const run = async () => {
      setStatus('checking');
      try {
        await checkOllama(settings);
        if (!cancelled) {
          setStatus('online');
          setStatusMessage(`IA textual conectada. Modelo: ${textModel}`);
        }
      } catch (err: any) {
        if (!cancelled) {
          setStatus('offline');
          setStatusMessage(err?.message || 'Ollama local nao encontrado. Configure em Assistente IA.');
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [open]);

  const buildMessages = (
    instruction: string,
    history: ChatMessage[] = [],
    targetSection?: any,
    replacementMode = false,
    proposalMode: ProposalMode | false = false
  ): AiChatMessage[] => {
    const isSmallModel = textModel.startsWith('qwen2.5:0.5b') || textModel.startsWith('smollm2:360m');
    const documentTextLimit = proposalMode
      ? (isSmallModel ? 3200 : 5600)
      : (isSmallModel ? 3800 : 6500);
    const documentText = buildDocumentText(documentContext).slice(0, documentTextLimit);
    const chatHistory = proposalMode ? '' : formatChatHistory(history);
    const sectionText = targetSection
      ? `SECAO ALVO PARA TRABALHAR:\nID: ${targetSection.id}\nTitulo: ${targetSection.title}\nTexto atual:\n${htmlToPlainText(targetSection.content || '') || '[sem texto]'}`
      : '';

    const proposalModeRule = proposalMode === 'replace'
      ? '- Proponha somente alteracoes em secoes existentes. Nao crie novas secoes.\n'
      : proposalMode === 'insert'
      ? '- Proponha somente novas secoes. Nao substitua secoes existentes.\n'
      : proposalMode === 'mixed'
      ? '- Pode propor substituicoes e novas secoes quando forem claramente necessarias.\n'
      : '';
    const proposalInstruction = proposalMode
      ? `TAREFA:\n${instruction}\n\nFORMATO OBRIGATORIO PARA O SIGOP CRIAR BOTOES:\nComece com RESUMO: uma frase curta.\n\nPara alterar uma secao existente, use um bloco por secao exatamente assim:\n[PROPOSTA_REVISAO]\nID: numero da secao existente\nTITULO: titulo da secao existente\nTEXTO:\ntexto final para substituir apenas esta secao\n[/PROPOSTA_REVISAO]\n\nPara criar uma nova secao, use um bloco exatamente assim:\n[PROPOSTA_NOVA_SECAO]\nTITULO: titulo da nova secao\nTEXTO:\ntexto final da nova secao\n[/PROPOSTA_NOVA_SECAO]\n\nREGRAS:\n${proposalModeRule}- Use apenas os fatos existentes no documento.\n- Nao copie o documento inteiro.\n- Nao repita o RESUMO.\n- Nao gere a mesma proposta mais de uma vez.\n- Cada TEXTO deve ter no maximo 2 paragrafos curtos.\n- Nao use listas numeradas de secoes fora dos blocos.\n- Nao peca para o usuario aplicar manualmente.\n- Se nao houver proposta segura, responda apenas o resumo explicando a lacuna.`
      : '';

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: buildKnowledgeContext(knowledge) || 'Sem pacote de conhecimento local adicional.' },
      { role: 'user', content: `CONTEXTO DO DOCUMENTO:\n${documentText}` },
      ...(sectionText ? [{ role: 'user' as const, content: sectionText }] : []),
      ...(chatHistory ? [{ role: 'user' as const, content: `CONVERSA RECENTE:\n${chatHistory}` }] : []),
      {
        role: 'user',
        content: proposalMode
          ? proposalInstruction
          : replacementMode
          ? `TAREFA:\n${instruction}\n\nResponda SOMENTE com o novo texto da secao, pronto para substituir a secao selecionada. Nao inclua titulo, justificativa, markdown ou avisos.`
          : `TAREFA:\n${instruction}\n\nResponda de forma objetiva e curta. Se a tarefa pedir alteracao no documento, informe que o SIGOP pode gerar botoes quando o pedido citar criar, substituir, revisar ou complementar secoes.`
      }
    ];
  };

  const pushMessage = (message: ChatMessage) => {
    setMessages(current => [...current, message]);
  };

  const runAssistant = async (
    instruction: string,
    options: {
      displayText?: string;
      targetSectionId?: number;
      replacementMode?: boolean;
      proposalMode?: ProposalMode | boolean;
      insertTitle?: string;
    } = {}
  ) => {
    const targetSection = textSections.find(section => section.id === options.targetSectionId);
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    const previousMessages = messages.slice(-8);
    pushMessage({
      id: makeId(),
      role: 'user',
      content: options.displayText || instruction
    });
    let assistantMessageId = '';

    try {
      const proposalMode = options.proposalMode === true ? 'replace' : options.proposalMode || false;
      const requestMessages = buildMessages(instruction, previousMessages, targetSection, !!options.replacementMode, proposalMode);
      const requestOptions = getAssistantRequestOptions(textModel, proposalMode, !!options.replacementMode);
      assistantMessageId = makeId();
      pushMessage({
        id: assistantMessageId,
        role: 'assistant',
        content: 'Estou preparando a resposta. Se o modelo local nao enviar texto em tempo real, eu mostro o resultado assim que terminar.',
        streaming: true,
        liveApproxTokens: 0
      });

      const response = await chatWithLocalAiDetailed(
        requestMessages,
        settings,
        controller.signal,
        textModel,
        update => {
          setMessages(current => current.map(message => (
            message.id === assistantMessageId
              ? {
                ...message,
                content: update.text || 'Recebendo resposta...',
                liveApproxTokens: update.approximateResponseTokens,
                streaming: true
              }
              : message
          )));
        },
        requestOptions
      );
      const actions: AssistantAction[] = [];

      let content = response.text;
      let proposals: SectionProposal[] = [];

      if (options.proposalMode) {
        const parsed = parseSectionProposals(response.text, textSections, proposalMode);
        content = parsed.displayText;
        proposals = parsed.proposals;
        const looseInsert = proposalMode && proposalMode !== 'replace'
          ? response.text.match(/TITULO\s*:\s*([^\n\r]+)\s*TEXTO\s*:\s*([\s\S]+)/i)
          : null;
        if (!proposals.length && looseInsert) {
          proposals = [{
            id: makeId(),
            type: 'insert',
            sectionTitle: repairMojibake(looseInsert[1]).trim() || options.insertTitle || 'Nova secao',
            content: repairMojibake(looseInsert[2]).replace(/\n*RESUMO\s*:[\s\S]*$/i, '').trim(),
            status: 'pending'
          }];
          content = `Preparei uma proposta de nova secao: "${proposals[0].sectionTitle}".`;
        }
        if (!proposals.length && options.insertTitle && response.text.trim()) {
          proposals = [{
            id: makeId(),
            type: 'insert',
            sectionTitle: options.insertTitle,
            content: repairMojibake(response.text),
            status: 'pending'
          }];
          content = `Preparei uma proposta de nova secao: "${options.insertTitle}".`;
        } else if (!proposals.length) {
          content = response.metrics.doneReason === 'length'
            ? 'A IA local atingiu o limite antes de gerar propostas clicaveis. A conversa foi salva; tente novamente com o modelo Qwen2.5 1.5B ou peca por uma secao especifica.'
            : 'A IA local respondeu fora do formato de propostas clicaveis. A conversa foi salva; tente novamente pedindo para revisar uma secao especifica ou use o modelo Qwen2.5 1.5B.';
        }
      } else if (options.replacementMode && targetSection) {
        proposals = [{
          id: makeId(),
          type: 'replace',
          sectionId: Number(targetSection.id),
          sectionTitle: String(targetSection.title || 'Secao selecionada'),
          content: repairMojibake(response.text),
          status: 'pending'
        }];
        content = `Preparei uma proposta para substituir "${targetSection.title}".`;
      } else if (options.insertTitle) {
        actions.push({ type: 'insert', label: 'Inserir como nova secao', title: options.insertTitle });
      }

      setMessages(current => current.map(message => (
        message.id === assistantMessageId
          ? {
            ...message,
            content,
            metrics: response.metrics,
            actions,
            proposals,
            streaming: false,
            liveApproxTokens: undefined
          }
          : message
      )));
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        setStatusMessage('Solicitacao cancelada.');
        if (assistantMessageId) {
          setMessages(current => current.map(message => (
            message.id === assistantMessageId
              ? { ...message, content: 'Solicitacao cancelada.', streaming: false, liveApproxTokens: undefined }
              : message
          )));
        } else {
          pushMessage({ id: makeId(), role: 'assistant', content: 'Solicitacao cancelada.' });
        }
      } else {
        const message = err.message || 'Falha ao acessar a IA local.';
        setStatusMessage(message);
        if (assistantMessageId) {
          setMessages(current => current.map(item => (
            item.id === assistantMessageId
              ? { ...item, content: message, streaming: false, liveApproxTokens: undefined }
              : item
          )));
        } else {
          pushMessage({ id: makeId(), role: 'assistant', content: message });
        }
        if (/modelo.*parou|runner.*parou|resource|recurso|memoria|memory|repetitiva|incompleta|formato/i.test(message)) {
          setStatus('online');
        } else {
          setStatus('offline');
        }
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const cancelRequest = () => {
    abortRef.current?.abort();
    setLoading(false);
  };

  const getSuggestionRequestOptions = (): AiRequestOptions => {
    const isSmallModel = textModel.startsWith('qwen2.5:0.5b') || textModel.startsWith('smollm2:360m');
    return {
      numPredict: isSmallModel ? 650 : 950,
      numCtx: isSmallModel ? 3072 : 4096
    };
  };

  const buildSuggestionMessages = (job: SuggestionJob): AiChatMessage[] => {
    const section = job.type === 'replace' ? job.section : undefined;
    const sectionText = section ? htmlToPlainText(section.content || '') : '';
    const title = job.type === 'replace' ? String(section?.title || job.label) : job.title;
    const localKnowledge = buildKnowledgeContext(knowledge).slice(0, 2400);

    return [
      {
        role: 'system',
        content: [
          'Voce e um redator tecnico local do SIGOP.',
          'Responda somente com o texto final da secao solicitada.',
          'Nao use markdown, titulo, numeracao, saudacao, explicacao, bloco especial ou pergunta final.',
          'Nao copie o documento inteiro. Nao crie outras secoes.',
          'Use somente fatos textuais existentes. Nao afirme que analisou imagens.'
        ].join('\n')
      },
      { role: 'system', content: localKnowledge || 'Sem pacote de conhecimento local adicional.' },
      { role: 'user', content: `CONTEXTO RESUMIDO DO DOCUMENTO:\n${buildCompactDocumentText(documentContext, section?.id)}` },
      ...(section ? [{
        role: 'user' as const,
        content: `SECAO A SUBSTITUIR:\nTitulo: ${title}\nTexto atual:\n${sectionText || '[sem texto]'}`
      }] : []),
      {
        role: 'user',
        content: [
          `TAREFA: ${job.instruction}`,
          `Titulo da secao que o SIGOP vai usar: ${title}`,
          'FORMATO: responda apenas o texto final dessa unica secao, em no maximo 2 paragrafos curtos, salvo quando a tarefa pedir lista de pendencias.'
        ].join('\n\n')
      }
    ];
  };

  const buildProposalFromJob = async (job: SuggestionJob, controller: AbortController) => {
    const response = await chatWithLocalAiDetailed(
      buildSuggestionMessages(job),
      settings,
      controller.signal,
      textModel,
      undefined,
      getSuggestionRequestOptions()
    );
    const title = job.type === 'replace' ? String(job.section?.title || job.label) : job.title;
    const currentText = job.type === 'replace' ? htmlToPlainText(job.section?.content || '') : '';
    const validation = validateSuggestionText(response.text, {
      title,
      currentText: job.type === 'replace' ? currentText : undefined,
      doneReason: response.metrics.doneReason
    });

    if (!validation.ok) {
      return {
        proposal: null,
        skipped: `${title}: ${validation.reason}`,
        metrics: response.metrics
      };
    }

    const proposal: SectionProposal = job.type === 'replace'
      ? {
        id: makeId(),
        type: 'replace',
        sectionId: Number(job.section.id),
        sectionTitle: title,
        content: validation.text,
        status: 'pending'
      }
      : {
        id: makeId(),
        type: 'insert',
        sectionTitle: title,
        content: validation.text,
        status: 'pending'
      };

    return { proposal, skipped: '', metrics: response.metrics };
  };

  const runSuggestionJobs = async (displayText: string, jobs: SuggestionJob[]) => {
    if (loading) return;

    const usableJobs = jobs.filter(job => {
      if (job.type === 'insert') return true;
      return htmlToPlainText(job.section?.content || '').trim().length >= 20;
    });

    pushMessage({ id: makeId(), role: 'user', content: displayText });

    if (!usableJobs.length) {
      pushMessage({
        id: makeId(),
        role: 'assistant',
        content: 'Nao encontrei secoes textuais com conteudo suficiente para gerar sugestoes seguras.'
      });
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    const assistantMessageId = makeId();
    setMessages(current => [...current, {
      id: assistantMessageId,
      role: 'assistant',
      content: `Gerando sugestoes controladas pelo SIGOP... 0/${usableJobs.length}`,
      proposals: []
    }]);

    const proposals: SectionProposal[] = [];
    const skipped: string[] = [];

    try {
      for (let index = 0; index < usableJobs.length; index += 1) {
        const job = usableJobs[index];
        if (controller.signal.aborted) throw new DOMException('Abortado', 'AbortError');

        setMessages(current => current.map(message => (
          message.id === assistantMessageId
            ? {
              ...message,
              content: `Gerando sugestoes controladas pelo SIGOP... ${index + 1}/${usableJobs.length}\nAtual: ${job.label}`,
              proposals: [...proposals]
            }
            : message
        )));

        const result = await buildProposalFromJob(job, controller);
        if (result.proposal) {
          proposals.push(result.proposal);
        } else if (result.skipped) {
          skipped.push(result.skipped);
        }

        setMessages(current => current.map(message => (
          message.id === assistantMessageId
            ? { ...message, proposals: [...proposals] }
            : message
        )));
      }

      const skippedText = skipped.length
        ? `\n\nIgnoradas por seguranca: ${skipped.slice(0, 5).join('; ')}${skipped.length > 5 ? '; ...' : ''}`
        : '';
      const content = proposals.length
        ? `Preparei ${proposals.length} sugestao(oes) com botoes criados pelo SIGOP.${skippedText}`
        : `A IA nao gerou texto aproveitavel para criar botoes seguros.${skippedText}`;

      setMessages(current => current.map(message => (
        message.id === assistantMessageId
          ? { ...message, content, proposals: [...proposals], streaming: false, liveApproxTokens: undefined }
          : message
      )));
    } catch (err: any) {
      const content = err?.name === 'AbortError'
        ? 'Geracao de sugestoes cancelada.'
        : (err?.message || 'Falha ao gerar sugestoes.');
      setMessages(current => current.map(message => (
        message.id === assistantMessageId
          ? { ...message, content, proposals: [...proposals], streaming: false, liveApproxTokens: undefined }
          : message
      )));
      if (err?.name !== 'AbortError' && !/modelo.*parou|runner.*parou|resource|recurso|memoria|memory|repetitiva|incompleta/i.test(content)) {
        setStatus('offline');
        setStatusMessage(content);
      }
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  };

  const runReplaceSectionSuggestion = (section: any, instruction?: string, label?: string) => {
    const sectionTitle = String(section?.title || 'Secao');
    runSuggestionJobs(label || `Melhorar a secao "${sectionTitle}"`, [{
      type: 'replace',
      label: sectionTitle,
      section,
      instruction: instruction || `Reescreva a secao "${sectionTitle}" com linguagem tecnica formal, mantendo somente os fatos existentes e deixando o texto pronto para substituir a secao atual.`
    }]);
  };

  const runReviewSections = (instruction?: string) => {
    const jobs: SuggestionJob[] = textSections.map(section => ({
      type: 'replace',
      label: String(section.title || 'Secao'),
      section,
      instruction: instruction
        ? `${instruction}\nAplique a tarefa somente a secao "${section.title}". Responda apenas com o novo texto dessa secao.`
        : `Reescreva a secao "${section.title}" com linguagem tecnica formal, objetiva e cautelosa. Preserve os fatos existentes e nao acrescente dados novos.`
    }));
    runSuggestionJobs('Revisar secoes do documento', jobs);
  };

  const runFixedSectionSuggestion = (template: FixedSectionTemplate, extraInstruction?: string) => {
    runSuggestionJobs(`Criar ${template.label}`, [{
      type: 'insert',
      label: template.label,
      title: template.title,
      instruction: extraInstruction || template.instruction
    }]);
  };

  const runComplementSuggestions = () => {
    const existingTitles = new Set(textSections.map(section => normalizeText(String(section.title || ''))));
    const jobs = FIXED_SECTION_TEMPLATES
      .filter(template => !existingTitles.has(normalizeText(template.title)))
      .filter(template => ['analise', 'manifestacao', 'encaminhamentos', 'conclusao'].includes(template.key))
      .slice(0, 4)
      .map<SuggestionJob>(template => ({
        type: 'insert',
        label: template.label,
        title: template.title,
        instruction: template.instruction
      }));

    runSuggestionJobs('Complementar documento com novas secoes', jobs);
  };

  const runPromptAsSuggestion = (prompt: string) => {
    const wantsReplacement = looksLikeReplacementRequest(prompt);
    const wantsInsert = looksLikeInsertRequest(prompt);

    if (isGeneralReviewRequest(prompt) || (wantsReplacement && !findSectionFromText(prompt, textSections) && !selectedSection)) {
      runReviewSections(prompt);
      return true;
    }

    if (wantsReplacement) {
      const target = findSectionFromText(prompt, textSections) || selectedSection;
      if (target) {
        runReplaceSectionSuggestion(target, prompt, prompt);
        return true;
      }
    }

    if (wantsInsert) {
      const template = findTemplateFromPrompt(prompt);
      if (template) {
        runFixedSectionSuggestion(template, prompt);
      } else {
        runSuggestionJobs(prompt, [{
          type: 'insert',
          label: 'Nova secao sugerida',
          title: 'Nova secao sugerida',
          instruction: `${prompt}\nCrie uma unica secao complementar. Responda somente com o texto final da secao.`
        }]);
      }
      return true;
    }

    if (looksLikeDocumentMutationRequest(prompt)) {
      if (/(criar|crie|adicionar|adicione|incluir|inclua|complementar|complemente)/.test(normalizeText(prompt))) {
        runComplementSuggestions();
      } else {
        runReviewSections(prompt);
      }
      return true;
    }

    return false;
  };

  const sendChat = async () => {
    if (!input.trim()) return;
    const prompt = input.trim();
    setInput('');
    if (runPromptAsSuggestion(prompt)) {
      return;
    }

    await runAssistant(prompt);
  };

  const applyAction = (message: ChatMessage, action: AssistantAction) => {
    if (!message.content.trim()) return;

    if (action.type === 'insert') {
      onInsertSection(action.title, message.content);
    } else {
      onReplaceSection(action.sectionId, toHtml(message.content));
    }

    addApprovedExample(message.content);
    setMessages(current => current.map(item => (
      item.id === message.id ? { ...item, applied: true } : item
    )));
    pushMessage({
      id: makeId(),
      role: 'assistant',
      content: action.type === 'insert' ? 'Inseri o texto como nova secao.' : 'Substitui a secao selecionada.'
    });
  };

  const setProposalStatus = (messageId: string, proposalIds: string[], status: SectionProposalStatus) => {
    setMessages(current => current.map(message => (
      message.id === messageId
        ? {
          ...message,
          proposals: message.proposals?.map(proposal => (
            proposalIds.includes(proposal.id) ? { ...proposal, status } : proposal
          ))
        }
        : message
    )));
  };

  const acceptProposal = (messageId: string, proposal: SectionProposal) => {
    if (proposal.type === 'insert') {
      onInsertSection(proposal.sectionTitle, toHtml(proposal.content));
    } else if (proposal.sectionId) {
      onReplaceSection(proposal.sectionId, toHtml(proposal.content));
    }
    addApprovedExample(proposal.content);
    setProposalStatus(messageId, [proposal.id], 'accepted');
  };

  const rejectProposal = (messageId: string, proposal: SectionProposal) => {
    setProposalStatus(messageId, [proposal.id], 'rejected');
  };

  const acceptAllProposals = (message: ChatMessage) => {
    const pending = message.proposals?.filter(proposal => proposal.status === 'pending') || [];
    pending.forEach(proposal => {
      if (proposal.type === 'insert') {
        onInsertSection(proposal.sectionTitle, toHtml(proposal.content));
      } else if (proposal.sectionId) {
        onReplaceSection(proposal.sectionId, toHtml(proposal.content));
      }
      addApprovedExample(proposal.content);
    });
    setProposalStatus(message.id, pending.map(proposal => proposal.id), 'accepted');
  };

  const rejectAllProposals = (message: ChatMessage) => {
    const pending = message.proposals?.filter(proposal => proposal.status === 'pending') || [];
    setProposalStatus(message.id, pending.map(proposal => proposal.id), 'rejected');
  };

  const improveSelectedSection = () => {
    if (!selectedSection) return;
    runReplaceSectionSuggestion(selectedSection);
  };

  const runInsertCommand = (label: string, instruction: string, title: string) => {
    runSuggestionJobs(label, [{
      type: 'insert',
      label,
      title,
      instruction
    }]);
  };

  const runFromOptions = (action: () => void) => {
    setOptionsOpen(false);
    action();
  };

  const switchConversation = (conversationId: string) => {
    const conversation = conversationStore.conversations.find(item => item.id === conversationId);
    if (!conversation) return;
    setActiveConversationId(conversation.id);
    setMessages(sanitizeMessagesForStorage(conversation.messages || []));
    const next = { ...conversationStore, activeId: conversation.id };
    setConversationStore(next);
    saveConversationStore(next);
  };

  const startNewConversation = () => {
    const conversation = createStoredConversation(documentContext.title);
    const next = {
      activeId: conversation.id,
      conversations: [conversation, ...conversationStore.conversations].slice(0, MAX_STORED_CONVERSATIONS)
    };
    setConversationStore(next);
    setActiveConversationId(conversation.id);
    setMessages([]);
    setInput('');
    saveConversationStore(next);
  };

  const setPanelMinimized = (value: boolean) => {
    setMinimized(value);
    try {
      localStorage.setItem(AI_PANEL_MINIMIZED_KEY, String(value));
    } catch {}
  };

  const startPanelResize = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const maxWidth = Math.min(MAX_PANEL_WIDTH, Math.max(MIN_PANEL_WIDTH, window.innerWidth));
    const handleMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = clamp(window.innerWidth - moveEvent.clientX, MIN_PANEL_WIDTH, maxWidth);
      setPanelWidth(nextWidth);
      try {
        localStorage.setItem(AI_PANEL_WIDTH_KEY, String(Math.round(nextWidth)));
      } catch {}
    };
    const stopResize = () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', stopResize);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'ew-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', stopResize);
  };

  if (!open) return null;

  if (minimized) {
    return (
      <div className="fixed bottom-4 right-4 z-[80] flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
        <div className="min-w-0">
          <p className="truncate text-sm font-black text-slate-900">Assistente IA</p>
          <p className="truncate text-[10px] font-bold uppercase text-slate-400">
            {activeConversation?.title || 'Conversa salva'}
          </p>
        </div>
        <button onClick={() => setPanelMinimized(false)} className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white">
          Abrir
        </button>
        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Fechar">
          <span className="material-symbols-outlined text-[18px]">close</span>
        </button>
      </div>
    );
  }

  return (
    <aside
      style={{ width: `min(100vw, ${panelWidth}px)` }}
      className="fixed right-0 top-0 z-[80] flex h-screen w-full flex-col border-l border-slate-200 bg-white shadow-2xl"
    >
      <div
        onMouseDown={startPanelResize}
        className="absolute left-0 top-0 z-10 h-full w-2 cursor-ew-resize bg-transparent hover:bg-primary/20"
        title="Arraste para ajustar a largura"
      />
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-base font-black text-slate-900">Assistente IA</h2>
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-black uppercase text-slate-500">texto</span>
          </div>
          <p className={`mt-0.5 truncate text-[11px] font-bold ${status === 'online' ? 'text-emerald-600' : status === 'checking' ? 'text-amber-600' : 'text-red-500'}`}>
            {statusMessage || 'Verificando IA local...'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            onClick={() => setOptionsOpen(value => !value)}
            className={`rounded-full p-2 ${optionsOpen ? 'bg-slate-900 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'}`}
            title="Opcoes do assistente"
            aria-expanded={optionsOpen}
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
          <button onClick={() => setPanelMinimized(true)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Minimizar">
            <span className="material-symbols-outlined text-[20px]">remove</span>
          </button>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Fechar">
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
      </div>

      {optionsOpen && (
        <div className="absolute right-4 top-[70px] z-20 flex max-h-[calc(100vh-5.75rem)] w-[min(430px,calc(100%-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase text-slate-900">Opcoes</p>
              <p className="truncate text-[10px] font-bold uppercase text-slate-400">{activeConversation?.title || 'Conversa atual'}</p>
            </div>
            <button onClick={() => setOptionsOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Fechar opcoes">
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>

          <div className="space-y-4 overflow-y-auto p-4">
            <section>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Conversa</label>
              <div className="flex gap-2">
                <select
                  value={activeConversationId}
                  onChange={event => switchConversation(event.target.value)}
                  disabled={loading}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold disabled:opacity-60"
                >
                  {conversationStore.conversations.map(conversation => (
                    <option key={conversation.id} value={conversation.id}>
                      {conversation.title} - {new Date(conversation.updatedAt).toLocaleDateString('pt-BR')}
                    </option>
                  ))}
                </select>
                <button
                  disabled={loading}
                  onClick={() => runFromOptions(startNewConversation)}
                  className="rounded-xl border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
                >
                  Nova
                </button>
              </div>
            </section>

            <section>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Secao alvo</label>
              <div className="flex gap-2">
                <select
                  value={selectedSectionId}
                  onChange={event => setSelectedSectionId(event.target.value ? Number(event.target.value) : '')}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                >
                  <option value="">Escolha uma secao para melhorar</option>
                  {textSections.map(section => (
                    <option key={section.id} value={section.id}>{section.title}</option>
                  ))}
                </select>
                <button
                  disabled={loading || status !== 'online' || disabled || !selectedSection}
                  onClick={() => runFromOptions(improveSelectedSection)}
                  className="rounded-xl bg-slate-900 px-3 py-2 text-[10px] font-black uppercase text-white disabled:opacity-50"
                >
                  Melhorar
                </button>
              </div>
            </section>

            <section>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Sugestoes do documento</label>
              <div className="grid grid-cols-2 gap-2">
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runReviewSections())} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Revisar
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runFixedSectionSuggestion(getFixedSectionTemplate('parecer')))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Parecer
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runFixedSectionSuggestion(getFixedSectionTemplate('relatorio')))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Relatorio
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runFixedSectionSuggestion(getFixedSectionTemplate('conclusao')))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Conclusao
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runFixedSectionSuggestion(getFixedSectionTemplate('pendencias')))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Pendencias
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(() => runReviewSections(IMPROVE_TEXT_INSTRUCTION))} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Texto geral
                </button>
                <button disabled={loading || status !== 'online'} onClick={() => runFromOptions(runComplementSuggestions)} className="col-span-2 rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
                  Complementar documento
                </button>
              </div>
            </section>

            <section>
              <label className="mb-1.5 block text-[10px] font-black uppercase tracking-wide text-slate-400">Conhecimento local</label>
              <button onClick={exportKnowledgePack} className="w-full rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary">
                Exportar conhecimento
              </button>
            </section>
          </div>
        </div>
      )}

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-4">
        {status !== 'online' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            A IA local precisa estar instalada e com o Ollama ativo.
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
            Descreva o que deseja no campo abaixo. Para comandos prontos, conversas salvas, secao alvo e conhecimento local, abra Opcoes no topo.
          </div>
        )}

        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-primary text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
              <div className="whitespace-pre-wrap">{message.content}</div>
              {message.role === 'assistant' && formatLiveUsage(message, elapsedSeconds) && (
                <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-bold uppercase text-blue-500">
                  {formatLiveUsage(message, elapsedSeconds)}
                </div>
              )}
              {message.role === 'assistant' && formatUsageMetrics(message.metrics) && (
                <div className="mt-3 border-t border-slate-100 pt-2 text-[10px] font-bold uppercase text-slate-400">
                  {formatUsageMetrics(message.metrics)}
                </div>
              )}
              {message.actions && message.actions.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
                  {message.actions.map((action, index) => (
                    <button
                      key={`${action.type}-${index}`}
                      disabled={disabled || message.applied}
                      onClick={() => applyAction(message, action)}
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      {message.applied ? 'Aplicado' : action.label}
                    </button>
                  ))}
                </div>
              )}
              {message.role === 'assistant' && message.proposals && message.proposals.length > 0 && (
                <div className="mt-3 space-y-3 border-t border-slate-100 pt-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-black uppercase tracking-wide text-slate-500">
                      Sugestoes do SIGOP
                    </span>
                    {message.proposals.some(proposal => proposal.status === 'pending') && (
                      <div className="flex flex-wrap gap-2">
                        <button
                          disabled={disabled}
                          onClick={() => acceptAllProposals(message)}
                          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          Aceitar todas
                        </button>
                        <button
                          onClick={() => rejectAllProposals(message)}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-[10px] font-black uppercase text-slate-500 hover:bg-slate-50"
                        >
                          Recusar todas
                        </button>
                      </div>
                    )}
                  </div>

                  {message.proposals.map(proposal => (
                    <div key={proposal.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <span className="text-xs font-black text-slate-900">{proposal.sectionTitle}</span>
                          <p className="mt-1 text-[10px] font-black uppercase text-slate-400">
                            {proposal.type === 'insert' ? 'Nova secao' : `Substituir secao ${proposal.sectionId}`}
                          </p>
                        </div>
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase ${
                          proposal.status === 'accepted'
                            ? 'bg-emerald-100 text-emerald-700'
                            : proposal.status === 'rejected'
                            ? 'bg-slate-200 text-slate-500'
                            : 'bg-amber-100 text-amber-700'
                        }`}>
                          {proposal.status === 'accepted' ? 'Aceita' : proposal.status === 'rejected' ? 'Recusada' : 'Pendente'}
                        </span>
                      </div>
                      <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-white p-3 text-xs leading-relaxed text-slate-700">
                        {proposal.content}
                      </div>
                      {proposal.status === 'pending' && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          <button
                            disabled={disabled}
                            onClick={() => acceptProposal(message.id, proposal)}
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                          >
                            {proposal.type === 'insert' ? 'Criar secao' : 'Substituir secao'}
                          </button>
                          <button
                            onClick={() => rejectProposal(message.id, proposal)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-500 hover:bg-white"
                          >
                            Recusar
                          </button>
                          <button
                            onClick={() => navigator.clipboard?.writeText(proposal.content)}
                            className="rounded-lg border border-slate-200 px-3 py-2 text-[10px] font-black uppercase text-slate-500 hover:bg-white"
                          >
                            Copiar texto
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}

        {loading && !hasStreamingMessage && (
          <div className="flex justify-start">
            <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-500 shadow-sm">
              Pensando... {elapsedSeconds}s
              <button onClick={cancelRequest} className="ml-3 rounded-lg bg-red-50 px-2 py-1 text-[10px] font-black uppercase text-red-600 hover:bg-red-100">
                Cancelar
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-slate-100 bg-white p-3">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            className="h-20 w-full resize-none rounded-t-2xl border-0 p-3 text-sm outline-none focus:ring-0"
            placeholder="Peca uma revisao, uma nova secao, um parecer, ou uma substituicao..."
            value={input}
            onChange={event => setInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
                event.preventDefault();
                sendChat();
              }
            }}
          />
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 px-3 py-2">
            <button onClick={() => setOptionsOpen(true)} className="rounded-lg px-2 py-1 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 hover:text-slate-700">
              Opcoes
            </button>
            <button
              disabled={loading || status !== 'online' || !input.trim()}
              onClick={sendChat}
              className="rounded-xl bg-primary px-5 py-2.5 text-xs font-black uppercase text-white shadow-sm disabled:opacity-50"
            >
              {loading ? 'Pensando...' : 'Enviar'}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default AIAssistantPanel;
