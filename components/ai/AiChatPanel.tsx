import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import type {
  Attachment,
  ChatMessage,
  ChatMode,
  ContentPart,
  DocumentBridge,
  ModelChoice,
  Proposal,
  ToolContext,
  UserAiSettings,
} from '../../lib/ai/types';
import { runAgent } from '../../lib/ai/agentLoop';
import { createProposalManager, ProposalManager } from '../../lib/ai/proposals';
import { getToolsForMode } from '../../lib/ai/toolDefinitions';
import { createAttachment, estimateImagesPerMessage, fitForProvider } from '../../lib/ai/attachments';
import { buildSystemPrompt } from '../../lib/ai/prompt';
import {
  AiConversation,
  listConversations,
  loadUserSettings,
  saveConversation,
} from '../../lib/ai/client';
import SimpleMarkdown from './SimpleMarkdown';
import ProposalCard from './ProposalCard';

export interface AiChatPanelProps {
  open: boolean;
  onClose: () => void;
  bridge: DocumentBridge;
  compressForDocument: (original: Blob) => Promise<string>;
  documentId?: string | null;
  documentTitle?: string;
}

type Item =
  | { kind: 'user'; key: string; text: string; thumbs: string[] }
  | { kind: 'assistant'; key: string; text: string }
  | { kind: 'tool'; key: string; callId: string; label: string; done: boolean; ok?: boolean }
  | { kind: 'proposal'; key: string; proposalId: string }
  | { kind: 'error'; key: string; text: string };

const MODE_LABEL: Record<ChatMode, string> = {
  chat_only: 'Somente conversa',
  propose: 'Propor alterações',
  autonomous: 'Autônomo',
};

const MODE_HINT: Record<ChatMode, string> = {
  chat_only: 'A IA apenas lê o documento e conversa; não altera nada.',
  propose: 'A IA propõe alterações e você aprova cada uma.',
  autonomous: 'A IA aplica as alterações diretamente; você pode desfazer.',
};

const READ_LABELS: Record<string, string> = {
  listar_secoes: 'Consultando seções do documento...',
  ler_secao: 'Lendo seção...',
  ver_foto: 'Analisando foto do documento...',
};

let keySeq = 0;
const nextKey = () => `k${Date.now().toString(36)}${keySeq++}`;

function messageText(m: ChatMessage): string {
  return m.content
    .filter((p): p is Extract<ContentPart, { type: 'text' }> => p.type === 'text')
    .map(p => p.text)
    .join('\n');
}

/** Reconstroi itens de UI e mensagens validas (sem imagens vazias) de uma conversa salva. */
function restoreConversation(conv: AiConversation): { items: Item[]; messages: ChatMessage[] } {
  const messages: ChatMessage[] = conv.messages.map(m => ({
    ...m,
    content: m.content.map(p =>
      p.type === 'image' && !p.data
        ? ({ type: 'text', text: `[imagem ${p.attachmentId} indisponível nesta conversa retomada]` } as ContentPart)
        : p
    ),
  }));
  const items: Item[] = [];
  for (const m of messages) {
    if (m.role === 'user') {
      const t = messageText(m);
      if (t) items.push({ kind: 'user', key: nextKey(), text: t, thumbs: [] });
    } else if (m.role === 'assistant') {
      const t = messageText(m);
      if (t) items.push({ kind: 'assistant', key: nextKey(), text: t });
      for (const c of m.toolCalls || []) {
        if (READ_LABELS[c.name]) items.push({ kind: 'tool', key: nextKey(), callId: c.id, label: READ_LABELS[c.name], done: true, ok: true });
      }
    }
  }
  return { items, messages };
}

