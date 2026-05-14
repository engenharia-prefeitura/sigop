import React, { useEffect, useState } from 'react';
import {
  DEFAULT_AI_SETTINGS,
  checkOllama,
  exportKnowledgePack,
  importKnowledgePackFile,
  loadAiSettings,
  loadKnowledgePack,
  pullModel,
  saveAiSettings,
  saveKnowledgePack,
  type AiKnowledgePack,
  type AiSettings
} from '../lib/localAi';

const toLines = (items: string[]) => items.join('\n');
const fromLines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);

const AI_MODELS = [
  {
    id: 'moondream',
    name: 'Moondream',
    label: 'Muito leve com visao',
    pcProfile: 'PC simples',
    ram: '4 GB livres recomendados',
    disk: 'Aproximadamente 1.7 GB',
    note: 'Melhor para testar a IA em maquinas fracas. Analisa fotos, mas escreve com menos qualidade tecnica.'
  },
  {
    id: 'gemma3:4b',
    name: 'Gemma 3 4B',
    label: 'Leve intermediario',
    pcProfile: '8 a 12 GB RAM',
    ram: '6 a 8 GB livres recomendados',
    disk: 'Aproximadamente 3 GB',
    note: 'Boa opcao intermediaria para texto e imagem, se o computador tiver folga de memoria.'
  },
  {
    id: 'qwen2.5vl:3b',
    name: 'Qwen2.5-VL 3B',
    label: 'Melhor visao leve',
    pcProfile: '16 GB RAM',
    ram: '10 a 12 GB livres recomendados',
    disk: 'Aproximadamente 3.2 GB',
    note: 'Melhor analise visual entre os leves, mas pode falhar em PCs com pouca memoria livre.'
  },
  {
    id: 'qwen2.5vl:7b',
    name: 'Qwen2.5-VL 7B',
    label: 'Mais qualidade',
    pcProfile: '24 a 32 GB RAM',
    ram: '16 GB livres ou mais',
    disk: 'Aproximadamente 6 a 8 GB',
    note: 'Mais pesado. Use apenas em computadores fortes.'
  }
];

