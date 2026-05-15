
import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { isNoRowsError } from '../lib/supabaseCompat';
import { notifyAiVisibilityChanged, normalizeAiAssistantEnabled } from '../lib/aiVisibility';
import * as XLSX from 'xlsx';

const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [myProfile, setMyProfile] = useState<any>(null);
  const [settings, setSettings] = useState<any>({
    company_name: '',
    header_text: '',
    company_logo_url: '',
    ai_assistant_enabled: true
  });

  // Pessoas
  const [pessoas, setPessoas] = useState<any[]>([]);
  const [searchPessoa, setSearchPessoa] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  const [editingPessoa, setEditingPessoa] = useState<any>(null);

  // Tipos de Documentos Técnicos
  const [documentTypes, setDocumentTypes] = useState<any[]>([]);
  const [newDocType, setNewDocType] = useState({ name: '', description: '' });

  // Fiscalização
  const [infracoes, setInfracoes] = useState<any[]>([]);
  const [tiposNotificacao, setTiposNotificacao] = useState<any[]>([]);
  const [editingInfracao, setEditingInfracao] = useState<any>(null);
  const [editingTipoNotif, setEditingTipoNotif] = useState<any>(null);
  const [editingDocType, setEditingDocType] = useState<any>(null);

  // Obras (Campos Personalizados)
  const [projectFields, setProjectFields] = useState<any[]>([]);
  const [editingField, setEditingField] = useState<any>(null);
  const [fieldTypes] = useState(['text', 'number', 'date', 'boolean', 'select']);

  useEffect(() => {
    fetchAuth();
    fetchSettings();
    // fetchPessoas(); 
    fetchDocTypes();
    fetchFiscalizacao();
    fetchProjectFields();
  }, []);

  const fetchAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      setCurrentUser(user);
      const { data, error } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
      if (error && !isNoRowsError(error)) throw error;
      setMyProfile(data);
    }
  };

  const fetchSettings = async () => {
    const { data } = await supabase.from('app_settings').select('*').maybeSingle();
    if (data) {
      setSettings({
        company_name: data.company_name || '',
        header_text: data.header_text || '',
        company_logo_url: data.company_logo_url || '',
        ai_assistant_enabled: normalizeAiAssistantEnabled(data)
      });
    }
  };

  const fetchPessoas = async () => {
    // Only search if there is a term, or if explicitly requested (e.g. Empty search to clear?)
    // User asked to NOT show any if not searching.
    if (!searchPessoa.trim()) {
      setPessoas([]);
      return;
    }

    const terms = searchPessoa.trim().split(/\s+/);
    let query = supabase.from('pessoas').select('*').limit(50);

    // Construct query to match ALL terms (AND logic)
    // For 'joao batista', it becomes: nome ilike %joao% AND nome ilike %batista%
    // Supabase JS client doesn't support dynamic chaining for ANDs on the same column easily without raw filters or multiple .ilike() which might be OR depending on version, 
    // but chaining .ilike() usually works as AND in newer versions or use .or() for OR. 
    // Actually, chaining .ilike('nome', '%...%').ilike('nome', '%...%') is functional AND.

    terms.forEach(term => {
      query = query.ilike('nome', `%${term}%`);
    });

    // Also allow searching by CPF/CNPJ (simple contains) - this is tricky with the above AND logic for name.
    // If we want Name matching terms OR CPF matching term.
    // Complex OR logic with split terms is hard in simple query builder.
    // Simplified approach: If it looks like numbers, search CPF. Else search Name with terms.

    const isNumeric = /^\d+$/.test(searchPessoa.replace(/\D/g, ''));

    if (isNumeric && searchPessoa.length > 4) {
      // Override for document search
      const cleanDoc = searchPessoa.replace(/\D/g, '');
      query = supabase.from('pessoas').select('*').ilike('cpf_cnpj', `%${cleanDoc}%`).limit(50);
    }

    const { data } = await query;
    setPessoas(data || []);
  };

  const fetchDocTypes = async () => {
    const { data } = await supabase.from('document_types').select('*').order('name');
    setDocumentTypes(data || []);
  };

  const fetchFiscalizacao = async () => {
    const { data: inf } = await supabase.from('config_infracoes').select('*').order('titulo');
    const { data: tip } = await supabase.from('config_tipos_notificacao').select('*').order('nome');
    setInfracoes(inf || []);
    setTiposNotificacao(tip || []);
  };

  const fetchProjectFields = async () => {
    const { data } = await supabase.from('project_field_definitions').select('*').order('order_index');
    setProjectFields(data || []);
  };

  const handleSaveSettings = async () => {
    setLoading(true);
    const baseSettingsPayload = {
      company_name: settings.company_name || '',
      header_text: settings.header_text || '',
      company_logo_url: settings.company_logo_url || ''
    };
    const settingsPayload = myProfile?.is_admin
      ? { ...baseSettingsPayload, ai_assistant_enabled: settings.ai_assistant_enabled !== false }
      : baseSettingsPayload;

    // Garantir que estamos atualizando a linha correta ou inserindo uma nova
    const { data: existing } = await supabase.from('app_settings').select('id').maybeSingle();

    let error;
    if (existing) {
      const { error: err } = await supabase.from('app_settings').update(settingsPayload).eq('id', existing.id);
      error = err;
    } else {
      const { error: err } = await supabase.from('app_settings').insert([settingsPayload]);
      error = err;
    }

    if (error) {
      const message = error.message || '';
      if (/ai_assistant_enabled|schema cache|column/i.test(message)) {
        let fallbackError = null;
        if (existing) {
          const { error: err } = await supabase.from('app_settings').update(baseSettingsPayload).eq('id', existing.id);
          fallbackError = err;
        } else {
          const { error: err } = await supabase.from('app_settings').insert([baseSettingsPayload]);
          fallbackError = err;
        }

        if (fallbackError) {
          alert('Erro ao salvar: ' + fallbackError.message);
        } else {
          alert('Dados institucionais salvos. Para ativar o controle global da IA, execute o script documentation/setup_ai_visibility_setting.sql no Supabase e salve novamente.');
        }
      } else {
        alert('Erro ao salvar: ' + message);
      }
    } else {
      notifyAiVisibilityChanged();
      alert('Configurações institucionais salvas!');
    }
    setLoading(false);
  };

  const handleUploadLogo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setSettings({ ...settings, company_logo_url: base64 });
    };
  };

  const handleUploadSignature = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async (event) => {
      const base64 = event.target?.result as string;
      setLoading(true);
      const { error } = await supabase.from('profiles').update({ signature_url: base64 }).eq('id', currentUser.id);
      if (!error) {
        setMyProfile({ ...myProfile, signature_url: base64 });
        alert('Assinatura atualizada!');
      }
      setLoading(false);
    };
  };

  // CRUD Fiscalização
  const handleSaveInfracao = async (inf: any) => {
    if (!inf.titulo) return;
    const { id, ...data } = inf;
    if (id) await supabase.from('config_infracoes').update(data).eq('id', id);
    else await supabase.from('config_infracoes').insert([data]);
    setEditingInfracao(null);
    fetchFiscalizacao();
  };

  const handleDuplicateInfracao = async (inf: any) => {
    const { id, created_at, ...data } = inf;
    data.titulo = data.titulo + ' (Cópia)';
    await supabase.from('config_infracoes').insert([data]);
    fetchFiscalizacao();
  };

  const handleSaveTipoNotif = async (tip: any) => {
    if (!tip.nome) return;
    const { id, ...data } = tip;
    if (id) await supabase.from('config_tipos_notificacao').update(data).eq('id', id);
    else await supabase.from('config_tipos_notificacao').insert([data]);
    setEditingTipoNotif(null);
    fetchFiscalizacao();
  };

  const handleDuplicateTipoNotif = async (tip: any) => {
    const { id, created_at, ...data } = tip;
    data.nome = data.nome + ' (Cópia)';
    await supabase.from('config_tipos_notificacao').insert([data]);
    fetchFiscalizacao();
  };

  const handleSaveDocType = async (doc: any) => {
    if (!doc.name) return;
    const { id, ...data } = doc;
    if (id) await supabase.from('document_types').update(data).eq('id', id);
    else await supabase.from('document_types').insert([data]);
    setEditingDocType(null);
    fetchDocTypes();
  };

  const handleSavePessoa = async () => {
    if (!editingPessoa.nome) return;
    setLoading(true);
    await supabase.from('pessoas').upsert(editingPessoa);
    setEditingPessoa(null);
    fetchPessoas();
    setLoading(false);
  };

  const normalizeHeader = (value: any) =>
    String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

  const getCell = (row: any[], index: number) =>
    index >= 0 ? String(row[index] || '').trim() : '';

  const cleanDocument = (value: any) =>
    String(value || '').replace(/\D/g, '');

  const normalizeCpfCnpj = (value: any) => {
    const doc = cleanDocument(value);
    if (!doc || /^0+$/.test(doc)) return '';
    return doc;
  };

  const normalizeTipoPessoa = (value: any) => {
    const normalized = normalizeHeader(value);
    if (normalized.includes('fis')) return 'Física';
    if (normalized.includes('jur')) return 'Jurídica';
    return null;
  };

  const normalizeSituacao = (value: any) => {
    const normalized = normalizeHeader(value);
    if (normalized.includes('inativo')) return 'Inativo';
    if (normalized.includes('ativo')) return 'Ativo';
    return 'Ativo';
  };

  const normalizeBoolean = (value: any) => {
    const normalized = normalizeHeader(value);
    return ['sim', 's', 'true', '1', 'yes'].includes(normalized);
  };

  const handleImportPessoasXlsx = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || isImporting) return;

    setIsImporting(true);

    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<any[]>(worksheet, {
        header: 1,
        defval: '',
        raw: false
      });

      const headerIndex = rows.findIndex((row) => {
        const normalized = row.map(normalizeHeader);
        return normalized.includes('codigo') && normalized.some((cell) => cell.includes('cpfcnpj'));
      });

      if (headerIndex === -1) {
        throw new Error('Nao encontrei a linha de cabecalho com Codigo e CPF/CNPJ.');
      }

      const headers = rows[headerIndex].map(normalizeHeader);
      const findColumn = (matcher: (header: string) => boolean) => headers.findIndex(matcher);

      const codigoIndex = findColumn((header) => header === 'codigo');
      const nomeIndex = findColumn((header) => header.startsWith('nome'));
      const tipoIndex = findColumn((header) => header.includes('tipopessoa'));
      const cpfIndex = findColumn((header) => header.includes('cpfcnpj'));
      const situacaoIndex = findColumn((header) => header === 'situacao');
      const cadastroIncompletoIndex = findColumn((header) => header.includes('cadastroincompleto'));

      if (nomeIndex === -1 || cpfIndex === -1) {
        throw new Error('Nao encontrei as colunas Nome e CPF/CNPJ na planilha.');
      }

      const pessoasMap = new Map<string, any>();

      rows.slice(headerIndex + 1).forEach((row) => {
        const nome = getCell(row, nomeIndex);
        if (!nome || nome === '.' || nome.length < 2) return;

        const cpfCnpj = normalizeCpfCnpj(getCell(row, cpfIndex));
        const codigo = getCell(row, codigoIndex);
        const key = cpfCnpj ? `doc:${cpfCnpj}` : codigo ? `codigo:${codigo}` : `nome:${nome.toUpperCase()}`;

        pessoasMap.set(key, {
          codigo: codigo || null,
          nome: nome.toUpperCase(),
          tipo_pessoa: normalizeTipoPessoa(getCell(row, tipoIndex)),
          cpf_cnpj: cpfCnpj || null,
          situacao: normalizeSituacao(getCell(row, situacaoIndex)),
          cadastro_incompleto: normalizeBoolean(getCell(row, cadastroIncompletoIndex))
        });
      });

      const pessoasData = Array.from(pessoasMap.values());
      if (pessoasData.length === 0) {
        throw new Error('Nenhuma pessoa valida encontrada para importar.');
      }

      const batchSize = 500;
      let imported = 0;

      for (let i = 0; i < pessoasData.length; i += batchSize) {
        const batch = pessoasData.slice(i, i + batchSize);
        const { error } = await supabase.from('pessoas').upsert(batch, { onConflict: 'cpf_cnpj' });
        if (error) throw error;
        imported += batch.length;
      }

      alert(`${imported} pessoas importadas com sucesso!`);
      fetchPessoas();
    } catch (err: any) {
      console.error('Erro ao importar pessoas:', err);
      alert(`Erro ao importar pessoas:\n${err.message || err}`);
    } finally {
      event.target.value = '';
      setIsImporting(false);
    }
  };

  const handleSaveField = async () => {
    if (!editingField.label) return;
    setLoading(true);
    const { id, ...data } = editingField;

    // Ensure validation rules are valid JSON (if we were using text input, but we will use objects)
    // We might need to clean up data before sending if it has extra UI props

    if (id) await supabase.from('project_field_definitions').update(data).eq('id', id);
    else await supabase.from('project_field_definitions').insert([{ ...data, order_index: projectFields.length }]);

    setEditingField(null);
    fetchProjectFields();
    setLoading(false);
  };

  const handleDeleteField = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este campo? Os dados existentes podem ser perdidos.')) return;
    await supabase.from('project_field_definitions').delete().eq('id', id);
    fetchProjectFields();
  };

  return (
    <div className="p-4 lg:p-10 max-w-7xl mx-auto pb-32">
      <h1 className="text-3xl font-black mb-8">Gestão do Sistema</h1>

      <div className="flex gap-4 mb-8 border-b dark:border-slate-700 overflow-x-auto whitespace-nowrap scrollbar-hide">
        <button onClick={() => setActiveTab('general')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'general' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Instituição</button>
        <button onClick={() => setActiveTab('signature')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'signature' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Assinatura</button>
        <button onClick={() => setActiveTab('fiscal')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'fiscal' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Fiscalização</button>
        <button onClick={() => setActiveTab('pessoas')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'pessoas' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Pessoas</button>
        <button onClick={() => setActiveTab('doctypes')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'doctypes' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Tipos Doc</button>
        <button onClick={() => setActiveTab('works')} className={`pb-4 px-2 font-bold text-sm uppercase translate-y-[1px] ${activeTab === 'works' ? 'border-b-4 border-primary text-primary' : 'text-gray-400'}`}>Obras (Campos)</button>
      </div>

      {activeTab === 'general' && (
        <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm animate-in fade-in">
          <div className="flex flex-col md:flex-row gap-8 items-start">
            <div className="size-48 border-4 border-dashed rounded-[40px] flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-700 transition-all relative overflow-hidden group shrink-0">
              {settings.company_logo_url ? (
                <img src={settings.company_logo_url} className="w-full h-full object-contain" />
              ) : (
                <><span className="material-symbols-outlined text-4xl text-gray-300">image</span><p className="text-[10px] font-black text-gray-400 mt-2 uppercase">Logo PNG</p></>
              )}
              <input type="file" accept="image/png" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUploadLogo} />
            </div>
            <div className="flex-1 space-y-6 w-full">
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block tracking-widest">Nome da Instituição (Prefeitura/Órgão)</label>
                <input value={settings.company_name || ''} onChange={e => setSettings({ ...settings, company_name: e.target.value })} className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl font-black text-xl focus:border-primary outline-none transition-all" placeholder="Ex: Prefeitura Municipal de..." />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-gray-500 mb-2 block tracking-widest">Secretaria / Setor / Cabeçalho Secundário</label>
                <input value={settings.header_text || ''} onChange={e => setSettings({ ...settings, header_text: e.target.value })} className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl font-bold" placeholder="Ex: Secretaria de Desenvolvimento Urbano" />
              </div>
              {myProfile?.is_admin && (
                <div className="border-t border-slate-200 pt-6 dark:border-slate-700">
                  <div className="flex flex-col gap-4 rounded-2xl bg-slate-50 p-5 dark:bg-slate-900 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="material-symbols-outlined mt-0.5 text-primary">psychology</span>
                      <div>
                        <p className="text-sm font-black uppercase text-slate-900 dark:text-white">Assistente IA Local</p>
                        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">Controle global visivel somente para administradores. Quando desligado, o menu, o editor e a pagina da IA ficam ocultos para todos os usuarios.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      aria-pressed={settings.ai_assistant_enabled !== false}
                      onClick={() => setSettings({ ...settings, ai_assistant_enabled: settings.ai_assistant_enabled === false })}
                      className={`flex min-w-[180px] items-center justify-center gap-2 rounded-xl px-4 py-3 text-xs font-black uppercase transition-all ${
                        settings.ai_assistant_enabled !== false
                          ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 hover:bg-emerald-700'
                          : 'bg-slate-200 text-slate-600 hover:bg-slate-300 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[18px]">{settings.ai_assistant_enabled !== false ? 'visibility' : 'visibility_off'}</span>
                      {settings.ai_assistant_enabled !== false ? 'IA visivel' : 'IA oculta'}
                    </button>
                  </div>
                </div>
              )}
              <button onClick={handleSaveSettings} disabled={loading} className="w-full py-5 bg-primary text-white rounded-3xl font-black text-lg shadow-xl hover:scale-[1.02] transition-all">
                {loading ? 'Salvando...' : 'Salvar Alterações Institucionais'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'signature' && (
        <div className="max-w-xl animate-in fade-in">
          <section className="bg-white dark:bg-slate-800 p-10 rounded-[40px] border dark:border-slate-700 shadow-sm text-center">
            <div className="w-20 h-20 bg-primary/10 text-primary rounded-full flex items-center justify-center mx-auto mb-6"><span className="material-symbols-outlined text-4xl font-black">verified_user</span></div>
            <h3 className="text-2xl font-black mb-2">Sua Assinatura Digital</h3>
            <p className="text-gray-400 font-medium mb-10 text-sm leading-relaxed px-4">Esta imagem será aplicada nos documentos assinados por você. Use arquivos em formato PNG com fundo transparente para melhor resultado.</p>
            <div className="relative mx-auto w-full max-w-[320px] h-32 bg-gray-50 dark:bg-slate-900 rounded-3xl border-2 border-dashed border-gray-200 dark:border-slate-700 flex items-center justify-center overflow-hidden mb-8 group">
              {myProfile?.signature_url ? (
                <img src={myProfile.signature_url} className="w-full h-full object-contain p-4" />
              ) : (
                <span className="text-gray-300 font-black text-xs uppercase tracking-widest">Nenhuma Assinatura</span>
              )}
              <div className="absolute inset-0 bg-primary/90 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer">
                <span className="text-white font-black text-xs uppercase tracking-widest">Fazer Upload</span>
                <input type="file" accept="image/png" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleUploadSignature} />
              </div>
            </div>
          </section>
        </div>
      )}

      {activeTab === 'fiscal' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">Modelos de Documentos de Ação</h3>
              <button onClick={() => setEditingTipoNotif({ nome: '', texto_padrao: '' })} className="bg-primary px-4 py-2 rounded-xl text-white font-bold text-xs uppercase">+ Novo Modelo</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {tiposNotificacao.map(t => (
                <div key={t.id} className="p-5 border dark:border-slate-700 rounded-3xl flex justify-between bg-white dark:bg-slate-800 shadow-sm hover:border-primary transition-all group">
                  <div className="flex-1 mr-4"><p className="font-black text-sm uppercase text-gray-800 dark:text-white">{t.nome}</p><p className="text-[10px] text-gray-400 line-clamp-2 mt-1">{t.texto_padrao}</p></div>
                  <div className="flex gap-1">
                    <button onClick={() => handleDuplicateTipoNotif(t)} className="p-2 text-blue-400 hover:bg-blue-50 rounded-lg" title="Duplicar"><span className="material-symbols-outlined text-[18px]">content_copy</span></button>
                    <button onClick={() => setEditingTipoNotif(t)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg" title="Editar"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                    <button onClick={() => { if (confirm('Excluir?')) supabase.from('config_tipos_notificacao').delete().eq('id', t.id).then(fetchFiscalizacao) }} className="p-2 text-red-100 group-hover:text-red-400 hover:bg-red-50 rounded-lg" title="Excluir"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-black">Modelos de Enquadramento Legal</h3>
              <button onClick={() => setEditingInfracao({ titulo: '', descricao: '', fundamentacao: '' })} className="bg-emerald-600 px-4 py-2 rounded-xl text-white font-bold text-xs uppercase">+ Novo Enquadramento</button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {infracoes.map(inf => (
                <div key={inf.id} className="p-6 border dark:border-slate-700 rounded-3xl bg-white dark:bg-slate-800 shadow-sm relative group hover:border-emerald-500 transition-all">
                  <p className="font-black text-xs uppercase text-slate-800 dark:text-white mb-1">{inf.titulo}</p>
                  <p className="text-[10px] font-black text-emerald-600 mb-2 uppercase">{inf.fundamentacao}</p>
                  <div className="flex gap-1 absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => handleDuplicateInfracao(inf)} className="p-1.5 text-blue-400 hover:bg-blue-50 rounded-lg" title="Duplicar"><span className="material-symbols-outlined text-[16px]">content_copy</span></button>
                    <button onClick={() => setEditingInfracao(inf)} className="p-1.5 text-amber-500 hover:bg-amber-50 rounded-lg" title="Editar"><span className="material-symbols-outlined text-[16px]">edit</span></button>
                    <button onClick={() => { if (confirm('Excluir?')) supabase.from('config_infracoes').delete().eq('id', inf.id).then(fetchFiscalizacao) }} className="p-1.5 text-red-400 hover:bg-red-50 rounded-lg" title="Excluir"><span className="material-symbols-outlined text-[16px]">delete</span></button>
                  </div>
                  <p className="text-[11px] text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed mt-4">{inf.descricao}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'doctypes' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="text-xl font-black">Tipos de Documentos Técnicos</h3>
              <p className="text-gray-400 font-medium text-sm">Gerencie os tipos de documentos técnicos disponíveis no editor.</p>
            </div>
            <button onClick={() => setEditingDocType({ name: '', description: '' })} className="bg-primary text-white font-black px-6 py-3 rounded-xl shadow-lg hover:scale-105 transition-all text-xs uppercase">Novo Tipo</button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {documentTypes.map(type => (
              <div key={type.id} className="bg-white dark:bg-slate-800 p-6 rounded-[35px] border dark:border-slate-700 shadow-sm hover:border-primary transition-all group relative">
                <div className="flex items-start justify-between mb-4">
                  <div className="size-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center">
                    <span className="material-symbols-outlined">description</span>
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setEditingDocType(type)} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                    <button onClick={() => { if (confirm('Excluir?')) supabase.from('document_types').delete().eq('id', type.id).then(fetchDocTypes) }} className="p-2 text-red-400 hover:bg-red-50 rounded-lg"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                  </div>
                </div>
                <h4 className="font-black text-lg uppercase tracking-tight mb-2">{type.name}</h4>
                <p className="text-sm text-gray-500 dark:text-gray-400 font-medium leading-relaxed line-clamp-2">{type.description || 'Sem descrição definida.'}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'pessoas' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm flex flex-col md:flex-row gap-6 justify-between items-center">
            <div><h3 className="text-xl font-black">Cadastro de Pessoas</h3><p className="text-gray-400 font-medium text-sm">Gerencie proprietários e infratores do sistema.</p></div>
            <div className="flex gap-4">
              <button onClick={() => setEditingPessoa({ nome: '', cpf_cnpj: '', endereco: '' })} className="bg-primary text-white font-black px-6 py-3 rounded-xl shadow-lg hover:scale-105 transition-all text-xs uppercase font-serif">Nova Pessoa</button>
              <label className={`cursor-pointer px-6 py-3 rounded-xl font-black text-white shadow-lg transition-all text-xs uppercase ${isImporting ? 'bg-gray-400' : 'bg-emerald-500 hover:bg-emerald-600'}`}>
                {isImporting ? 'Processando...' : 'Importar Excel'}
                <input type="file" accept=".xlsx" className="hidden" onChange={handleImportPessoasXlsx} disabled={isImporting} />
              </label>
            </div>
          </div>
          <div className="relative flex gap-2">
            <input
              className="w-full bg-white dark:bg-slate-800 border-2 dark:border-slate-700 p-4 pl-12 rounded-[25px] shadow-sm focus:border-primary transition-all font-bold"
              placeholder="Digite o Nome (Ex: Joao Silva) ou CPF..."
              value={searchPessoa}
              onChange={e => setSearchPessoa(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && fetchPessoas()}
            />
            <span className="material-symbols-outlined absolute left-4 top-4 text-gray-300">search</span>
            <button onClick={fetchPessoas} className="bg-primary text-white font-black px-8 rounded-[25px] shadow-lg hover:scale-105 transition-all text-sm uppercase">
              BUSCAR
            </button>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-[35px] border dark:border-slate-700 shadow-sm overflow-hidden">
            <table className="w-full text-left font-serif">
              <thead className="bg-gray-50 dark:bg-slate-900"><tr className="border-b dark:border-slate-700"><th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">Pessoa / Razão Social</th><th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500">Documento</th><th className="px-6 py-5 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right">Ações</th></tr></thead>
              <tbody className="divide-y dark:divide-slate-700">
                {pessoas.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50/50 dark:hover:bg-slate-700/50 transition-colors"><td className="px-6 py-4 font-bold text-gray-900 dark:text-white uppercase text-xs">{p.nome}</td><td className="px-6 py-4 font-mono text-xs">{p.cpf_cnpj}</td><td className="px-6 py-4 text-right"><div className="flex justify-end gap-2"><button onClick={() => setEditingPessoa(p)} className="p-2 text-primary hover:bg-primary/10 rounded-lg"><span className="material-symbols-outlined text-[20px]">edit</span></button><button onClick={() => { if (confirm('Excluir?')) supabase.from('pessoas').delete().eq('id', p.id).then(fetchPessoas) }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><span className="material-symbols-outlined text-[20px]">delete</span></button></div></td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'works' && (
        <div className="space-y-6 animate-in fade-in">
          <div className="bg-white dark:bg-slate-800 p-8 rounded-[40px] border dark:border-slate-700 shadow-sm flex justify-between items-center">
            <div>
              <h3 className="text-xl font-black">Campos Personalizados de Obras</h3>
              <p className="text-gray-400 font-medium text-sm">Defina os campos que serão solicitados ao cadastrar uma obra.</p>
            </div>
            <button onClick={() => setEditingField({ label: '', field_type: 'text', required: false, mask: '', validation_rules: { min_length: '', exact_length: '' } })} className="bg-primary text-white font-black px-6 py-3 rounded-xl shadow-lg hover:scale-105 transition-all text-xs uppercase">Novo Campo</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {projectFields.map((field) => (
              <div key={field.id} className="bg-white dark:bg-slate-800 p-6 rounded-[30px] border dark:border-slate-700 shadow-sm flex flex-col justify-between group hover:border-primary transition-all">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h4 className="font-black text-lg text-gray-800 dark:text-white uppercase">{field.label}</h4>
                    <span className="text-[10px] font-bold text-gray-400 uppercase bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-md">{fieldTypes.find(t => t === field.field_type) || field.field_type}</span>
                    {field.required && <span className="ml-2 text-[10px] font-bold text-red-500 uppercase bg-red-50 dark:bg-red-900/20 px-2 py-1 rounded-md">Obrigatório</span>}
                  </div>
                  <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button onClick={() => setEditingField({ ...field, validation_rules: { ...field.validation_rules, exact_length: field.validation_rules?.exact_length ? field.validation_rules.exact_length.join(', ') : '' } })} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                    <button onClick={() => handleDeleteField(field.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg"><span className="material-symbols-outlined text-[20px]">delete</span></button>
                  </div>
                </div>
                <div className="text-xs text-gray-500 mt-2 space-y-1">
                  {field.mask && <p><strong>Máscara:</strong> {field.mask}</p>}
                  {field.validation_rules?.min_length && <p><strong>Mínimo Caracteres:</strong> {field.validation_rules.min_length}</p>}
                  {field.validation_rules?.max_length && <p><strong>Máximo Caracteres:</strong> {field.validation_rules.max_length}</p>}
                  {field.validation_rules?.exact_length && field.validation_rules.exact_length.length > 0 && <p><strong>Tamanho Exato:</strong> {field.validation_rules.exact_length.join(' ou ')}</p>}
                </div>
              </div>
            ))}
            {projectFields.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-400 font-medium">Nenhum campo configurado.</div>
            )}
          </div>
        </div>
      )}

      {/* MODAIS DE EDIÇÃO FISCALIZAÇÃO */}
      {editingInfracao && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[40px] p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black mb-8">Editar Enquadramento Legal</h3>
            <div className="space-y-6">
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Título</label><input className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl font-bold" value={editingInfracao.titulo} onChange={e => setEditingInfracao({ ...editingInfracao, titulo: e.target.value })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Artigo / Fundamentação</label><input className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl font-black text-emerald-600" value={editingInfracao.fundamentacao} onChange={e => setEditingInfracao({ ...editingInfracao, fundamentacao: e.target.value })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Descrição Detalhada</label><textarea className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl h-40 text-sm leading-relaxed" value={editingInfracao.descricao} onChange={e => setEditingInfracao({ ...editingInfracao, descricao: e.target.value })} /></div>
            </div>
            <div className="flex gap-4 pt-8"><button onClick={() => setEditingInfracao(null)} className="flex-1 py-4 font-bold text-gray-400 uppercase tracking-widest text-xs">Cancelar</button><button onClick={() => handleSaveInfracao(editingInfracao)} className="flex-2 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-500/20 uppercase tracking-widest text-xs px-12">Salvar Alterações</button></div>
          </div>
        </div>
      )}

      {editingTipoNotif && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-[40px] p-10 max-w-2xl w-full shadow-2xl animate-in zoom-in-95">
            <h3 className="text-2xl font-black mb-8">Editar Modelo de Documento</h3>
            <div className="space-y-6">
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Nome do Tipo</label><input className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl font-black text-xl" value={editingTipoNotif.nome} onChange={e => setEditingTipoNotif({ ...editingTipoNotif, nome: e.target.value })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 mb-1 block">Texto de Abertura (Padrão)</label><textarea className="w-full bg-gray-50 dark:bg-slate-900 border-2 dark:border-slate-700 p-4 rounded-2xl h-56 text-sm leading-relaxed" value={editingTipoNotif.texto_padrao} onChange={e => setEditingTipoNotif({ ...editingTipoNotif, texto_padrao: e.target.value })} /></div>
            </div>
            <div className="flex gap-4 pt-8"><button onClick={() => setEditingTipoNotif(null)} className="flex-1 py-4 font-bold text-gray-400 uppercase tracking-widest text-xs">Cancelar</button><button onClick={() => handleSaveTipoNotif(editingTipoNotif)} className="flex-2 py-4 bg-primary text-white font-black rounded-2xl shadow-lg shadow-blue-500/20 uppercase tracking-widest text-xs px-12">Salvar Modelo</button></div>
          </div>
        </div>
      )}

      {editingPessoa && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6">
            <h3 className="text-2xl font-black">{editingPessoa.id ? 'Editar Cadastro' : 'Novo Cadastro'}</h3>
            <div className="space-y-4">
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Nome / Razão Social</label><input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-bold uppercase" value={editingPessoa.nome} onChange={e => setEditingPessoa({ ...editingPessoa, nome: e.target.value.toUpperCase() })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">CPF ou CNPJ</label><input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-mono" value={editingPessoa.cpf_cnpj} onChange={e => setEditingPessoa({ ...editingPessoa, cpf_cnpj: e.target.value })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Endereço</label><textarea className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl h-24" value={editingPessoa.endereco || ''} onChange={e => setEditingPessoa({ ...editingPessoa, endereco: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 pt-4"><button onClick={() => setEditingPessoa(null)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button><button onClick={handleSavePessoa} disabled={loading} className="flex-1 py-4 bg-primary text-white font-black rounded-2xl shadow-lg uppercase text-xs tracking-widest">{loading ? 'Salvando...' : 'Salvar Pessoa'}</button></div>
          </div>
        </div>
      )}

      {editingDocType && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6">
            <h3 className="text-2xl font-black">{editingDocType.id ? 'Editar Tipo' : 'Novo Tipo de Documento'}</h3>
            <div className="space-y-4">
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Nome do Tipo</label><input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-black uppercase" value={editingDocType.name} onChange={e => setEditingDocType({ ...editingDocType, name: e.target.value.toUpperCase() })} /></div>
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Descrição</label><textarea className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl h-24" value={editingDocType.description || ''} onChange={e => setEditingDocType({ ...editingDocType, description: e.target.value })} /></div>
            </div>
            <div className="flex gap-3 pt-4"><button onClick={() => setEditingDocType(null)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button><button onClick={() => handleSaveDocType(editingDocType)} className="flex-1 py-4 bg-primary text-white font-black rounded-2xl shadow-lg uppercase text-xs tracking-widest">Salvar Tipo</button></div>
          </div>
        </div>
      )}
      {editingField && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-800 rounded-3xl p-8 max-w-lg w-full shadow-2xl space-y-6">
            <h3 className="text-2xl font-black">{editingField.id ? 'Editar Campo' : 'Novo Campo de Obra'}</h3>
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2 custom-scrollbar">
              <div><label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Nome do Campo (Label)</label><input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-black uppercase" value={editingField.label} onChange={e => setEditingField({ ...editingField, label: e.target.value.toUpperCase() })} placeholder="Ex: NÚMERO DA LICITAÇÃO" /></div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Tipo de Dado</label>
                  <select className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-bold uppercase" value={editingField.field_type} onChange={e => setEditingField({ ...editingField, field_type: e.target.value })}>
                    {fieldTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div className="flex items-center">
                  <label className="flex items-center gap-2 cursor-pointer bg-gray-50 dark:bg-slate-900 p-3 rounded-xl border w-full h-[50px] relative top-[11px]">
                    <input type="checkbox" className="size-5 accent-primary" checked={editingField.required} onChange={e => setEditingField({ ...editingField, required: e.target.checked })} />
                    <span className="text-sm font-bold uppercase text-gray-600 dark:text-gray-300">Obrigatório</span>
                  </label>
                </div>
              </div>

              {(editingField.field_type === 'text' || editingField.field_type === 'number') && (
                <div>
                  <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Máscara (Opcional)</label>
                  <input className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl font-mono text-sm" value={editingField.mask || ''} onChange={e => setEditingField({ ...editingField, mask: e.target.value })} placeholder="Ex: 999.999.999-99 (Use 9 para números, a para letras)" />
                  <p className="text-[10px] text-gray-400 mt-1">Biblioteca: React Input Mask. Use 9 para dígitos, a para letras, * para qualquer coisa.</p>
                </div>
              )}

              <div className="bg-gray-50 dark:bg-slate-900/50 p-4 rounded-xl border dark:border-slate-700">
                <h4 className="text-xs font-black uppercase text-gray-500 mb-3 border-b pb-2">Validações</h4>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Mínimo Caracteres</label>
                    <input type="number" className="w-full bg-white dark:bg-slate-800 border p-3 rounded-xl" value={editingField.validation_rules?.min_length || ''} onChange={e => setEditingField({ ...editingField, validation_rules: { ...editingField.validation_rules, min_length: parseInt(e.target.value) || null } })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Máximo Caracteres</label>
                    <input type="number" className="w-full bg-white dark:bg-slate-800 border p-3 rounded-xl" value={editingField.validation_rules?.max_length || ''} onChange={e => setEditingField({ ...editingField, validation_rules: { ...editingField.validation_rules, max_length: parseInt(e.target.value) || null } })} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black uppercase text-gray-400 block mb-1">Tamanho Exato</label>
                    <input className="w-full bg-white dark:bg-slate-800 border p-3 rounded-xl" value={editingField.validation_rules?.exact_length || ''} onChange={e => setEditingField({ ...editingField, validation_rules: { ...editingField.validation_rules, exact_length: e.target.value } })} placeholder="Ex: 11, 14" />
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3 pt-4 border-t dark:border-slate-700">
              <button onClick={() => setEditingField(null)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button>
              <button onClick={async () => {
                let dataToSave = { ...editingField };
                // Parse exact_length
                if (dataToSave.validation_rules && typeof dataToSave.validation_rules.exact_length === 'string') {
                  const parts = dataToSave.validation_rules.exact_length.split(',').map((n: string) => parseInt(n.trim())).filter((n: number) => !isNaN(n));
                  if (parts.length > 0) dataToSave.validation_rules.exact_length = parts;
                  else delete dataToSave.validation_rules.exact_length;
                } else if (dataToSave.validation_rules && Array.isArray(dataToSave.validation_rules.exact_length)) {
                  // Already array, assume correct
                }

                setLoading(true);
                const { id, ...data } = dataToSave;

                if (id) await supabase.from('project_field_definitions').update(data).eq('id', id);
                else await supabase.from('project_field_definitions').insert([{ ...data, order_index: projectFields.length }]);

                setEditingField(null);
                fetchProjectFields();
                setLoading(false);
              }} className="flex-1 py-4 bg-primary text-white font-black rounded-2xl shadow-lg uppercase text-xs tracking-widest">Salvar Campo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Settings;
