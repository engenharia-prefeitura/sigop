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

const parseSectionProposals = (rawText: string, sections: any[]) => {
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
  const [loading, setLoading] = useState(false);
  const [selectedSectionId, setSelectedSectionId] = useState<number | ''>('');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const settings = useMemo(() => loadAiSettings(), [open]);
  const knowledge = useMemo(() => loadKnowledgePack(), [open, messages.length]);
  const textSections = documentContext.sections.filter(section => section.type !== 'photos');
  const textModel = getTextModel(settings);
  const selectedSection = textSections.find(section => section.id === selectedSectionId);
  const hasStreamingMessage = messages.some(message => message.streaming);

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
    const documentText = buildDocumentText(documentContext).slice(0, 7000);
    const chatHistory = formatChatHistory(history);
    const sectionText = targetSection
      ? `SECAO ALVO PARA TRABALHAR:\nID: ${targetSection.id}\nTitulo: ${targetSection.title}\nTexto atual:\n${htmlToPlainText(targetSection.content || '') || '[sem texto]'}`
      : '';

    const proposalInstruction = proposalMode
      ? `TAREFA:\n${instruction}\n\nFORMATO OBRIGATORIO:\nComece com RESUMO: uma frase curta.\n\nPara alterar uma secao existente, use um bloco por secao exatamente assim:\n[PROPOSTA_REVISAO]\nID: numero da secao existente\nTITULO: titulo da secao existente\nTEXTO:\ntexto completo revisado para substituir apenas esta secao\n[/PROPOSTA_REVISAO]\n\nPara criar uma nova secao, use um bloco exatamente assim:\n[PROPOSTA_NOVA_SECAO]\nTITULO: titulo da nova secao\nTEXTO:\ntexto completo da nova secao\n[/PROPOSTA_NOVA_SECAO]\n\nREGRAS:\n${proposalMode === 'replace' ? '- Proponha somente alteracoes em secoes existentes. Nao crie novas secoes.\n' : ''}${proposalMode === 'insert' ? '- Proponha somente novas secoes. Nao substitua secoes existentes.\n' : ''}${proposalMode === 'mixed' ? '- Pode propor substituicoes e novas secoes quando forem claramente necessarias.\n' : ''}- Use apenas os fatos existentes no documento.\n- Nao escreva colchetes ou marcadores fora dos blocos acima.\n- Nao use formato em ingles.\n- Se nao houver proposta segura, responda apenas o resumo explicando a lacuna.`
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
          : `TAREFA:\n${instruction}\n\nResponda de forma objetiva e completa. Se sugerir alteracao, pergunte no final se o usuario deseja aplicar.`
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
        }
      );
      const actions: AssistantAction[] = [];

      let content = response.text;
      let proposals: SectionProposal[] = [];

      if (options.proposalMode) {
        const parsed = parseSectionProposals(response.text, textSections);
        content = parsed.displayText;
        proposals = parsed.proposals;
        if (!proposals.length && options.insertTitle && response.text.trim()) {
          proposals = [{
            id: makeId(),
            type: 'insert',
            sectionTitle: options.insertTitle,
            content: repairMojibake(response.text),
            status: 'pending'
          }];
          content = `Preparei uma proposta de nova secao: "${options.insertTitle}".`;
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
        if (/modelo.*parou|runner.*parou|resource|recurso|memoria|memory/i.test(message)) {
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

  const sendChat = async () => {
    if (!input.trim()) return;
    const prompt = input.trim();
    setInput('');
    const wantsReplacement = looksLikeReplacementRequest(prompt);
    const wantsInsert = looksLikeInsertRequest(prompt);

    if (wantsReplacement && wantsInsert) {
      await runAssistant(prompt, { displayText: prompt, proposalMode: 'mixed' });
      return;
    }

    if (wantsInsert) {
      await runAssistant(prompt, { displayText: prompt, proposalMode: 'insert' });
      return;
    }

    if (isGeneralReviewRequest(prompt)) {
      await runAssistant(prompt, { displayText: prompt, proposalMode: 'replace' });
      return;
    }

    if (wantsReplacement) {
      const target = findSectionFromText(prompt, textSections) || selectedSection;
      if (target && !isGeneralReviewRequest(prompt)) {
        await runAssistant(prompt, {
          displayText: prompt,
          targetSectionId: Number(target.id),
          replacementMode: true
        });
        return;
      }
      await runAssistant(prompt, { displayText: prompt, proposalMode: 'replace' });
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
    runAssistant(
      `Melhore tecnicamente a secao "${selectedSection.title}", mantendo somente os fatos existentes e deixando o texto pronto para substituir a secao.`,
      {
        displayText: `Melhorar a secao "${selectedSection.title}"`,
        targetSectionId: selectedSection.id,
        replacementMode: true
      }
    );
  };

  const runInsertCommand = (label: string, instruction: string, title: string) => {
    runAssistant(instruction, { displayText: label, insertTitle: title, proposalMode: 'insert' });
  };

  if (!open) return null;

  return (
    <aside className="fixed right-0 top-0 z-[80] flex h-screen w-full max-w-[640px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-black text-slate-900">Assistente IA</h2>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black uppercase text-slate-500">texto</span>
          </div>
          <p className={`mt-1 line-clamp-2 text-xs font-bold ${status === 'online' ? 'text-emerald-600' : status === 'checking' ? 'text-amber-600' : 'text-red-500'}`}>
            {statusMessage || 'Verificando IA local...'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="border-b border-slate-100 px-5 py-3">
        <div className="mb-3 flex gap-2">
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
            onClick={improveSelectedSection}
            className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            Melhorar
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button disabled={loading || status !== 'online'} onClick={() => runAssistant(REVIEW_INSTRUCTION, { displayText: 'Revisar documento', proposalMode: 'replace' })} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Revisar
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runInsertCommand('Gerar parecer', OPINION_INSTRUCTION, 'Parecer Tecnico')} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Parecer
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runInsertCommand('Gerar relatorio', REPORT_INSTRUCTION, 'Relatorio Tecnico')} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Relatorio
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runInsertCommand('Criar conclusao', CONCLUSION_INSTRUCTION, 'Conclusao')} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Conclusao
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runAssistant(PENDING_INSTRUCTION, { displayText: 'Sugerir pendencias' })} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Pendencias
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runAssistant(IMPROVE_TEXT_INSTRUCTION, { displayText: 'Melhorar texto geral', proposalMode: 'replace' })} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Texto geral
          </button>
          <button disabled={loading || status !== 'online'} onClick={() => runAssistant(COMPLEMENT_INSTRUCTION, { displayText: 'Complementar documento', proposalMode: 'insert' })} className="rounded-xl border border-slate-200 px-3 py-2 text-left text-[11px] font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50">
            Complementar
          </button>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50/60 px-5 py-4">
        {status !== 'online' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-medium text-amber-900">
            A IA local precisa estar instalada e com o Ollama ativo.
          </div>
        )}

        {messages.length === 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-relaxed text-slate-600">
            Descreva o que deseja no campo abaixo ou use um comando acima. Eu trabalho apenas com o texto do documento e posso revisar secoes, sugerir melhorias, gerar parecer, relatorio ou conclusao.
          </div>
        )}

        {messages.map(message => (
          <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${message.role === 'user' ? 'bg-primary text-white' : 'bg-white text-slate-800 border border-slate-200'}`}>
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
                      Propostas da IA
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

      <div className="border-t border-slate-100 bg-white p-4">
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm focus-within:ring-2 focus-within:ring-primary/15">
          <textarea
            className="h-28 w-full resize-none rounded-t-2xl border-0 p-4 text-sm outline-none focus:ring-0"
            placeholder="Peça como se estivesse falando com um assistente: melhore esta seção, gere um parecer, deixe mais formal, aponte lacunas..."
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
            <button onClick={exportKnowledgePack} className="rounded-lg px-2 py-1 text-[10px] font-black uppercase text-slate-400 hover:bg-slate-50 hover:text-slate-700">
              Exportar conhecimento
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
