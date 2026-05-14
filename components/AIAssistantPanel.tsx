import React, { useEffect, useMemo, useState } from 'react';
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

  const settings = useMemo(() => loadAiSettings(), [open]);
  const knowledge = useMemo(() => loadKnowledgePack(), [open, messages.length]);
  const textSections = documentContext.sections.filter(section => section.type !== 'photos');
  const photos = getPhotos(documentContext.sections);
  const imageLimit = getImageLimit(settings.model);

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

  const buildMessages = (instruction: string, includeImages = false): AiChatMessage[] => {
    const imagePayload = includeImages
      ? photos.slice(0, imageLimit).map((photo: any) => stripDataUrlPrefix(photo.url))
      : undefined;

    return [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: buildKnowledgeContext(knowledge) || 'Sem pacote de conhecimento local adicional.' },
      { role: 'user', content: `CONTEXTO DO DOCUMENTO:\n${buildDocumentText(documentContext)}` },
      { role: 'user', content: instruction, images: imagePayload }
    ];
  };

  const runAssistant = async (instruction: string, includeImages = false) => {
    setLoading(true);
    setProposal('');
    try {
      const response = await chatWithLocalAi(buildMessages(instruction, includeImages), settings);
      const nextMessages: AiChatMessage[] = [
        ...messages,
        { role: 'user', content: instruction },
        { role: 'assistant', content: response }
      ];
      setMessages(nextMessages);
      setProposal(response);
    } catch (err: any) {
      setStatus('offline');
      setStatusMessage(err.message || 'Falha ao acessar a IA local.');
    } finally {
      setLoading(false);
    }
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
            Para proteger computadores com pouca memoria, o modelo {settings.model} analisara {imageLimit} foto(s) por vez. Reduza as fotos no documento ou use perguntas por partes para analisar o restante.
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={loading || status !== 'online'}
            onClick={() => runAssistant('Analise as fotos anexadas e gere observacoes tecnicas, possiveis manifestacoes patologicas, hipoteses provaveis e perguntas complementares. Use cautela tecnica.', true)}
            className="rounded-xl border border-slate-200 p-3 text-left text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary disabled:opacity-50"
          >
            Analisar Fotos
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

        <div className="rounded-xl border border-slate-200">
          <textarea
            className="h-24 w-full resize-none rounded-t-xl border-0 p-3 text-sm outline-none focus:ring-2 focus:ring-primary/20"
            placeholder="Converse com a IA sobre este documento..."
            value={input}
            onChange={event => setInput(event.target.value)}
          />
          <div className="flex items-center justify-between border-t border-slate-100 p-2">
            <span className="text-[10px] font-bold uppercase text-slate-400">{photos.length} foto(s) no documento · limite IA: {imageLimit}</span>
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