const AiChatPanel: React.FC<AiChatPanelProps> = ({
  open,
  onClose,
  bridge,
  compressForDocument,
  documentId,
  documentTitle,
}) => {
  const [settings, setSettings] = useState<UserAiSettings | null>(null);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>('propose');
  const [items, setItems] = useState<Item[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<Attachment[]>([]);
  const [running, setRunning] = useState(false);
  const [attachError, setAttachError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [manager, setManager] = useState<ProposalManager>(() => createProposalManager());
  const [history, setHistory] = useState<AiConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [persistError, setPersistError] = useState<string | null>(null);

  const messagesRef = useRef<ChatMessage[]>([]);
  const attachmentsRef = useRef<Map<string, Attachment>>(new Map());
  const attCounter = useRef(0);
  const convIdRef = useRef<string | undefined>(undefined);
  const abortRef = useRef<AbortController | null>(null);
  const bridgeRef = useRef(bridge);
  const compressRef = useRef(compressForDocument);
  const bottomRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const managerRef = useRef(manager);
  bridgeRef.current = bridge;
  compressRef.current = compressForDocument;
  managerRef.current = manager;

  // --- configuracoes
  useEffect(() => {
    if (!open || settings) return;
    let alive = true;
    loadUserSettings()
      .then(s => {
        if (!alive) return;
        setSettings(s);
        setMode(s.defaultMode);
      })
      .catch(e => alive && setSettingsError(e?.message || 'Não foi possível carregar as configurações de IA.'));
    return () => {
      alive = false;
    };
  }, [open, settings]);

  // --- assinatura das propostas
  useEffect(() => {
    setProposals(manager.list());
    return manager.subscribe(setProposals);
  }, [manager]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [items, proposals, running]);

  // aborta ao desmontar
  useEffect(() => () => abortRef.current?.abort(), []);

  const refreshHistory = useCallback(async () => {
    if (!documentId) return;
    try {
      setHistory(await listConversations(documentId));
    } catch {
      /* historico e opcional */
    }
  }, [documentId]);

  useEffect(() => {
    if (open && documentId) refreshHistory();
  }, [open, documentId, refreshHistory]);

  const ready = !!settings && !!settings.models.chat && settings.privacyAccepted;
  const chatChoice = settings?.models.chat;
  const visionChoice: ModelChoice | undefined = settings?.models.vision || chatChoice;
  const activeChoice = pending.length > 0 ? visionChoice : chatChoice;
  const maxImages = activeChoice ? estimateImagesPerMessage(activeChoice.provider) : 5;
  const proposalMap = useMemo(() => new Map(proposals.map(p => [p.id, p])), [proposals]);
  const pendingProposals = proposals.filter(p => p.status === 'pending');
  const hasApplied = proposals.some(p => p.status === 'applied');
  const editable = bridge.isEditable();

  const makeCtx = useCallback(
    (): ToolContext => ({
      bridge: bridgeRef.current,
      getAttachment: id => attachmentsRef.current.get(id),
      compressForDocument: b => compressRef.current(b),
    }),
    []
  );

  // --- anexos
  const addFiles = useCallback(
    async (files: File[]) => {
      const imgs = files.filter(f => f.type.startsWith('image/') || /\.(heic|heif)$/i.test(f.name));
      if (!imgs.length) return;
      setAttachError(null);
      for (const f of imgs) {
        try {
          const idx = ++attCounter.current;
          const att = await createAttachment(f, idx);
          attachmentsRef.current.set(att.id, att);
          setPending(prev => [...prev, att]);
        } catch (e: any) {
          setAttachError(e?.message || 'Falha ao anexar imagem.');
        }
      }
    },
    []
  );

  const removePending = (id: string) => {
    setPending(prev => prev.filter(a => a.id !== id));
    attachmentsRef.current.delete(id);
  };

  const onPaste = (e: React.ClipboardEvent) => {
    const files = Array.from(e.clipboardData?.files || []);
    if (files.some(f => f.type.startsWith('image/'))) {
      e.preventDefault();
      addFiles(files);
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    addFiles(Array.from(e.dataTransfer?.files || []));
  };

  // --- persistencia
  const persist = useCallback(
    async (title: string) => {
      if (!documentId || messagesRef.current.length === 0) return;
      try {
        const saved = await saveConversation({
          id: convIdRef.current,
          documentId,
          title,
          messages: messagesRef.current,
        });
        convIdRef.current = saved.id;
        setPersistError(null);
        refreshHistory();
      } catch (e: any) {
        setPersistError(e?.message || 'Não foi possível salvar a conversa.');
      }
    },
    [documentId, refreshHistory]
  );

  const titleRef = useRef('');

  // --- envio
  const send = async () => {
    const text = input.trim();
    if ((!text && pending.length === 0) || running || !ready || !chatChoice) return;
    const atts = pending;
    const choice = atts.length > 0 && visionChoice ? visionChoice : chatChoice;
    if (atts.length > estimateImagesPerMessage(choice.provider)) {
      setAttachError(`Este provedor aceita até ${estimateImagesPerMessage(choice.provider)} imagens por mensagem. Remova algumas.`);
      return;
    }

    setAttachError(null);
    setRunning(true);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const parts: ContentPart[] = [];
      let fullText = text || 'Analise as fotos anexadas.';
      if (atts.length) {
        fullText +=
          '\n\nFotos anexadas: ' +
          atts.map(a => `${a.id} (${a.name} ${a.width}x${a.height})`).join(', ') +
          '.';
      }
      parts.push({ type: 'text', text: fullText });
      for (const a of atts) {
        const fitted = await fitForProvider(a, choice.provider);
        parts.push({ type: 'image', attachmentId: a.id, mediaType: fitted.aiMediaType, data: fitted.aiData });
      }
      const userMsg: ChatMessage = { role: 'user', content: parts };
      if (!titleRef.current) titleRef.current = (text || 'Conversa com fotos').slice(0, 60);

      setItems(prev => [...prev, { kind: 'user', key: nextKey(), text: text || '(fotos anexadas)', thumbs: atts.map(a => a.thumbUrl) }]);
      setInput('');
      setPending([]);

      const sendMessages = [...messagesRef.current, userMsg];
      messagesRef.current = sendMessages;

      const gen = runAgent({
        messages: sendMessages,
        choice,
        mode,
        tools: getToolsForMode(mode),
        system: buildSystemPrompt(bridgeRef.current.getState(), mode),
        ctx: makeCtx(),
        proposals: { add: p => void managerRef.current.add(p), apply: (id, ctx) => managerRef.current.apply(id, ctx) },
        signal: controller.signal,
      });

      for await (const ev of gen) {
        switch (ev.type) {
          case 'text_delta':
            setItems(prev => {
              const last = prev[prev.length - 1];
              if (last && last.kind === 'assistant') {
                return [...prev.slice(0, -1), { ...last, text: last.text + ev.text }];
              }
              return [...prev, { kind: 'assistant', key: nextKey(), text: ev.text }];
            });
            break;
          case 'tool_started': {
            const label = READ_LABELS[ev.call.name];
            if (label) {
              setItems(prev => [...prev, { kind: 'tool', key: nextKey(), callId: ev.call.id, label, done: false }]);
            }
            break;
          }
          case 'proposal_created':
            setItems(prev => [...prev, { kind: 'proposal', key: nextKey(), proposalId: ev.proposal.id }]);
            break;
          case 'tool_result':
            setItems(prev =>
              prev.map(it => (it.kind === 'tool' && it.callId === ev.call.id ? { ...it, done: true, ok: ev.result.ok } : it))
            );
            break;
          case 'message_added':
            messagesRef.current = [...messagesRef.current, ev.message];
            break;
          case 'error':
            setItems(prev => [...prev, { kind: 'error', key: nextKey(), text: ev.message }]);
            break;
          case 'done':
            break;
        }
      }
    } catch (e: any) {
      if (e?.name !== 'AbortError') {
        setItems(prev => [...prev, { kind: 'error', key: nextKey(), text: e?.message || 'Erro inesperado.' }]);
      }
    } finally {
      setRunning(false);
      abortRef.current = null;
      setItems(prev => prev.map(it => (it.kind === 'tool' && !it.done ? { ...it, done: true } : it)));
      persist(titleRef.current || documentTitle || 'Conversa');
    }
  };

  const stop = () => abortRef.current?.abort();

  const newConversation = () => {
    abortRef.current?.abort();
    messagesRef.current = [];
    attachmentsRef.current = new Map();
    attCounter.current = 0;
    convIdRef.current = undefined;
    titleRef.current = '';
    setItems([]);
    setPending([]);
    setInput('');
    setAttachError(null);
    setManager(createProposalManager());
    setShowHistory(false);
    if (settings) setMode(settings.defaultMode);
  };

  const resume = (conv: AiConversation) => {
    newConversation();
    const { items: restored, messages } = restoreConversation(conv);
    messagesRef.current = messages;
    convIdRef.current = conv.id;
    titleRef.current = conv.title;
    setItems(restored);
    setShowHistory(false);
  };

  // --- acoes de proposta
  const withBusy = async (ids: string[], fn: () => Promise<void> | void) => {
    setBusyIds(prev => new Set([...prev, ...ids]));
    try {
      await fn();
    } finally {
      setBusyIds(prev => {
        const n = new Set(prev);
        ids.forEach(i => n.delete(i));
        return n;
      });
    }
  };

  const applyOne = (p: Proposal) => {
    if (p.destructive && !window.confirm(`Confirmar ação destrutiva?\n\n${p.summary}`)) return;
    withBusy([p.id], async () => {
      await manager.apply(p.id, makeCtx());
    });
  };
  const rejectOne = (p: Proposal) => manager.reject(p.id);
  const undoOne = (p: Proposal) => {
    manager.undo(p.id, makeCtx());
  };
  const applyAll = () => {
    const pend = manager.list().filter(p => p.status === 'pending');
    const destructive = pend.filter(p => p.destructive);
    if (
      destructive.length &&
      !window.confirm(`Entre as propostas há ${destructive.length} ação(ões) destrutiva(s):\n\n${destructive.map(d => '• ' + d.summary).join('\n')}\n\nAplicar todas mesmo assim?`)
    )
      return;
    withBusy(pend.map(p => p.id), async () => {
      await manager.applyAll(makeCtx());
    });
  };
  const undoLast = () => {
    manager.undoLast(makeCtx());
  };

  if (!open) return null;

  // --- render
  const renderItem = (it: Item) => {
    switch (it.kind) {
      case 'user':
        return (
          <div key={it.key} className="flex justify-end">
            <div className="max-w-[90%] rounded-2xl rounded-br-sm bg-primary text-white px-3 py-2 text-sm">
              {it.thumbs.length > 0 && (
                <div className="flex flex-wrap gap-1 mb-1">
                  {it.thumbs.map((t, i) => (
                    <img key={i} src={t} alt="" className="size-14 object-cover rounded" />
                  ))}
                </div>
              )}
              <p className="whitespace-pre-wrap break-words">{it.text}</p>
            </div>
          </div>
        );
      case 'assistant':
        return (
          <div key={it.key} className="flex justify-start">
            <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-slate-100 text-slate-800 px-3 py-2">
              <SimpleMarkdown text={it.text} />
            </div>
          </div>
        );
      case 'tool':
        return (
          <div key={it.key} className="flex items-center gap-1 text-xs text-slate-400 pl-1">
            <span className={`material-symbols-outlined text-sm ${it.done ? '' : 'animate-spin'}`}>
              {it.done ? (it.ok === false ? 'error' : 'check') : 'progress_activity'}
            </span>
            {it.label}
          </div>
        );
      case 'proposal': {
        const p = proposalMap.get(it.proposalId);
        if (!p) return null;
        return (
          <ProposalCard
            key={it.key}
            proposal={p}
            busy={busyIds.has(p.id)}
            disabled={!editable}
            onApply={applyOne}
            onReject={rejectOne}
            onUndo={undoOne}
          />
        );
      }
      case 'error':
        return (
          <div key={it.key} className="rounded-lg border border-red-300 bg-red-50 text-red-700 p-3 text-sm flex gap-2">
            <span className="material-symbols-outlined text-lg">error</span>
            <div className="break-words min-w-0">
              <p className="font-semibold">Erro do provedor de IA</p>
              <p>{it.text}</p>
            </div>
          </div>
        );
    }
  };

  const notReadyMessage = settingsError
    ? settingsError
    : !settings
      ? null
      : !settings.models.chat
        ? 'Nenhum modelo de chat configurado.'
        : !settings.privacyAccepted
          ? 'É necessário aceitar o aviso de privacidade (os dados do documento e das fotos são enviados ao provedor de IA escolhido).'
          : null;

  return (
    <aside
      className="fixed right-0 top-0 bottom-0 z-40 w-full sm:w-[420px] bg-white border-l border-slate-200 shadow-2xl flex flex-col"
      onDragOver={e => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={e => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={onDrop}
    >
      {/* Cabecalho */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
        <span className="material-symbols-outlined text-primary">smart_toy</span>
        <h2 className="font-bold text-slate-800 flex-1 truncate">Assistente IA</h2>
        {documentId && (
          <button
            title="Conversas anteriores"
            onClick={() => setShowHistory(v => !v)}
            className="p-1 rounded hover:bg-slate-100 text-slate-500"
          >
            <span className="material-symbols-outlined">history</span>
          </button>
        )}
        <button title="Nova conversa" onClick={newConversation} className="p-1 rounded hover:bg-slate-100 text-slate-500">
          <span className="material-symbols-outlined">add_comment</span>
        </button>
        <button title="Fechar" onClick={onClose} className="p-1 rounded hover:bg-slate-100 text-slate-500">
          <span className="material-symbols-outlined">close</span>
        </button>
      </div>

      {showHistory && (
        <div className="border-b border-slate-200 max-h-48 overflow-y-auto bg-slate-50">
          {history.length === 0 ? (
            <p className="p-3 text-xs text-slate-500">Nenhuma conversa salva para este documento.</p>
          ) : (
            history.map(c => (
              <button
                key={c.id}
                onClick={() => resume(c)}
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 border-b border-slate-100"
              >
                <p className="truncate text-slate-800">{c.title}</p>
                <p className="text-[11px] text-slate-400">{new Date(c.updatedAt).toLocaleString('pt-BR')}</p>
              </button>
            ))
          )}
        </div>
      )}

      {/* Aviso de configuracao */}
      {(notReadyMessage || settingsError) && (
        <div className="m-3 rounded-lg border border-amber-300 bg-amber-50 text-amber-900 p-3 text-sm">
          <p>{notReadyMessage}</p>
          <Link to="/ai-settings" className="inline-block mt-2 font-semibold text-primary underline">
            Abrir configurações de IA
          </Link>
        </div>
      )}
      {!settings && !settingsError && <p className="p-4 text-sm text-slate-500">Carregando configurações...</p>}

      {ready && (
        <>
          {/* Modo */}
          <div className="px-3 py-2 border-b border-slate-100 flex items-center gap-2">
            <label className="text-xs text-slate-500" htmlFor="ai-mode">Modo</label>
            <select
              id="ai-mode"
              value={mode}
              disabled={running}
              onChange={e => setMode(e.target.value as ChatMode)}
              className="flex-1 text-sm border border-slate-300 rounded px-2 py-1 bg-white"
              title={MODE_HINT[mode]}
            >
              {(Object.keys(MODE_LABEL) as ChatMode[]).map(m => (
                <option key={m} value={m}>{MODE_LABEL[m]}</option>
              ))}
            </select>
          </div>
          <p className="px-3 pt-1 text-[11px] text-slate-400">{MODE_HINT[mode]}</p>
          {!editable && mode !== 'chat_only' && (
            <p className="mx-3 mt-1 text-[11px] text-amber-700">O documento não está editável; propostas não poderão ser aplicadas.</p>
          )}

          {/* Mensagens */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3">
            {items.length === 0 && (
              <div className="text-sm text-slate-500 text-center mt-8 px-4">
                <span className="material-symbols-outlined text-4xl text-slate-300">forum</span>
                <p className="mt-2">
                  Peça para revisar o texto, redigir seções ou descrever fotos{documentTitle ? ` de "${documentTitle}"` : ''}.
                  Você pode anexar, arrastar ou colar fotos.
                </p>
              </div>
            )}
            {items.map(renderItem)}
            {running && (
              <div className="flex items-center gap-1 text-xs text-slate-400 pl-1">
                <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                Processando...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* Barra de propostas */}
          {(pendingProposals.length > 0 || hasApplied) && (
            <div className="px-3 py-2 border-t border-slate-200 bg-slate-50 flex items-center gap-2 text-xs">
              {pendingProposals.length > 0 && (
                <button
                  onClick={applyAll}
                  disabled={!editable || running}
                  className="px-2 py-1 rounded bg-primary text-white disabled:opacity-50"
                >
                  Aplicar todas ({pendingProposals.length})
                </button>
              )}
              {hasApplied && (
                <button
                  onClick={undoLast}
                  disabled={!editable}
                  className="px-2 py-1 rounded border border-slate-300 text-slate-700 hover:bg-slate-100 disabled:opacity-50 flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">undo</span>Desfazer última
                </button>
              )}
            </div>
          )}

          {persistError && <p className="px-3 text-[11px] text-amber-700">Conversa não salva: {persistError}</p>}

          {/* Composicao */}
          <div className="border-t border-slate-200 p-3 space-y-2">
            {pending.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {pending.map(a => (
                  <div key={a.id} className="relative" title={`${a.id} - ${a.name}`}>
                    <img src={a.thumbUrl} alt={a.name} className="size-14 object-cover rounded border border-slate-200" />
                    <span className="absolute bottom-0 left-0 right-0 text-[9px] text-center bg-black/60 text-white rounded-b">{a.id}</span>
                    <button
                      onClick={() => removePending(a.id)}
                      className="absolute -top-1.5 -right-1.5 size-4 rounded-full bg-red-600 text-white flex items-center justify-center"
                      aria-label="Remover anexo"
                    >
                      <span className="material-symbols-outlined !text-[12px]">close</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
            {(pending.length > 0 || attachError) && (
              <p className={`text-[11px] ${pending.length > maxImages || attachError ? 'text-red-600' : 'text-slate-400'}`}>
                {attachError || `${pending.length}/${maxImages} imagens nesta mensagem`}
                {!attachError && pending.length > maxImages && ' - remova algumas para enviar'}
              </p>
            )}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.heic,.heif"
                multiple
                className="hidden"
                onChange={e => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = '';
                }}
              />
              <button
                title="Anexar fotos"
                onClick={() => fileInputRef.current?.click()}
                className="p-2 rounded hover:bg-slate-100 text-slate-500"
              >
                <span className="material-symbols-outlined">add_photo_alternate</span>
              </button>
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                onPaste={onPaste}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={2}
                placeholder="Escreva sua mensagem... (Enter envia, Shift+Enter quebra linha)"
                className="flex-1 resize-none border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
              {running ? (
                <button onClick={stop} title="Parar" className="p-2 rounded-lg bg-red-600 text-white">
                  <span className="material-symbols-outlined">stop</span>
                </button>
              ) : (
                <button
                  onClick={send}
                  disabled={(!input.trim() && pending.length === 0) || pending.length > maxImages}
                  title="Enviar"
                  className="p-2 rounded-lg bg-primary text-white disabled:opacity-50"
                >
                  <span className="material-symbols-outlined">send</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {dragging && ready && (
        <div className="absolute inset-0 bg-primary/10 border-2 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <p className="font-semibold text-primary">Solte as fotos para anexar</p>
        </div>
      )}
    </aside>
  );
};

export default AiChatPanel;
