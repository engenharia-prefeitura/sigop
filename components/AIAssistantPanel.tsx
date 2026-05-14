import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  addApprovedExample,
  buildKnowledgeContext,
  chatWithLocalAi,
  checkOllama,
  exportKnowledgePack,
  loadAiSettings,
  loadKnowledgePack,
  stripDataUrlPrefix,
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

const SYSTEM_PROMPT = `
Voce e um assistente tecnico local do SIGOP para apoiar documentos de engenharia, relatorios fotograficos, laudos e pericias.
Responda em portugues do Brasil, com linguagem tecnica clara.
Nao conclua causa definitiva apenas por imagens. Diferencie observacao visual, hipotese e recomendacao de verificacao.
Quando sugerir texto para inserir no documento, entregue pronto para uso e sem Markdown pesado.
Nunca altere nada automaticamente; o usuario aprova antes.
`;

const SMALL_VISION_SYSTEM_PROMPT = `
Responda sempre em portugues do Brasil.
Analise apenas a imagem enviada e a legenda.
Se nao conseguir identificar algo, diga "nao foi possivel confirmar pela imagem".
Use frases curtas. Nao repita palavras. Maximo de 6 linhas.
Use este formato:
Observacao:
Possiveis indicios:
Perguntas ao tecnico:
Texto sugerido:
`;

const htmlToPlainText = (html: string) => {
  const div = document.createElement('div');
  div.innerHTML = html || '';
  return div.textContent || div.innerText || '';
};

const buildDocumentText = (context: AIAssistantPanelProps['documentContext']) => {
  const sectionText = context.sections
    .filter(section => section.type !== 'photos')
    .map(section => `${section.title}:\n${htmlToPlainText(section.content || '')}`)
    .join('\n\n');

  const photoCaptions = context.sections
    .filter(section => section.type === 'photos')
    .flatMap(section => section.items || [])
    .map((photo: any, index: number) => `Foto ${index + 1}: ${photo.caption || 'Sem legenda'}`)
    .join('\n');

  return [
    `Titulo: ${context.title || 'Sem titulo'}`,
    `Tipo: ${context.typeName || 'Geral'}`,
    `Descricao: ${context.description || 'Sem descricao'}`,
    `Data do evento: ${context.eventDate || 'Nao informada'}`,
    sectionText ? `Texto atual:\n${sectionText}` : '',
    photoCaptions ? `Fotos e legendas:\n${photoCaptions}` : ''
  ].filter(Boolean).join('\n\n');
};

const getPhotos = (sections: any[]) => sections
  .filter(section => section.type === 'photos')
  .flatMap(section => section.items || [])
  .filter((photo: any) => photo?.url);

const getImageLimit = (model: string) => {
  if (model.startsWith('moondream')) return 1;
  if (model.startsWith('gemma3')) return 2;
  if (model.startsWith('qwen2.5vl:3b')) return 2;
  return 3;
};

const getAiImageSize = (model: string) => model.startsWith('moondream') ? 384 : 512;
const REQUEST_TIMEOUT_MS = 180000;

const formatChatHistory = (history: AiChatMessage[]) => history
  .filter(message => message.role !== 'system' && message.content.trim())
  .slice(-6)
  .map(message => `${message.role === 'assistant' ? 'IA' : 'Usuario'}: ${message.content}`)
  .join('\n\n');

