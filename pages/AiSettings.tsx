import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../components/AuthContext';
import {
  DEFAULT_USER_SETTINGS,
  deleteKey,
  keyStatus,
  listModels,
  loadUserSettings,
  saveKey,
  saveUserSettings,
  testConnection,
} from '../lib/ai/client';
import { DEFAULT_MODELS, PROVIDER_PRESETS, getPreset } from '../lib/ai/providers';
import type {
  AiFunctionKey,
  ChatMode,
  KeyStatus,
  ModelChoice,
  ModelInfo,
  ProviderId,
  UserAiSettings,
} from '../lib/ai/types';

type Msg = { type: 'success' | 'error' | 'info'; text: string } | null;

const FUNCTIONS: { key: AiFunctionKey; label: string; desc: string; icon: string }[] = [
  { key: 'chat', label: 'Chat e planejamento', desc: 'Conversa, entendimento do pedido e planejamento das ações.', icon: 'chat' },
  { key: 'writer', label: 'Redação', desc: 'Escrita e reescrita dos textos técnicos do documento.', icon: 'edit_note' },
  { key: 'vision', label: 'Visão (fotos)', desc: 'Análise e legendagem das fotos. Exige modelo com visão.', icon: 'image_search' },
  { key: 'reviewer', label: 'Revisão', desc: 'Revisão de texto, coerência e ortografia.', icon: 'fact_check' },
];

const MODES: { id: ChatMode; label: string; desc: string }[] = [
  { id: 'chat_only', label: 'Somente conversa', desc: 'A IA apenas responde e sugere. Não altera o documento.' },
  { id: 'propose', label: 'Propor alterações', desc: 'A IA propõe mudanças e você aprova cada uma antes de aplicar.' },
  { id: 'autonomous', label: 'Autônomo', desc: 'A IA aplica as alterações diretamente (você pode desfazer depois).' },
];

const inputCls =
  'w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm text-slate-800 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-primary/40';
const btnPrimary =
  'inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed';
const btnSecondary =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-300 dark:border-slate-600 px-4 py-2 text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed';