const AIAssistantSettings: React.FC = () => {
  const [settings, setSettings] = useState<AiSettings>(DEFAULT_AI_SETTINGS);
  const [pack, setPack] = useState<AiKnowledgePack>(loadKnowledgePack());
  const [status, setStatus] = useState<'idle' | 'online' | 'offline' | 'working'>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [promptsText, setPromptsText] = useState('');
  const [glossaryText, setGlossaryText] = useState('');
  const [referencesText, setReferencesText] = useState('');
  const [examplesText, setExamplesText] = useState('');

  useEffect(() => {
    const loadedSettings = loadAiSettings();
    const loadedPack = loadKnowledgePack();
    setSettings(loadedSettings);
    hydratePack(loadedPack);
  }, []);

  const hydratePack = (nextPack: AiKnowledgePack) => {
    setPack(nextPack);
    setPromptsText(toLines(nextPack.prompts));
    setGlossaryText(toLines(nextPack.glossary));
    setReferencesText(toLines(nextPack.references));
    setExamplesText(toLines(nextPack.approvedExamples));
  };

  const handleSaveSettings = () => {
    saveAiSettings(settings);
    setStatusMessage('Configuracao da IA salva neste computador.');
  };

  const handleCheck = async () => {
    setStatus('working');
    setStatusMessage('Verificando Ollama local...');
    try {
      const data = await checkOllama(settings);
      const modelFound = (data.models || []).some((model: any) => {
        const modelName = String(model.name || '');
        return modelName === settings.model || modelName === `${settings.model}:latest`;
      });
      setStatus('online');
      setStatusMessage(modelFound
        ? `Ollama ativo e modelo ${settings.model} encontrado.`
        : `Ollama ativo, mas o modelo ${settings.model} ainda nao foi baixado.`);
    } catch {
      setStatus('offline');
      setStatusMessage('Ollama nao respondeu neste computador. Baixe e execute o instalador local.');
    }
  };

  const handlePullModel = async () => {
    setStatus('working');
    setStatusMessage(`Baixando ${settings.model}...`);
    try {
      saveAiSettings(settings);
      await pullModel(settings, setStatusMessage);
      setStatus('online');
      setStatusMessage(`Modelo ${settings.model} pronto para uso.`);
    } catch (err: any) {
      setStatus('offline');
      setStatusMessage(err.message || 'Nao foi possivel baixar o modelo.');
    }
  };

  const handleSavePack = () => {
    const nextPack: AiKnowledgePack = {
      ...pack,
      prompts: fromLines(promptsText),
      glossary: fromLines(glossaryText),
      references: fromLines(referencesText),
      approvedExamples: fromLines(examplesText),
      updatedAt: new Date().toISOString()
    };
    saveKnowledgePack(nextPack);
    hydratePack(nextPack);
    setStatusMessage('Pacote de conhecimento salvo localmente.');
  };

  const handleImportPack = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importKnowledgePackFile(file);
      hydratePack(imported);
      setStatusMessage('Pacote de conhecimento importado para este computador.');
    } catch (err: any) {
      alert('Erro ao importar pacote: ' + (err.message || 'arquivo invalido.'));
    } finally {
      event.target.value = '';
    }
  };

  const handleSelectModel = (model: string) => {
    const nextSettings = { ...settings, model };
    setSettings(nextSettings);
    saveAiSettings(nextSettings);
    setStatusMessage(`Modelo selecionado: ${model}. Baixe o instalador unico novamente para instalar este modelo.`);
  };

  const downloadInstaller = () => {
    saveAiSettings(settings);
    const script = `@echo off
setlocal
title SIGOP - Instalador do Assistente IA Local

set "MODEL=${settings.model}"
set "SCRIPT_URL=https://engenharia-prefeitura.github.io/sigop/ai/install_sigop_ai_assistant.ps1"
set "SCRIPT_DIR=%LOCALAPPDATA%\\SIGOP\\AI"
set "SCRIPT_PATH=%SCRIPT_DIR%\\install_sigop_ai_assistant.ps1"

echo.
echo ============================================================
echo  SIGOP - Instalador do Assistente IA Local
echo ============================================================
echo.
echo Modelo selecionado: %MODEL%
echo.
echo Este instalador vai:
echo  1. Verificar ou instalar o Ollama
echo  2. Iniciar o Ollama local
echo  3. Criar a ponte local do SIGOP
echo  4. Baixar o modelo escolhido
echo.
pause

if not exist "%SCRIPT_DIR%" mkdir "%SCRIPT_DIR%"

echo Baixando instalador atualizado do SIGOP...
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Invoke-WebRequest -UseBasicParsing '%SCRIPT_URL%' -OutFile '%SCRIPT_PATH%'"

if errorlevel 1 (
  echo.
  echo Nao foi possivel baixar o instalador atualizado.
  echo Verifique a internet e tente novamente.
  echo.
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_PATH%" -Model "%MODEL%"

if errorlevel 1 (
  echo.
  echo ============================================================
  echo  Nao foi possivel concluir a instalacao automaticamente.
  echo ============================================================
  echo.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  Pronto! Volte ao SIGOP e clique em "Verificar IA local".
echo ============================================================
echo.
pause
`;
    const blob = new Blob([script], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `INSTALAR_ASSISTENTE_IA_SIGOP_${settings.model.replace(/[^a-z0-9]+/gi, '_')}.bat`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 p-4 pb-32 lg:p-10">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Assistente IA Local</h1>
        <p className="max-w-3xl text-sm font-medium text-slate-500">
          Configure uma IA gratuita no computador do usuario para apoiar laudos, pericias, relatorios fotograficos e documentos tecnicos. O conhecimento fica local e pode ser exportado ou importado.
        </p>
      </div>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">Instalacao e Modelo</h2>
              <p className="mt-1 text-sm text-slate-500">
                O SIGOP usa uma ponte local em http://localhost:11435 para conversar com o Ollama instalado neste computador.
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-[10px] font-black uppercase ${status === 'online' ? 'bg-emerald-100 text-emerald-700' : status === 'offline' ? 'bg-red-100 text-red-700' : status === 'working' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
              {status === 'online' ? 'Pronto' : status === 'offline' ? 'Offline' : status === 'working' ? 'Processando' : 'Nao verificado'}
            </span>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Endpoint local</label>
              <input
                value={settings.endpoint}
                onChange={event => setSettings({ ...settings, endpoint: event.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-[10px] font-black uppercase tracking-widest text-slate-400">Modelo</label>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {AI_MODELS.map(model => (
                  <button
                    key={model.id}
                    onClick={() => handleSelectModel(model.id)}
                    className={`rounded-2xl border p-4 text-left transition-all ${settings.model === model.id ? 'border-primary bg-blue-50 ring-2 ring-primary/10' : 'border-slate-200 bg-slate-50 hover:border-primary/60 dark:border-slate-700 dark:bg-slate-900'}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{model.name}</p>
                        <p className="mt-1 text-[10px] font-black uppercase text-primary">{model.label}</p>
                      </div>
                      <span
                        className="material-symbols-outlined text-[18px] text-slate-400"
                        title={`Perfil: ${model.pcProfile}\nRAM: ${model.ram}\nDisco: ${model.disk}\n${model.note}`}
                      >
                        info
                      </span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{model.pcProfile}</span>
                      <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold uppercase text-slate-500">{model.ram}</span>
                    </div>
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] font-bold uppercase text-slate-400">Passe o mouse no icone de informacao para ver requisitos. Se der erro de memoria, escolha um modelo mais leve.</p>
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button onClick={handleSaveSettings} className="rounded-xl border border-slate-200 px-5 py-3 text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary">
              Salvar configuracao
            </button>
            <button onClick={handleCheck} className="rounded-xl bg-slate-800 px-5 py-3 text-xs font-black uppercase text-white hover:bg-black">
              Verificar IA local
            </button>
            <button onClick={handlePullModel} disabled={status === 'working'} className="rounded-xl bg-primary px-5 py-3 text-xs font-black uppercase text-white hover:bg-blue-700 disabled:opacity-50">
              Baixar modelo
            </button>
            <button onClick={downloadInstaller} className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black uppercase text-white hover:bg-emerald-700">
              Baixar instalador unico
            </button>
          </div>

          {statusMessage && (
            <div className="mt-5 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
              {statusMessage}
            </div>
          )}
        </div>

        <div className="rounded-3xl border border-blue-100 bg-blue-50 p-6 text-blue-950 shadow-sm">
          <h3 className="text-lg font-black">Como instalar</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm font-medium">
            <li>Baixe o instalador unico em arquivo BAT.</li>
            <li>Abra o arquivo baixado e confirme a execucao no Windows.</li>
            <li>Volte aqui e clique em Verificar IA local.</li>
            <li>Se aparecer erro de conexao, execute o mesmo instalador unico novamente.</li>
          </ol>
          <p className="mt-4 text-xs font-bold uppercase text-blue-700">
            A instalacao nao usa Supabase. O modelo e o conhecimento ficam no PC do usuario.
          </p>
        </div>
      </section>

      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="text-xl font-black text-slate-900 dark:text-white">Pacote de Conhecimento Local</h2>
            <p className="mt-1 max-w-3xl text-sm text-slate-500">
              Use este pacote para compartilhar o estilo tecnico, glossario, referencias locais e exemplos aprovados entre computadores sem ocupar espaco no banco gratuito.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportKnowledgePack} className="rounded-xl border border-slate-200 px-4 py-3 text-xs font-black uppercase text-slate-700 hover:border-primary hover:text-primary">
              Exportar
            </button>
            <label className="cursor-pointer rounded-xl bg-slate-800 px-4 py-3 text-xs font-black uppercase text-white hover:bg-black">
              Importar
              <input type="file" accept=".json,application/json" className="hidden" onChange={handleImportPack} />
            </label>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Nome</label>
            <input value={pack.name} onChange={event => setPack({ ...pack, name: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Versao</label>
            <input value={pack.version} onChange={event => setPack({ ...pack, version: event.target.value })} className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900" />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">Atualizado em</label>
            <input value={new Date(pack.updatedAt).toLocaleString('pt-BR')} readOnly className="w-full rounded-xl border border-slate-200 bg-slate-100 p-3 text-sm font-bold text-slate-500 dark:border-slate-700 dark:bg-slate-900" />
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <TextAreaBlock title="Prompts padrao" value={promptsText} onChange={setPromptsText} />
          <TextAreaBlock title="Glossario tecnico" value={glossaryText} onChange={setGlossaryText} />
          <TextAreaBlock title="Referencias locais" value={referencesText} onChange={setReferencesText} />
          <TextAreaBlock title="Exemplos aprovados" value={examplesText} onChange={setExamplesText} />
        </div>

        <button onClick={handleSavePack} className="mt-6 rounded-xl bg-primary px-6 py-4 text-xs font-black uppercase text-white hover:bg-blue-700">
          Salvar conhecimento local
        </button>
      </section>
    </div>
  );
};

const TextAreaBlock = ({ title, value, onChange }: { title: string; value: string; onChange: (value: string) => void }) => (
  <div>
    <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</label>
    <textarea
      value={value}
      onChange={event => onChange(event.target.value)}
      className="h-48 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm leading-relaxed outline-none focus:border-primary dark:border-slate-700 dark:bg-slate-900"
      placeholder="Uma entrada por linha..."
    />
  </div>
);

export default AIAssistantSettings;