const prepareImageForAi = async (dataUrl: string, maxSize: number): Promise<string> => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Nao foi possivel preparar a imagem para IA.'));
        return;
      }
      context.drawImage(image, 0, 0, width, height);
      resolve(stripDataUrlPrefix(canvas.toDataURL('image/jpeg', 0.45)));
    };
    image.onerror = () => reject(new Error('Nao foi possivel carregar a imagem selecionada.'));
    image.src = dataUrl;
  });
};

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
  const [messages, setMessages] = useState<AiChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState('');
  const [selectedSectionId, setSelectedSectionId] = useState<number | ''>('');
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [progressOpen, setProgressOpen] = useState(true);
  const [progressSteps, setProgressSteps] = useState<string[]>([]);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  const settings = useMemo(() => loadAiSettings(), [open]);
  const knowledge = useMemo(() => loadKnowledgePack(), [open, messages.length]);
  const textSections = documentContext.sections.filter(section => section.type !== 'photos');
  const photos = getPhotos(documentContext.sections);
  const imageLimit = getImageLimit(settings.model);
  const selectedPhoto = photos[selectedPhotoIndex] || photos[0];

  useEffect(() => {
    if (selectedPhotoIndex >= photos.length) setSelectedPhotoIndex(0);
  }, [photos.length, selectedPhotoIndex]);

  useEffect(() => {
    if (!loading) return;
    setElapsedSeconds(0);
    const timer = window.setInterval(() => setElapsedSeconds(seconds => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [loading]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;

    const run = async () => {
      setStatus('checking');
      try {
        await checkOllama(settings);
        if (!cancelled) {
          setStatus('online');
          setStatusMessage(`IA local conectada: ${settings.model}`);
        }
      } catch {
        if (!cancelled) {
          setStatus('offline');
          setStatusMessage('Ollama local nao encontrado. Configure em Assistente IA.');
        }
      }
    };

    run();
    return () => { cancelled = true; };
  }, [open]);

  const addProgress = (step: string) => {
    setProgressSteps(steps => [...steps, `${new Date().toLocaleTimeString('pt-BR')} - ${step}`]);
  };

  const buildMessages = async (
    instruction: string,
    includeImage = false,
    history: AiChatMessage[] = []
  ): Promise<AiChatMessage[]> => {
    let imagePayload: string[] | undefined;
    if (includeImage && selectedPhoto?.url) {
      addProgress('Reduzindo imagem para modo economico.');
      imagePayload = [await prepareImageForAi(selectedPhoto.url, getAiImageSize(settings.model))];
    }

    const chatHistory = includeImage ? '' : formatChatHistory(history);
    const shortDocumentContext = buildDocumentText(documentContext).slice(0, settings.model.startsWith('moondream') ? 1200 : 6000);

    if (settings.model.startsWith('moondream')) {
      return [
        { role: 'system', content: SMALL_VISION_SYSTEM_PROMPT },
        {
          role: 'user',
          content: includeImage
            ? `Legenda da foto: ${selectedPhoto?.caption || 'sem legenda'}\nTarefa: ${instruction}\nResponda em portugues, no formato pedido, sem repeticao.`
            : `Contexto resumido:\n${shortDocumentContext}\n\n${chatHistory ? `Conversa recente:\n${chatHistory}\n\n` : ''}Tarefa: ${instruction}\nResponda em portugues, curto e objetivo, sem repeticao.`
          ,
          images: imagePayload
        }
      ];
    }

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: buildKnowledgeContext(knowledge) || 'Sem pacote de conhecimento local adicional.' },
      { role: 'user', content: `CONTEXTO RESUMIDO DO DOCUMENTO:\n${shortDocumentContext}` },
      ...(chatHistory ? [{ role: 'user' as const, content: `CONVERSA RECENTE:\n${chatHistory}` }] : []),
      { role: 'user', content: instruction, images: imagePayload }
    ];
  };

  const runAssistant = async (instruction: string, includeImage = false) => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    abortRef.current = controller;
    setLoading(true);
    setProposal('');
    setProgressSteps([]);
    addProgress('Preparando solicitacao.');
    const previousMessages = messages.slice(-6);
    setMessages(current => [...current, { role: 'user', content: instruction }]);
    try {
      if (includeImage) addProgress(`Analisando foto ${selectedPhotoIndex + 1} de ${photos.length}.`);
      const requestMessages = await buildMessages(instruction, includeImage, previousMessages);
      addProgress('Aguardando resposta da IA local.');
      const response = await chatWithLocalAi(requestMessages, settings, controller.signal);
      addProgress('Resposta recebida.');
      setMessages(current => [...current, { role: 'assistant', content: response }]);
      setProposal(response);
    } catch (err: any) {
      if (err?.name === 'AbortError') {
        addProgress('Solicitacao interrompida por cancelamento ou limite de tempo.');
        setStatusMessage('A IA demorou demais. Tente Moondream, escolha uma foto simples ou feche programas pesados.');
      } else {
        addProgress('Falha ao concluir a resposta.');
        const message = err.message || 'Falha ao acessar a IA local.';
        setStatusMessage(message);
        if (message.startsWith('A IA local respondeu') || message.startsWith('A IA local gerou')) {
          setMessages(current => [...current, { role: 'assistant', content: message }]);
        } else {
          setStatus('offline');
        }
      }
    } finally {
      window.clearTimeout(timeoutId);
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
    await runAssistant(prompt, false);
  };

  const applyAsNewSection = () => {
    if (!proposal.trim()) return;
    onInsertSection('Sugestao da IA', proposal);
    addApprovedExample(proposal);
    setProposal('');
  };

  const replaceSelectedSection = () => {
    if (!proposal.trim() || selectedSectionId === '') return;
    onReplaceSection(Number(selectedSectionId), proposal.replace(/\n/g, '<br/>'));
    addApprovedExample(proposal);
    setProposal('');
  };

  if (!open) return null;

  return (
    <aside className="fixed right-0 top-0 z-[80] flex h-screen w-full max-w-[440px] flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 p-5">
        <div>
          <h2 className="text-lg font-black text-slate-900">Assistente IA Local</h2>
          <p className={`mt-1 text-xs font-bold uppercase ${status === 'online' ? 'text-emerald-600' : status === 'checking' ? 'text-amber-600' : 'text-red-500'}`}>
            {statusMessage || 'Verificando IA local...'}
          </p>
        </div>
        <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-5">
        {status !== 'online' && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
            A IA local precisa estar instalada e com o Ollama ativo. Abra a tela Assistente IA no menu para baixar o instalador e o modelo leve.
          </div>
        )}

        {photos.length > imageLimit && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs font-bold text-blue-900">
            Para proteger computadores com pouca memoria, o modelo {settings.model} analisara uma foto selecionada por vez em modo economico.
          </div>
        )}

        {photos.length > 0 && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase text-slate-400">Foto para analise</span>
              <span className="text-[10px] font-bold text-slate-400">{selectedPhotoIndex + 1} de {photos.length}</span>
            </div>
            <div className="flex gap-3">
              <div className="h-20 w-28 flex-none overflow-hidden rounded-lg bg-slate-100">
                {selectedPhoto?.url && <img src={selectedPhoto.url} className="h-full w-full object-cover" />}
              </div>
              <div className="min-w-0 flex-1">
                <select
                  value={selectedPhotoIndex}
                  onChange={event => setSelectedPhotoIndex(Number(event.target.value))}
                  disabled={loading}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold"
                >
                  {photos.map((photo: any, index: number) => (
                    <option key={photo.id || index} value={index}>Foto {index + 1} - {photo.caption || 'Sem legenda'}</option>
                  ))}
                </select>
                <p className="mt-2 line-clamp-2 text-xs text-slate-500">{selectedPhoto?.caption || 'Sem legenda'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={loading || status !== 'online'}
            onClick={() => runAssistant(`Descreva tecnicamente a foto. Aponte somente indicios visuais, sem diagnostico definitivo. Gere perguntas complementares e um texto curto para laudo.`, true)}
            className="rounded-xl border border-slate-200 p-3 text-left text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Analisar Foto
          </button>
          <button
            disabled={loading || status !== 'online'}
            onClick={() => runAssistant('Revise o documento atual e aponte lacunas, inconsistencias, informacoes ausentes e perguntas que o tecnico deve responder antes de finalizar.')}
            className="rounded-xl border border-slate-200 p-3 text-left text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Revisar Laudo
          </button>
          <button
            disabled={loading || status !== 'online'}
            onClick={() => runAssistant('Gere uma conclusao tecnica cautelosa para o documento, com recomendacoes e limitacoes da analise.')}
            className="rounded-xl border border-slate-200 p-3 text-left text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Criar Conclusao
          </button>
          <button
            disabled={loading || status !== 'online'}
            onClick={() => runAssistant('Transforme o conteudo atual em redacao tecnica mais formal, mantendo sentido e sem inventar dados.')}
            className="rounded-xl border border-slate-200 p-3 text-left text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Melhorar Texto
          </button>
        </div>

        {(progressSteps.length > 0 || loading) && (
          <div className="rounded-xl border border-slate-200 bg-slate-50">
            <button onClick={() => setProgressOpen(!progressOpen)} className="flex w-full items-center justify-between px-4 py-3 text-left">
              <span className="text-xs font-black uppercase text-slate-600">{loading ? `Processando (${elapsedSeconds}s / max. 180s)` : 'Etapas da ultima solicitacao'}</span>
              <span className="material-symbols-outlined text-[18px] text-slate-400">{progressOpen ? 'expand_less' : 'expand_more'}</span>
            </button>
            {progressOpen && (
              <div className="border-t border-slate-200 px-4 py-3">
                <p className="mb-2 text-[10px] font-bold uppercase text-slate-400">Progresso operacional, nao raciocinio interno da IA.</p>
                <div className="max-h-28 space-y-1 overflow-y-auto text-xs text-slate-600">
                  {progressSteps.map((step, index) => <p key={index}>{step}</p>)}
                </div>
                {loading && (
                  <button onClick={cancelRequest} className="mt-3 rounded-lg bg-red-600 px-3 py-2 text-xs font-black uppercase text-white hover:bg-red-700">
                    Cancelar
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {messages.length > 0 && (
          <div className="space-y-3 rounded-xl border border-slate-200 p-3">
            <h3 className="text-[10px] font-black uppercase text-slate-400">Chat</h3>
            <div className="max-h-72 space-y-3 overflow-y-auto">
              {messages.map((message, index) => (
                <div key={index} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${message.role === 'user' ? 'bg-primary text-white' : 'bg-slate-100 text-slate-800'}`}>
                    {message.content}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200">
          <textarea
            className="h-24 w-full resize-none rounded-t-xl border-0 p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Converse com a IA sobre este documento..."
            value={input}
            onChange={event => setInput(event.target.value)}
          />
          <div className="flex items-center justify-between border-t border-slate-100 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">{photos.length} foto(s) no documento · modo economico</span>
            <button
              disabled={loading || status !== 'online' || !input.trim()}
              onClick={sendChat}
              className="rounded-lg bg-primary px-4 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
            >
              {loading ? 'Pensando...' : 'Enviar'}
            </button>
          </div>
        </div>

        {proposal && (
          <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-xs font-black uppercase text-blue-800">Sugestao gerada</h3>
              <button onClick={() => setProposal('')} className="text-xs font-bold text-slate-400 hover:text-slate-700">Limpar</button>
            </div>
            <div className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl bg-white p-3 text-sm leading-relaxed text-slate-800">
              {proposal}
            </div>
            <div className="mt-3 space-y-2">
              <button
                disabled={disabled}
                onClick={applyAsNewSection}
                className="w-full rounded-xl bg-emerald-600 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                Inserir como nova secao
              </button>
              <div className="flex gap-2">
                <select
                  value={selectedSectionId}
                  onChange={event => setSelectedSectionId(event.target.value ? Number(event.target.value) : '')}
                  className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold"
                >
                  <option value="">Escolha uma secao</option>
                  {textSections.map(section => (
                    <option key={section.id} value={section.id}>{section.title}</option>
                  ))}
                </select>
                <button
                  disabled={disabled || selectedSectionId === ''}
                  onClick={replaceSelectedSection}
                  className="rounded-xl bg-slate-800 px-3 py-2 text-xs font-black uppercase text-white disabled:opacity-50"
                >
                  Substituir
                </button>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-xl border border-slate-200 p-4">
          <h3 className="text-xs font-black uppercase text-slate-500">Conhecimento local</h3>
          <p className="mt-1 text-xs text-slate-500">{knowledge.name} v{knowledge.version}</p>
          <p className="mt-1 text-xs text-slate-400">{knowledge.approvedExamples.length} exemplo(s) aprovado(s) salvos neste PC.</p>
          <button onClick={exportKnowledgePack} className="mt-3 rounded-lg border border-slate-200 px-3 py-2 text-xs font-black uppercase text-slate-600 hover:border-primary hover:text-primary">
            Exportar pacote
          </button>
        </div>
      </div>
    </aside>
  );
};

export default AIAssistantPanel;