const MsgBox: React.FC<{ msg: Msg }> = ({ msg }) => {
  if (!msg) return null;
  const cls =
    msg.type === 'success'
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
      : msg.type === 'error'
      ? 'bg-red-50 text-red-800 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800'
      : 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800';
  const icon = msg.type === 'success' ? 'check_circle' : msg.type === 'error' ? 'error' : 'info';
  return (
    <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${cls}`} role="status">
      <span className="material-symbols-outlined text-base mt-0.5">{icon}</span>
      <span className="break-words min-w-0">{msg.text}</span>
    </div>
  );
};

/** Dropdown pesquisavel de modelos. */
const ModelPicker: React.FC<{
  models: ModelInfo[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
  placeholder?: string;
}> = ({ models, value, onChange, disabled, placeholder }) => {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = t
      ? models.filter((m) => m.id.toLowerCase().includes(t) || (m.name || '').toLowerCase().includes(t))
      : models;
    return list.slice(0, 200);
  }, [models, q]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`${inputCls} flex items-center justify-between text-left disabled:opacity-60`}
      >
        <span className={`truncate ${value ? '' : 'text-slate-400'}`}>{value || placeholder || 'Selecione um modelo'}</span>
        <span className="material-symbols-outlined text-base">expand_more</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 shadow-xl">
          <div className="p-2 border-b border-slate-200 dark:border-slate-700">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Pesquisar modelo..."
              className={inputCls}
            />
          </div>
          <ul className="max-h-64 overflow-y-auto py-1">
            {filtered.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">Nenhum modelo encontrado.</li>}
            {filtered.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(m.id);
                    setOpen(false);
                    setQ('');
                  }}
                  className={`w-full text-left px-3 py-1.5 text-sm hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2 ${
                    m.id === value ? 'font-bold text-primary' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  <span className="truncate flex-1">{m.id}</span>
                  {m.vision && (
                    <span className="flex items-center gap-0.5 text-[10px] font-bold uppercase rounded bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300 px-1.5 py-0.5">
                      <span className="material-symbols-outlined text-xs">visibility</span>visão
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const AiSettings: React.FC = () => {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<KeyStatus[]>([]);
  const [settings, setSettings] = useState<UserAiSettings>({ ...DEFAULT_USER_SETTINGS });

  // Provedor em edicao
  const [selected, setSelected] = useState<ProviderId>('openrouter');
  const [apiKey, setApiKey] = useState('');
  const [baseUrl, setBaseUrl] = useState('');
  const [busy, setBusy] = useState<'save' | 'test' | 'delete' | 'models' | null>(null);
  const [providerMsg, setProviderMsg] = useState<Msg>(null);

  // Modelos por provedor (cache)
  const [modelsByProvider, setModelsByProvider] = useState<Partial<Record<ProviderId, ModelInfo[]>>>({});
  const [modelsLoading, setModelsLoading] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [modelsError, setModelsError] = useState<Partial<Record<ProviderId, string>>>({});

  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<Msg>(null);

  const statusOf = useCallback(
    (id: ProviderId) => statuses.find((s) => s.provider === id),
    [statuses]
  );
  const configuredIds = useMemo(
    () => PROVIDER_PRESETS.filter((p) => statusOf(p.id)?.configured).map((p) => p.id),
    [statusOf]
  );

  const baseUrlFor = useCallback(
    (id: ProviderId): string | undefined => (id === 'custom' ? statusOf('custom')?.baseUrl || undefined : undefined),
    [statusOf]
  );

  const fetchModels = useCallback(
    async (id: ProviderId, base?: string, force = false): Promise<ModelInfo[]> => {
      if (!force && modelsByProvider[id]) return modelsByProvider[id]!;
      setModelsLoading((m) => ({ ...m, [id]: true }));
      setModelsError((m) => ({ ...m, [id]: undefined }));
      try {
        const list = await listModels(id, base);
        list.sort((a, b) => a.id.localeCompare(b.id));
        setModelsByProvider((m) => ({ ...m, [id]: list }));
        return list;
      } catch (e: any) {
        setModelsError((m) => ({ ...m, [id]: e?.message || 'Falha ao buscar modelos.' }));
        return [];
      } finally {
        setModelsLoading((m) => ({ ...m, [id]: false }));
      }
    },
    [modelsByProvider]
  );

  // Carga inicial
  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [st, us] = await Promise.all([keyStatus(), loadUserSettings()]);
        if (cancelled) return;
        setStatuses(st);
        setSettings(us);
        const first = st.find((s) => s.configured);
        if (first) setSelected(first.provider);
      } catch (e: any) {
        if (!cancelled) setLoadError(e?.message || 'Não foi possível carregar as configurações.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Ao trocar de provedor, limpa campos sensiveis e carrega modelos se ja configurado
  useEffect(() => {
    setApiKey('');
    setProviderMsg(null);
    const st = statusOf(selected);
    setBaseUrl(selected === 'custom' ? st?.baseUrl || '' : '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  // Carrega modelos dos provedores usados nas funcoes (para validar escolhas salvas)
  useEffect(() => {
    if (loading || loadError) return;
    const used = new Set<ProviderId>();
    (Object.values(settings.models) as (ModelChoice | undefined)[]).forEach((c) => {
      if (c && statusOf(c.provider)?.configured) used.add(c.provider);
    });
    if (statusOf(selected)?.configured) used.add(selected);
    used.forEach((id) => {
      if (!modelsByProvider[id] && !modelsLoading[id] && !modelsError[id]) {
        fetchModels(id, baseUrlFor(id));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, loadError, statuses, selected, settings.models]);

  const refreshStatuses = async () => {
    const st = await keyStatus();
    setStatuses(st);
    return st;
  };

  const preset = getPreset(selected);
  const selStatus = statusOf(selected);
  const needsBase = selected === 'custom';
  const effectiveBase = needsBase ? baseUrl.trim() : undefined;

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return setProviderMsg({ type: 'error', text: 'Cole a chave de API antes de salvar.' });
    if (needsBase && !effectiveBase) return setProviderMsg({ type: 'error', text: 'Informe a URL base do servidor.' });
    setBusy('save');
    setProviderMsg(null);
    try {
      await saveKey(selected, apiKey.trim(), effectiveBase);
      setApiKey('');
      await refreshStatuses();
      setProviderMsg({ type: 'success', text: 'Chave salva com segurança. Buscando modelos disponíveis...' });
      const list = await fetchModels(selected, effectiveBase, true);
      setProviderMsg({
        type: 'success',
        text: list.length
          ? `Chave salva. ${list.length} modelos disponíveis.`
          : 'Chave salva, mas não foi possível listar modelos. Use "Testar conexão" para verificar.',
      });
    } catch (e: any) {
      setProviderMsg({ type: 'error', text: e?.message || 'Falha ao salvar a chave.' });
    } finally {
      setBusy(null);
    }
  };

  const handleTest = async () => {
    if (!selStatus?.configured) {
      return setProviderMsg({ type: 'error', text: 'Salve a chave primeiro para testar a conexão.' });
    }
    setBusy('test');
    setProviderMsg(null);
    const base = needsBase ? effectiveBase || selStatus.baseUrl : undefined;
    const r = await testConnection(selected, base);
    if (r.ok) {
      const list = await fetchModels(selected, base, true);
      setProviderMsg({
        type: 'success',
        text: `Conexão OK${r.message ? ` - ${r.message}` : ''}. ${list.length} modelos disponíveis.`,
      });
    } else {
      setProviderMsg({ type: 'error', text: r.message || 'A conexão falhou. Verifique a chave e a URL.' });
    }
    setBusy(null);
  };

  const handleDelete = async () => {
    if (!window.confirm(`Remover a chave de ${preset.name}? Funções que usam este provedor deixarão de funcionar.`)) return;
    setBusy('delete');
    setProviderMsg(null);
    try {
      await deleteKey(selected);
      await refreshStatuses();
      setModelsByProvider((m) => {
        const c = { ...m };
        delete c[selected];
        return c;
      });
      setProviderMsg({ type: 'success', text: 'Chave removida.' });
    } catch (e: any) {
      setProviderMsg({ type: 'error', text: e?.message || 'Falha ao remover a chave.' });
    } finally {
      setBusy(null);
    }
  };

  // ------------------------------------------------ Modelos por funcao
  const setChoice = (fn: AiFunctionKey, choice: ModelChoice | undefined) => {
    setSettings((s) => {
      const models = { ...s.models };
      if (choice) models[fn] = choice;
      else delete models[fn];
      return { ...s, models };
    });
    setSaveMsg(null);
  };

  const changeProvider = (fn: AiFunctionKey, provider: ProviderId | '') => {
    if (!provider) return setChoice(fn, undefined);
    setChoice(fn, { provider, model: '', baseUrl: provider === 'custom' ? baseUrlFor(provider) : undefined });
    fetchModels(provider, baseUrlFor(provider));
  };

  const useSameForAll = () => {
    const src = settings.models.chat;
    if (!src?.provider || !src.model) {
      return setSaveMsg({ type: 'error', text: 'Escolha primeiro o provedor e o modelo de "Chat e planejamento".' });
    }
    const list = modelsByProvider[src.provider] || [];
    const hasVision = list.find((m) => m.id === src.model)?.vision;
    const next = { ...settings.models };
    (['writer', 'reviewer'] as AiFunctionKey[]).forEach((k) => (next[k] = { ...src }));
    if (hasVision) next.vision = { ...src };
    setSettings((s) => ({ ...s, models: next }));
    setSaveMsg(
      hasVision
        ? { type: 'info', text: 'Mesmo modelo aplicado a todas as funções. Lembre-se de salvar.' }
        : { type: 'info', text: 'Aplicado a chat, redação e revisão. O modelo escolhido não tem visão, então a função Visão não foi alterada.' }
    );
  };

  const handleSaveSettings = async () => {
    if (!settings.privacyAccepted) {
      return setSaveMsg({ type: 'error', text: 'Aceite o aviso de privacidade para salvar.' });
    }
    // Valida contra listas reais conhecidas
    for (const f of FUNCTIONS) {
      const c = settings.models[f.key];
      if (!c) continue;
      if (!c.model) return setSaveMsg({ type: 'error', text: `Escolha um modelo para "${f.label}" ou remova o provedor.` });
      const list = modelsByProvider[c.provider];
      if (list && list.length && !list.some((m) => m.id === c.model)) {
        return setSaveMsg({ type: 'error', text: `O modelo "${c.model}" de "${f.label}" não está na lista do provedor. Escolha outro.` });
      }
    }
    setSaving(true);
    setSaveMsg(null);
    try {
      await saveUserSettings(settings);
      setSaveMsg({ type: 'success', text: 'Configurações salvas.' });
    } catch (e: any) {
      setSaveMsg({ type: 'error', text: e?.message || 'Falha ao salvar as configurações.' });
    } finally {
      setSaving(false);
    }
  };

  // ------------------------------------------------ Render
  if (!user) {
    return (
      <div className="p-8 max-w-3xl mx-auto">
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 text-center text-slate-600 dark:text-slate-300">
          <span className="material-symbols-outlined text-4xl text-slate-400">lock</span>
          <p className="mt-2 font-bold">Faça login para configurar o assistente de IA.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center gap-2 text-slate-500">
        <span className="material-symbols-outlined animate-spin">progress_activity</span> Carregando configurações...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="p-8 max-w-3xl mx-auto space-y-3">
        <MsgBox msg={{ type: 'error', text: loadError }} />
        <button className={btnSecondary} onClick={() => window.location.reload()}>
          <span className="material-symbols-outlined text-base">refresh</span> Tentar novamente
        </button>
      </div>
    );
  }

  const cardCls = 'rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 shadow-sm';

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">
          <span className="material-symbols-outlined text-primary">smart_toy</span> Assistente de IA
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Configure o provedor, a chave de API e o modelo usado em cada função. Você usa a sua própria chave.
        </p>
      </div>

      {/* 1. Provedores */}
      <section className={cardCls}>
        <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-3">1. Provedor e chave de API</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {PROVIDER_PRESETS.map((p) => {
            const st = statusOf(p.id);
            const active = p.id === selected;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                className={`text-left rounded-lg border-2 p-3 transition ${
                  active
                    ? 'border-primary bg-primary/5'
                    : 'border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{p.name}</span>
                  <span
                    className={`text-[10px] font-bold uppercase rounded px-1.5 py-0.5 whitespace-nowrap ${
                      st?.configured
                        ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                    }`}
                  >
                    {st?.configured ? 'Configurado' : 'Sem chave'}
                  </span>
                </div>
                <div className="mt-1 text-xs text-slate-500 font-mono truncate">
                  {st?.configured ? st.hint || 'chave salva' : p.keyHint}
                </div>
              </button>
            );
          })}
        </div>

        <div className="mt-5 space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-bold text-slate-800 dark:text-slate-100">{preset.name}</h3>
            <a
              href={preset.docsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-primary font-bold inline-flex items-center gap-1 hover:underline"
            >
              Onde criar a chave <span className="material-symbols-outlined text-base">open_in_new</span>
            </a>
          </div>

          {needsBase && (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">URL base (compatível com OpenAI)</label>
              <input
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://meu-servidor.com/v1"
                className={inputCls}
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
              Chave de API {selStatus?.configured && <span className="normal-case font-normal">(já salva: {selStatus.hint || '••••'} - cole outra para substituir)</span>}
            </label>
            <input
              type="password"
              autoComplete="new-password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={preset.keyHint}
              className={inputCls}
            />
            <p className="text-xs text-slate-500 mt-1">A chave é guardada de forma segura no servidor e nunca é exibida novamente.</p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button className={btnPrimary} onClick={handleSaveKey} disabled={busy !== null || !apiKey.trim()}>
              <span className="material-symbols-outlined text-base">{busy === 'save' ? 'progress_activity' : 'save'}</span>
              {busy === 'save' ? 'Salvando...' : 'Salvar chave'}
            </button>
            <button className={btnSecondary} onClick={handleTest} disabled={busy !== null || !selStatus?.configured}>
              <span className="material-symbols-outlined text-base">{busy === 'test' ? 'progress_activity' : 'network_check'}</span>
              {busy === 'test' ? 'Testando...' : 'Testar conexão'}
            </button>
            <button
              className={`${btnSecondary} !text-red-600 !border-red-300`}
              onClick={handleDelete}
              disabled={busy !== null || !selStatus?.configured}
            >
              <span className="material-symbols-outlined text-base">delete</span> Remover chave
            </button>
          </div>
          <MsgBox msg={providerMsg} />

          {selStatus?.configured && (
            <div>
              <label className="block text-xs font-bold uppercase text-slate-500 mb-1">
                Modelos disponíveis {modelsByProvider[selected] ? `(${modelsByProvider[selected]!.length})` : ''}
              </label>
              {modelsLoading[selected] ? (
                <p className="text-sm text-slate-500">Buscando modelos...</p>
              ) : modelsError[selected] ? (
                <MsgBox msg={{ type: 'error', text: modelsError[selected]! }} />
              ) : (
                <ModelPicker
                  models={modelsByProvider[selected] || []}
                  value=""
                  onChange={() => {}}
                  placeholder="Pesquisar na lista de modelos (apenas consulta)"
                />
              )}
            </div>
          )}
        </div>
      </section>

      {/* 2. Modelo por funcao */}
      <section className={cardCls}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <h2 className="font-bold text-lg text-slate-800 dark:text-white">2. Modelo por função</h2>
          <button className={btnSecondary} onClick={useSameForAll} disabled={configuredIds.length === 0}>
            <span className="material-symbols-outlined text-base">content_copy</span> Usar o mesmo modelo para tudo
          </button>
        </div>
        <p className="text-sm text-slate-500 mb-4">
          Só aparecem provedores com chave configurada. As sugestões abaixo são apenas dicas: o modelo precisa existir na lista do provedor.
        </p>

        {configuredIds.length === 0 && (
          <MsgBox msg={{ type: 'info', text: 'Configure a chave de ao menos um provedor acima para escolher modelos.' }} />
        )}

        <div className="space-y-4">
          {FUNCTIONS.map((f) => {
            const choice = settings.models[f.key];
            const prov = choice?.provider;
            const all = prov ? modelsByProvider[prov] || [] : [];
            const isVision = f.key === 'vision';
            const list = isVision ? all.filter((m) => m.vision) : all;
            const loadingM = prov ? !!modelsLoading[prov] : false;
            const err = prov ? modelsError[prov] : undefined;
            const suggestion = prov ? DEFAULT_MODELS[prov]?.[f.key] : undefined;
            const suggestionValid = suggestion && list.some((m) => m.id === suggestion);
            const modelMissing = !!choice?.model && all.length > 0 && !all.some((m) => m.id === choice.model);
            const visionNoneAvailable = isVision && prov && !loadingM && !err && all.length > 0 && list.length === 0;
            const visionNotCapable =
              isVision && choice?.model && all.length > 0 && !modelMissing && !all.find((m) => m.id === choice.model)?.vision;

            return (
              <div key={f.key} className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">{f.icon}</span>
                  <h3 className="font-bold text-slate-800 dark:text-slate-100">{f.label}</h3>
                </div>
                <p className="text-xs text-slate-500 mb-3">{f.desc}</p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <select
                    value={prov && configuredIds.includes(prov) ? prov : ''}
                    onChange={(e) => changeProvider(f.key, e.target.value as ProviderId | '')}
                    className={inputCls}
                    disabled={configuredIds.length === 0}
                  >
                    <option value="">{prov && !configuredIds.includes(prov) ? `${getPreset(prov).name} (sem chave)` : 'Provedor...'}</option>
                    {configuredIds.map((id) => (
                      <option key={id} value={id}>
                        {getPreset(id).name}
                      </option>
                    ))}
                  </select>
                  <div className="md:col-span-2">
                    <ModelPicker
                      models={list}
                      value={choice?.model || ''}
                      onChange={(id) => prov && setChoice(f.key, { ...choice!, model: id })}
                      disabled={!prov || !configuredIds.includes(prov) || loadingM}
                      placeholder={loadingM ? 'Carregando modelos...' : isVision ? 'Modelo com visão' : 'Selecione um modelo'}
                    />
                  </div>
                </div>

                {suggestion && (
                  <p className="text-xs text-slate-500 mt-2">
                    Sugestão: <span className="font-mono">{suggestion}</span>{' '}
                    {suggestionValid ? (
                      <button
                        type="button"
                        className="text-primary font-bold hover:underline"
                        onClick={() => setChoice(f.key, { ...choice!, model: suggestion })}
                      >
                        usar
                      </button>
                    ) : all.length > 0 ? (
                      <span className="italic">(não encontrado na lista deste provedor{isVision ? ' / sem visão' : ''})</span>
                    ) : null}
                  </p>
                )}

                {err && <div className="mt-2"><MsgBox msg={{ type: 'error', text: `Não foi possível listar modelos: ${err}` }} /></div>}
                {modelMissing && (
                  <div className="mt-2">
                    <MsgBox msg={{ type: 'error', text: `O modelo salvo "${choice!.model}" não existe mais na lista do provedor. Escolha outro.` }} />
                  </div>
                )}
                {visionNoneAvailable && (
                  <div className="mt-2">
                    <MsgBox msg={{ type: 'error', text: 'Nenhum modelo com visão disponível neste provedor. Escolha outro provedor para analisar fotos.' }} />
                  </div>
                )}
                {visionNotCapable && (
                  <div className="mt-2">
                    <MsgBox msg={{ type: 'error', text: 'O modelo escolhido não suporta imagens. Escolha um modelo marcado com "visão".' }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. Modo padrao */}
      <section className={cardCls}>
        <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-3">3. Modo padrão</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {MODES.map((m) => {
            const active = settings.defaultMode === m.id;
            return (
              <label
                key={m.id}
                className={`cursor-pointer rounded-lg border-2 p-3 ${
                  active ? 'border-primary bg-primary/5' : 'border-slate-200 dark:border-slate-700 hover:border-slate-400'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="ai-mode"
                    checked={active}
                    onChange={() => {
                      setSettings((s) => ({ ...s, defaultMode: m.id }));
                      setSaveMsg(null);
                    }}
                  />
                  <span className="font-bold text-sm text-slate-800 dark:text-slate-100">{m.label}</span>
                </div>
                <p className="text-xs text-slate-500 mt-1">{m.desc}</p>
              </label>
            );
          })}
        </div>
      </section>

      {/* 4. Privacidade + salvar */}
      <section className={cardCls}>
        <h2 className="font-bold text-lg text-slate-800 dark:text-white mb-3">4. Privacidade</h2>
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm text-amber-900 dark:text-amber-200">
          <span className="material-symbols-outlined text-base mt-0.5">privacy_tip</span>
          <p>
            Ao usar o assistente, os textos e as fotos das obras e dos documentos são enviados ao provedor de IA que você escolheu.
            Esses dados passam a ser tratados conforme os termos e a política de privacidade desse provedor. Não envie informações
            que você não tenha autorização para compartilhar.
          </p>
        </div>
        <label className="flex items-start gap-2 mt-3 cursor-pointer text-sm text-slate-700 dark:text-slate-200">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={settings.privacyAccepted}
            onChange={(e) => {
              setSettings((s) => ({ ...s, privacyAccepted: e.target.checked }));
              setSaveMsg(null);
            }}
          />
          <span>Entendo e aceito que textos e fotos serão enviados ao provedor de IA escolhido.</span>
        </label>

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className={btnPrimary} onClick={handleSaveSettings} disabled={saving || !settings.privacyAccepted}>
            <span className="material-symbols-outlined text-base">{saving ? 'progress_activity' : 'save'}</span>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </button>
          {!settings.privacyAccepted && <span className="text-xs text-slate-500">Aceite o aviso para habilitar o salvamento.</span>}
        </div>
        <div className="mt-3">
          <MsgBox msg={saveMsg} />
        </div>
      </section>
    </div>
  );
};

export default AiSettings;
