
import React, { useState, useEffect, useRef } from 'react';
import { useBlocker, useLocation } from 'react-router-dom'; // Added useBlocker
import { supabase } from '../lib/supabase';
import { isRelationUnavailable, rememberMissingRelation } from '../lib/supabaseCompat';
import { compressImage } from '../utils/imageCompressor';
import { markFieldSurveyNotification } from '../lib/offlineFieldStore';

// Helper de debounce
const useDebounce = (value: any, delay: number) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => setDebouncedValue(value), delay);
        return () => clearTimeout(handler);
    }, [value, delay]);
    return debouncedValue;
};

const Notifications: React.FC = () => {
    const location = useLocation();
    const [loading, setLoading] = useState(false);
    const [showForm, setShowForm] = useState(false);
    const [history, setHistory] = useState<any[]>([]);
    const [editingId, setEditingId] = useState<string | null>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);

    // Form States
    const [tipoId, setTipoId] = useState<string | null>(null);
    const [textoPadrao, setTextoPadrao] = useState('');
    const [selectedPessoa, setSelectedPessoa] = useState<any>(null);
    const [searchPessoa, setSearchPessoa] = useState('');
    const [pessoaResults, setPessoaResults] = useState<any[]>([]);
    const [locInfracao, setLocInfracao] = useState('');
    const [prazoDias, setPrazoDias] = useState(15);
    const [dataCiencia, setDataCiencia] = useState('');
    const [multaValor, setMultaValor] = useState<number>(0);
    const [observacoes, setObservacoes] = useState('');
    const [selectedInfracoes, setSelectedInfracoes] = useState<any[]>([]);
    const [fotos, setFotos] = useState<string[]>([]); // Base64 strings
    const [photosPerPage, setPhotosPerPage] = useState(4);
    const [sourceFieldSurveyId, setSourceFieldSurveyId] = useState<string | null>(null);
    const [sourceFieldSurveyTitle, setSourceFieldSurveyTitle] = useState('');

    // Configs
    const [availableModels, setAvailableModels] = useState<any[]>([]);
    const [availableTypes, setAvailableTypes] = useState<any[]>([]);
    const [usersList, setUsersList] = useState<any[]>([]);
    const [authorId, setAuthorId] = useState<string | null>(null);
    const [coAuthorId, setCoAuthorId] = useState<string | null>(null);

    // Autosave & Dirty State
    const [isDirty, setIsDirty] = useState(false);
    const isLoaded = useRef(false);

    // Debounce dos campos principais para salvar no storage
    const debouncedForm = useDebounce({
        tipoId, textoPadrao, selectedPessoa, locInfracao, prazoDias, multaValor, observacoes, selectedInfracoes, fotos, photosPerPage, authorId, coAuthorId, sourceFieldSurveyId, sourceFieldSurveyTitle
    }, 1000);

    // Navigation Blocker
    const blocker = useBlocker(
        ({ currentLocation, nextLocation }) =>
            showForm && isDirty && currentLocation.pathname !== nextLocation.pathname
    );

    useEffect(() => {
        if (blocker.state === 'blocked') {
            const confirm = window.confirm("Você tem alterações não salvas. Se sair agora, elas serão perdidas. Deseja sair?");
            if (confirm) {
                blocker.proceed();
            } else {
                blocker.reset();
            }
        }
    }, [blocker]);

    useEffect(() => {
        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            if (showForm && isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        };
        window.addEventListener('beforeunload', handleBeforeUnload);
        return () => window.removeEventListener('beforeunload', handleBeforeUnload);
    }, [showForm, isDirty]);


    // Signature State
    const [isSignModalOpen, setIsSignModalOpen] = useState(false);
    const [password, setPassword] = useState('');
    const [signingId, setSigningId] = useState<string | null>(null);

    // Ciência State
    const [isCienciaModalOpen, setIsCienciaModalOpen] = useState(false);
    const [cienciaId, setCienciaId] = useState<string | null>(null);
    const [cienciaData, setCienciaData] = useState('');
    const [entregaObs, setEntregaObs] = useState('');
    const [entregaFoto, setEntregaFoto] = useState('');

    // Histórico Search/Filter
    const [searchHist, setSearchHist] = useState('');
    const [filterStatus, setFilterStatus] = useState('all');
    const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'numero_sequencial', direction: 'desc' });

    // Visualização de Entrega
    const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);
    const [viewItem, setViewItem] = useState<any>(null);
    const [notificationsAvailable, setNotificationsAvailable] = useState(() => !isRelationUnavailable('notificacoes'));

    useEffect(() => {
        fetchHistory();
        fetchConfigs();
        fetchAuthData();
    }, []);

    // Autosave Effect
    useEffect(() => {
        if (showForm && isDirty && !loading) {
            const draftKey = editingId ? `draft_notif_${editingId}` : `draft_notif_new`;
            const data = {
                ...debouncedForm,
                updatedAt: Date.now()
            };
            try {
                localStorage.setItem(draftKey, JSON.stringify(data));
            } catch (e) {
                console.error("Erro ao salvar rascunho local", e);
            }
        }
    }, [debouncedForm]);

    // Mark as dirty on changes
    useEffect(() => {
        if (showForm && isLoaded.current) {
            setIsDirty(true);
        }
    }, [tipoId, textoPadrao, selectedPessoa, locInfracao, prazoDias, multaValor, observacoes, selectedInfracoes, fotos, photosPerPage, authorId, coAuthorId, sourceFieldSurveyId, sourceFieldSurveyTitle]);

    // Reset isLoaded when opening form
    useEffect(() => {
        if (showForm) {
            // Give time for state to settle from load/reset
            setTimeout(() => { isLoaded.current = true; }, 500);
        } else {
            isLoaded.current = false;
            setIsDirty(false);
        }
    }, [showForm]);


    const fetchAuthData = async () => {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            setCurrentUser(user);
            // setAuthorId(user.id); // Done in openNew/reset
        }
        const { data: users } = await supabase.from('profiles').select('id, full_name, role_title');
        if (users) setUsersList(users);
    };

    const fetchConfigs = async () => {
        const { data: mod } = await supabase.from('config_infracoes').select('*').order('titulo');
        const { data: tip } = await supabase.from('config_tipos_notificacao').select('*').order('nome');
        setAvailableModels(mod || []);
        setAvailableTypes(tip || []);
    };

    const fetchHistory = async () => {
        if (!notificationsAvailable) {
            setHistory([]);
            return;
        }

        const { data, error } = await supabase
            .from('notificacoes')
            .select(`
                *,
                pessoas(nome, cpf_cnpj),
                author:profiles!usuario_id(full_name),
                co_author:profiles!co_author_id(full_name),
                tipo:config_tipos_notificacao(nome)
            `)
            .order('data_emissao', { ascending: false });

        if (rememberMissingRelation('notificacoes', error)) {
            setNotificationsAvailable(false);
            setHistory([]);
            return;
        }

        setHistory(data || []);
    };

    const handleSelectTipo = (id: string) => {
        setTipoId(id);
        const tipo = availableTypes.find(t => t.id === id);
        if (tipo) {
            setTextoPadrao(sourceFieldSurveyId && observacoes
                ? `${tipo.texto_padrao}\n\n${observacoes}`
                : tipo.texto_padrao
            );
        }
    };

    const handleAddPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        const newFotos = [...fotos];
        for (let i = 0; i < files.length; i++) {
            try {
                const compressedBlob = await compressImage(files[i]);
                const reader = new FileReader();
                reader.readAsDataURL(compressedBlob);
                reader.onloadend = () => {
                    newFotos.push(reader.result as string);
                    setFotos([...newFotos]);
                };
            } catch (err) { console.error(err); }
        }
    };

    const handleSearchPessoa = async () => {
        if (!searchPessoa.trim()) {
            setPessoaResults([]);
            return;
        }

        const terms = searchPessoa.trim().split(/\s+/);
        let query = supabase.from('pessoas').select('*').limit(20);

        // Check for numeric (CPF/CNPJ)
        const isNumeric = /^\d+$/.test(searchPessoa.replace(/\D/g, ''));

        if (isNumeric && searchPessoa.length > 4) {
            const cleanDoc = searchPessoa.replace(/\D/g, '');
            query = supabase.from('pessoas').select('*').ilike('cpf_cnpj', `%${cleanDoc}%`).limit(20);
        } else {
            // Text Search - AND logic for all terms
            terms.forEach(term => {
                query = query.ilike('nome', `%${term}%`);
            });
        }

        const { data } = await query;
        setPessoaResults(data || []);
    };

    const handleAddEntregaPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            const compressedBlob = await compressImage(file);
            const reader = new FileReader();
            reader.readAsDataURL(compressedBlob);
            reader.onloadend = () => setEntregaFoto(reader.result as string);
        } catch (err) { console.error(err); }
    };

    const loadDraftIfAvailable = (id: string | null) => {
        const key = id ? `draft_notif_${id}` : `draft_notif_new`;
        const draft = localStorage.getItem(key);
        if (draft) {
            try {
                const p = JSON.parse(draft);
                // Basic validation/check (optional)
                console.log("Loading draft for", key);

                if (p.tipoId) setTipoId(p.tipoId);
                if (p.textoPadrao) setTextoPadrao(p.textoPadrao);
                if (p.selectedPessoa) setSelectedPessoa(p.selectedPessoa);
                if (p.locInfracao) setLocInfracao(p.locInfracao);
                if (p.prazoDias) setPrazoDias(p.prazoDias);
                if (p.multaValor) setMultaValor(p.multaValor);
                if (p.observacoes) setObservacoes(p.observacoes);
                if (p.selectedInfracoes) setSelectedInfracoes(p.selectedInfracoes);
                if (p.fotos) setFotos(p.fotos);
                if (p.photosPerPage) setPhotosPerPage(p.photosPerPage);
                if (p.authorId) setAuthorId(p.authorId);
                if (p.coAuthorId) setCoAuthorId(p.coAuthorId);
                if (p.sourceFieldSurveyId) setSourceFieldSurveyId(p.sourceFieldSurveyId);
                if (p.sourceFieldSurveyTitle) setSourceFieldSurveyTitle(p.sourceFieldSurveyTitle);

                return true;
            } catch (e) { console.error(e); }
        }
        return false;
    };

    const handleSave = async () => {
        if (!selectedPessoa || !tipoId || selectedInfracoes.length === 0) return alert('Preecha todos os campos obrigatórios');
        setLoading(true);
        try {
            const currentYear = new Date().getFullYear();
            const payload: any = {
                pessoa_id: selectedPessoa.id,
                tipo_id: tipoId,
                texto_padrao_customizado: textoPadrao,
                loc_infracao: locInfracao,
                prazo_dias: prazoDias,
                multa_valor: multaValor,
                observacoes: observacoes,
                infracoes_json: selectedInfracoes,
                fotos_json: fotos,
                photos_per_page: photosPerPage,
                usuario_id: authorId,
                co_author_id: coAuthorId,
                status: 'draft',
                author_signed_at: null,
                co_author_signed_at: null
            };

            if (editingId) {
                await supabase.from('notificacoes').update(payload).eq('id', editingId);
                localStorage.removeItem(`draft_notif_${editingId}`);
            } else {
                const { data: lastOne } = await supabase
                    .from('notificacoes')
                    .select('numero_sequencial_ano')
                    .filter('data_emissao', 'gte', `${currentYear}-01-01`)
                    .order('numero_sequencial_ano', { ascending: false }).limit(1);

                const nextNumber = lastOne && lastOne.length > 0 ? (lastOne[0].numero_sequencial_ano || 0) + 1 : 1;
                payload.numero_sequencial_ano = nextNumber;
                payload.label_formatada = `${String(nextNumber).padStart(3, '0')}/${currentYear}`;
                const { data: inserted, error: insertError } = await supabase.from('notificacoes').insert([payload]).select('id').single();
                if (insertError) throw insertError;
                if (sourceFieldSurveyId && inserted?.id) {
                    await markFieldSurveyNotification(sourceFieldSurveyId, inserted.id);
                }
                localStorage.removeItem(`draft_notif_new`);
            }
            setShowForm(false);
            fetchHistory();
            resetForm();
        } catch (err: any) { alert(err.message); } finally { setLoading(false); }
    };

    const resetForm = () => {
        setEditingId(null); setSelectedPessoa(null); setTipoId(null); setTextoPadrao('');
        setLocInfracao(''); setPrazoDias(15); setMultaValor(0); setObservacoes('');
        setSelectedInfracoes([]); setFotos([]); setPhotosPerPage(4); setCoAuthorId(null);
        setSourceFieldSurveyId(null); setSourceFieldSurveyTitle('');
        if (currentUser) setAuthorId(currentUser.id);
        setIsDirty(false);
        isLoaded.current = false;
    };

    const openNew = () => {
        resetForm();
        const loaded = loadDraftIfAvailable(null);
        setShowForm(true);
        if (loaded) setTimeout(() => setIsDirty(true), 600);
    }

    useEffect(() => {
        if ((location.state as any)?.openDraftNotification) {
            openNew();
            window.history.replaceState({}, document.title);
        }
    }, [location.state]);

    // Wrapped toggle for the main button
    const handleToggleForm = () => {
        if (showForm) {
            if (isDirty) {
                if (!confirm("Tem certeza que deseja cancelar? Rascunhos locais serão mantidos, mas as alterações não salvam no banco.")) return;
            }
            setShowForm(false);
            resetForm();
        } else {
            openNew();
        }
    };

    const handleEdit = (item: any) => {
        const hasSignatures = !!item.author_signed_at || !!item.co_author_signed_at;
        if (hasSignatures) {
            if (!confirm('Este documento já possui assinaturas. Se você editá-lo e salvar, TODAS AS ASSINATURAS SERÃO REMOVIDAS. Deseja continuar?')) return;
        }

        resetForm(); // clear first
        setEditingId(item.id);

        // Try load local draft first
        const hasDraft = loadDraftIfAvailable(item.id);

        if (!hasDraft) {
            // Load from item if no draft
            setSelectedPessoa(item.pessoas);
            setTipoId(item.tipo_id);
            setTextoPadrao(item.texto_padrao_customizado);
            setLocInfracao(item.loc_infracao);
            setPrazoDias(item.prazo_dias);
            setMultaValor(Number(item.multa_valor));
            setObservacoes(item.observacoes);
            setSelectedInfracoes(item.infracoes_json);
            setFotos(item.fotos_json);
            setPhotosPerPage(item.photos_per_page || 4);
            setAuthorId(item.usuario_id);
            setCoAuthorId(item.co_author_id || null);
        }

        setShowForm(true);
        if (hasDraft) setTimeout(() => setIsDirty(true), 600);
    };

    const handleToggleCancel = async (item: any) => {
        const newStatus = !item.is_cancelled;
        const msg = newStatus ? 'Deseja realmente CANCELAR esta notificação?' : 'Deseja REATIVAR esta notificação?';
        if (!confirm(msg)) return;

        const { error } = await supabase.from('notificacoes').update({ is_cancelled: newStatus }).eq('id', item.id);
        if (!error) fetchHistory();
    };

    const handleSign = async () => {
        if (!password) return;
        try {
            const { error } = await supabase.auth.signInWithPassword({ email: currentUser.email, password });
            if (error) throw new Error('Senha incorreta');

            const item = history.find(h => h.id === signingId);
            const isCoAuthor = currentUser.id === item.co_author_id;
            const updates: any = {};
            const now = new Date().toISOString();

            if (isCoAuthor) updates.co_author_signed_at = now;
            else updates.author_signed_at = now;

            // Logica status
            const hasCoAuthor = !!item.co_author_id;
            const authorSigned = isCoAuthor ? !!item.author_signed_at : true;
            const coAuthorSigned = isCoAuthor ? true : !!item.co_author_signed_at;

            if (!hasCoAuthor || (authorSigned && coAuthorSigned)) updates.status = 'finished';
            else updates.status = 'awaiting_signature';

            await supabase.from('notificacoes').update(updates).eq('id', signingId);
            setIsSignModalOpen(false); setPassword(''); fetchHistory();
            alert('Assinado com sucesso!');
        } catch (err: any) { alert(err.message); }
    };

    const handleSaveCiencia = async () => {
        if (!cienciaId || !cienciaData) return;
        try {
            const { error } = await supabase.from('notificacoes').update({
                data_ciencia: cienciaData,
                entrega_obs: entregaObs,
                entrega_foto: entregaFoto
            }).eq('id', cienciaId);
            if (error) throw error;
            setIsCienciaModalOpen(false);
            setCienciaId(null);
            setCienciaData('');
            setEntregaObs('');
            setEntregaFoto('');
            fetchHistory();
            alert('Dados de entrega registrados com sucesso!');
        } catch (err: any) { alert(err.message); }
    };

    return (
        <div className="p-4 lg:p-10 max-w-7xl mx-auto pb-32">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-800">Fiscalização</h1>
                    <p className="text-gray-500 font-medium italic">Gestão de Notificações, Embargos e Interdições</p>
                </div>
                <button onClick={handleToggleForm} className={`px-6 py-3 rounded-2xl font-bold text-white shadow-lg transition-all ${showForm ? 'bg-red-500' : 'bg-primary hover:scale-105'}`}>
                    {showForm ? 'Cancelar' : 'Nova Emissão'}
                </button>
            </div>

            {showForm ? (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 animate-in slide-in-from-bottom-4">
                    <div className="lg:col-span-2 space-y-6">
                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">description</span>Tipo e Conteúdo</h3>
                            {sourceFieldSurveyId && (
                                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-800">
                                    Rascunho criado a partir do levantamento: {sourceFieldSurveyTitle || sourceFieldSurveyId}
                                </div>
                            )}
                            <select className="w-full bg-gray-50 border p-3 rounded-xl font-bold" value={tipoId || ''} onChange={e => handleSelectTipo(e.target.value)}>
                                <option value="">Selecione o tipo de ação...</option>
                                {availableTypes.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
                            </select>
                            <textarea className="w-full bg-gray-50 border p-3 rounded-xl h-32 text-sm leading-relaxed" value={textoPadrao} onChange={e => setTextoPadrao(e.target.value)} placeholder="Texto descritivo da ação jurídica..." />
                        </section>

                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">person_search</span>Identificação do Notificado</h3>
                            {!selectedPessoa ? (
                                <div className="flex gap-2">
                                    <input
                                        className="w-full bg-gray-50 border p-3 rounded-xl"
                                        placeholder="Buscar por Nome (Ex: Joao Silva) ou CPF..."
                                        value={searchPessoa}
                                        onChange={e => setSearchPessoa(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                handleSearchPessoa();
                                            }
                                        }}
                                    />
                                    <button
                                        onClick={handleSearchPessoa}
                                        className="bg-primary text-white font-bold px-6 rounded-xl text-xs uppercase shadow hover:bg-blue-600"
                                        type="button"
                                    >
                                        Buscar
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-blue-50 p-4 rounded-xl flex justify-between items-center border border-blue-100">
                                    <div><p className="font-black text-blue-900">{selectedPessoa.nome}</p><p className="text-xs font-bold text-blue-400">{selectedPessoa.cpf_cnpj}</p></div>
                                    <button onClick={() => setSelectedPessoa(null)} className="text-red-500"><span className="material-symbols-outlined">delete</span></button>
                                </div>
                            )}
                            {pessoaResults.length > 0 && !selectedPessoa && (
                                <div className="bg-white border rounded-xl overflow-hidden shadow-xl mt-2">
                                    {pessoaResults.map(p => <button key={p.id} onClick={() => { setSelectedPessoa(p); setPessoaResults([]); }} className="w-full p-4 text-left hover:bg-gray-50 border-b last:border-0"><p className="font-bold">{p.nome}</p><p className="text-xs text-gray-400">{p.cpf_cnpj}</p></button>)}
                                </div>
                            )}
                        </section>

                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">gavel</span>Enquadramento de Infrações</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-2">
                                {availableModels.map(mod => (
                                    <button key={mod.id} onClick={() => {
                                        const exists = selectedInfracoes.find(i => i.id === mod.id);
                                        setSelectedInfracoes(exists ? selectedInfracoes.filter(i => i.id !== mod.id) : [...selectedInfracoes, mod]);
                                    }} className={`p-4 text-left rounded-2xl border transition-all ${selectedInfracoes.find(i => i.id === mod.id) ? 'bg-primary border-primary text-white' : 'bg-gray-50 hover:border-primary'}`}>
                                        <p className="font-bold text-xs uppercase">{mod.titulo}</p>
                                        <p className="text-[10px] mt-1 line-clamp-2 opacity-70">{mod.fundamentacao}</p>
                                    </button>
                                ))}
                            </div>
                        </section>
                    </div>

                    <div className="space-y-6">
                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">location_on</span>Local e Prazo</h3>
                            <input className="w-full bg-gray-50 border p-3 rounded-xl font-bold" placeholder="Local do fato..." value={locInfracao} onChange={e => setLocInfracao(e.target.value)} />
                            <textarea
                                className="w-full bg-gray-50 border p-3 rounded-xl h-32 text-sm leading-relaxed"
                                value={observacoes}
                                onChange={e => setObservacoes(e.target.value)}
                                placeholder="Observações e conteúdo trazido do levantamento..."
                            />
                            <div className="grid grid-cols-2 gap-4">
                                <div><label className="text-[10px] font-black uppercase text-gray-400">Prazo (Dias)</label><input type="number" className="w-full bg-gray-50 border p-3 rounded-xl font-bold text-center" value={prazoDias} onChange={e => setPrazoDias(Number(e.target.value))} /></div>
                                <div><label className="text-[10px] font-black uppercase text-gray-400">Multa (R$)</label><input type="number" className="w-full bg-gray-50 border p-3 rounded-xl font-bold text-center" value={multaValor} onChange={e => setMultaValor(Number(e.target.value))} /></div>
                            </div>
                        </section>

                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">photo_camera</span>Evidências Fotográficas</h3>
                            <div>
                                <label className="text-[10px] font-black uppercase text-gray-400">Fotos por página na impressão</label>
                                <select className="w-full bg-gray-50 border p-3 rounded-xl font-bold text-sm" value={photosPerPage} onChange={e => setPhotosPerPage(Number(e.target.value))}>
                                    <option value={1}>1 foto por página</option>
                                    <option value={2}>2 fotos por página</option>
                                    <option value={4}>4 fotos por página</option>
                                    <option value={6}>6 fotos por página</option>
                                </select>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                {fotos.map((f, i) => (
                                    <div key={i} className="relative aspect-square border-2 rounded-xl overflow-hidden">
                                        <img src={f} className="w-full h-full object-cover" />
                                        <button onClick={() => setFotos(fotos.filter((_, idx) => idx !== i))} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><span className="material-symbols-outlined text-xs">close</span></button>
                                    </div>
                                ))}
                                {fotos.length < 9 && (
                                    <label className="aspect-square border-2 border-dashed border-gray-200 rounded-xl flex items-center justify-center cursor-pointer hover:border-primary text-gray-300">
                                        <span className="material-symbols-outlined text-3xl">add_a_photo</span>
                                        <input type="file" multiple className="hidden" onChange={handleAddPhoto} />
                                    </label>
                                )}
                            </div>
                        </section>

                        <section className="bg-white p-6 rounded-3xl border shadow-sm space-y-4">
                            <h3 className="text-sm font-black uppercase text-gray-400 flex items-center gap-2"><span className="material-symbols-outlined text-primary">verified_user</span>Responsáveis</h3>
                            <div className="space-y-3">
                                <select className="w-full bg-gray-50 border p-2 rounded-lg text-xs font-bold" value={authorId || ''} onChange={e => setAuthorId(e.target.value)}>
                                    {usersList.map(u => <option key={u.id} value={u.id}>AUTOR: {u.full_name}</option>)}
                                </select>
                                <select className="w-full bg-gray-50 border p-2 rounded-lg text-xs font-bold" value={coAuthorId || ''} onChange={e => setCoAuthorId(e.target.value || null)}>
                                    <option value="">SEM COAUTOR</option>
                                    {usersList.map(u => <option key={u.id} value={u.id}>COAUTOR: {u.full_name}</option>)}
                                </select>
                            </div>
                        </section>

                        <button onClick={handleSave} disabled={loading} className="w-full py-5 bg-primary text-white rounded-3xl font-black text-lg shadow-xl shadow-blue-500/20 active:scale-95 transition-all">
                            {loading ? 'PROCESSANDO...' : (editingId ? 'ATUALIZAR' : 'CRIAR E LIBERAR')}
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-4 rounded-3xl border shadow-sm">
                        <div className="relative flex-1 w-full">
                            <span className="material-symbols-outlined absolute left-3 top-2.5 text-gray-400">search</span>
                            <input className="w-full bg-gray-50 border-none rounded-xl py-2.5 pl-10 pr-4 font-bold text-sm focus:ring-2 focus:ring-primary/20" placeholder="Pesquisar por número, infrator ou local..." value={searchHist} onChange={e => setSearchHist(e.target.value)} />
                        </div>
                        <div className="flex gap-2 w-full md:w-auto">
                            <select className="bg-gray-50 border-none rounded-xl py-2.5 px-4 font-black text-xs uppercase tracking-tight focus:ring-2 focus:ring-primary/20" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
                                <option value="all">TODOS</option>
                                <option value="pending">PENDENTE (CIÊNCIA)</option>
                                <option value="finished">FINALIZADOS</option>
                                <option value="cancelled">CANCELADOS</option>
                            </select>
                        </div>
                    </div>

                    <div className="bg-white rounded-3xl border shadow-sm overflow-hidden animate-in fade-in">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-[#1e293b] text-white text-[10px] uppercase font-black tracking-widest">
                                    <tr>
                                        {[
                                            { label: 'Nº Geral', key: 'numero_sequencial' },
                                            { label: 'Identificação', key: 'label_formatada' },
                                            { label: 'Tipo / Infrator', key: 'pessoas.nome' },
                                            { label: 'Datas', key: 'data_emissao' },
                                            { label: 'Ciência / Limite', key: 'data_ciencia' },
                                            { label: 'Responsáveis', key: 'author.full_name' },
                                            { label: 'Status', key: 'status' }
                                        ].map(col => (
                                            <th
                                                key={col.key}
                                                className="px-6 py-5 cursor-pointer hover:bg-slate-700 transition-colors"
                                                onClick={() => setSortConfig({
                                                    key: col.key,
                                                    direction: sortConfig.key === col.key && sortConfig.direction === 'asc' ? 'desc' : 'asc'
                                                })}
                                            >
                                                <div className="flex items-center gap-1">
                                                    {col.label}
                                                    <span className="material-symbols-outlined text-[12px]">
                                                        {sortConfig.key === col.key ? (sortConfig.direction === 'asc' ? 'arrow_upward' : 'arrow_downward') : 'swap_vert'}
                                                    </span>
                                                </div>
                                            </th>
                                        ))}
                                        <th className="px-6 py-5 text-center">Ações</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y text-sm">
                                    {[...history].sort((a, b) => {
                                        let aVal, bVal;
                                        switch (sortConfig.key) {
                                            case 'pessoas.nome': aVal = a.pessoas?.nome; bVal = b.pessoas?.nome; break;
                                            case 'author.full_name': aVal = a.author?.full_name; bVal = b.author?.full_name; break;
                                            default: aVal = a[sortConfig.key]; bVal = b[sortConfig.key];
                                        }
                                        if (!aVal) return 1; if (!bVal) return -1;
                                        if (aVal < bVal) return sortConfig.direction === 'asc' ? -1 : 1;
                                        if (aVal > bVal) return sortConfig.direction === 'asc' ? 1 : -1;
                                        return 0;
                                    }).filter(item => {
                                        const searchLower = searchHist.toLowerCase();
                                        const matchesSearch = !searchHist ||
                                            item.label_formatada?.toLowerCase().includes(searchLower) ||
                                            item.pessoas?.nome?.toLowerCase().includes(searchLower) ||
                                            item.loc_infracao?.toLowerCase().includes(searchLower) ||
                                            item.numero_sequencial?.toString().includes(searchLower);

                                        const matchesStatus = filterStatus === 'all' ||
                                            (filterStatus === 'pending' && !item.data_ciencia && !item.is_cancelled) ||
                                            (filterStatus === 'finished' && item.status === 'finished' && !item.is_cancelled) ||
                                            (filterStatus === 'cancelled' && item.is_cancelled);

                                        return matchesSearch && matchesStatus;
                                    }).map(item => {
                                        const isSignedByMe = currentUser?.id === item.usuario_id ? !!item.author_signed_at : (currentUser?.id === item.co_author_id ? !!item.co_author_signed_at : false);
                                        const canISign = (currentUser?.id === item.usuario_id || currentUser?.id === item.co_author_id) && !isSignedByMe;

                                        return (
                                            <tr key={item.id} className={`hover:bg-gray-50/50 ${item.is_cancelled ? 'opacity-50 grayscale' : ''}`}>
                                                <td className="px-6 py-4 font-mono text-xs text-gray-400">
                                                    {String(item.numero_sequencial || item.id?.slice(0, 4) || '0000').padStart(4, '0')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-black text-primary">{item.label_formatada || `#${item.numero_sequencial_ano}`}</p>
                                                    <p className="text-[10px] font-bold text-gray-400">{new Date(item.data_emissao).toLocaleDateString()}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <p className="font-black text-gray-800 uppercase text-xs">{item.tipo?.nome || 'Fiscalização'}</p>
                                                    <p className="text-xs font-medium text-gray-500">{item.pessoas?.nome}</p>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <p className="text-[10px] font-bold text-gray-500 uppercase">Criado: {new Date(item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                        <p className="text-[10px] font-bold text-blue-500 uppercase">Atualizado: {new Date(item.updated_at || item.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col">
                                                        <p className="text-[10px] font-bold text-gray-800 uppercase">Ciência: {item.data_ciencia ? new Date(item.data_ciencia + 'T00:00:00').toLocaleDateString() : '-'}</p>
                                                        <p className="text-[10px] font-black text-red-500 uppercase">Limite: {item.data_ciencia ? (() => {
                                                            const d = new Date(item.data_ciencia + 'T00:00:00');
                                                            d.setDate(d.getDate() + (item.prazo_dias || 0));
                                                            return d.toLocaleDateString();
                                                        })() : '-'}</p>
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex flex-col gap-1">
                                                        <span className={`text-[10px] font-black px-2 py-0.5 rounded ${item.author_signed_at ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{item.author?.full_name?.split(' ')[0]} {item.author_signed_at ? '✓' : '✗'}</span>
                                                        {item.co_author_id && <span className={`text-[10px] font-black px-2 py-0.5 rounded ${item.co_author_signed_at ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>{item.co_author?.full_name?.split(' ')[0]} {item.co_author_signed_at ? '✓' : '✗'}</span>}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    {item.is_cancelled ? (
                                                        <span className="text-[10px] font-black text-red-600 bg-red-50 border border-red-100 px-3 py-1 rounded-full uppercase">Cancelado</span>
                                                    ) : (
                                                        <>
                                                            {canISign && (
                                                                <button onClick={() => { setSigningId(item.id); setIsSignModalOpen(true); }} className="bg-green-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-black uppercase shadow hover:bg-green-700 transition-colors">Assinar</button>
                                                            )}
                                                            {isSignedByMe && item.status !== 'finished' && <span className="text-[10px] font-black text-orange-600 uppercase">Aguardando Coautor</span>}
                                                            {item.status === 'finished' && <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 border border-emerald-100 px-3 py-1 rounded-full uppercase">Finalizado</span>}
                                                        </>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="flex justify-center gap-2">
                                                        <button
                                                            onClick={() => {
                                                                setCienciaId(item.id);
                                                                setCienciaData(item.data_ciencia || '');
                                                                setEntregaObs(item.entrega_obs || '');
                                                                setEntregaFoto(item.entrega_foto || '');
                                                                setIsCienciaModalOpen(true);
                                                            }}
                                                            className={`p-2 rounded-lg ${item.data_ciencia ? 'text-emerald-600 bg-emerald-50' : 'text-gray-400 hover:bg-gray-50'}`}
                                                            title="Registrar/Editar Ciência"
                                                        >
                                                            <span className="material-symbols-outlined text-[20px]">how_to_reg</span>
                                                        </button>
                                                        {item.data_ciencia && (
                                                            <button
                                                                onClick={() => { setViewItem(item); setIsPrintModalOpen(true); }}
                                                                className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg"
                                                                title="Ver Comprovante"
                                                            >
                                                                <span className="material-symbols-outlined text-[20px]">visibility</span>
                                                            </button>
                                                        )}
                                                        <button onClick={() => window.open(`#/print-notification/${item.id}`, '_blank')} className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg" title="Imprimir Notificação"><span className="material-symbols-outlined text-[20px]">print</span></button>
                                                        {!item.is_cancelled && (
                                                            <button onClick={() => handleEdit(item)} className="p-2 text-amber-600 hover:bg-amber-50 rounded-lg" title="Editar"><span className="material-symbols-outlined text-[20px]">edit</span></button>
                                                        )}
                                                        <button onClick={() => handleToggleCancel(item)} className={`p-2 rounded-lg ${item.is_cancelled ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-50'}`} title={item.is_cancelled ? 'Reativar' : 'Cancelar'}><span className="material-symbols-outlined text-[20px]">{item.is_cancelled ? 'check_circle' : 'block'}</span></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {isSignModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-sm w-full shadow-2xl space-y-6">
                        <div className="text-center"><div className="w-16 h-16 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4"><span className="material-symbols-outlined text-4xl">verified_user</span></div><h3 className="text-xl font-black">Confirmar Identidade</h3><p className="text-sm text-gray-500 font-medium leading-tight">Sua assinatura digital será aplicada permanentemente neste documento.</p></div>
                        <input type="password" placeholder="Sua senha de acesso" className="w-full border-2 p-4 rounded-2xl font-black text-center focus:border-primary outline-none" value={password} onChange={e => setPassword(e.target.value)} />
                        <div className="flex gap-3"><button onClick={() => setIsSignModalOpen(false)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button><button onClick={handleSign} className="flex-1 py-4 bg-green-600 text-white font-black rounded-2xl shadow-lg shadow-green-200">ASSINAR</button></div>
                    </div>
                </div>
            )}

            {isCienciaModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl space-y-6">
                        <div className="text-center">
                            <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                <span className="material-symbols-outlined text-4xl">how_to_reg</span>
                            </div>
                            <h3 className="text-xl font-black">Comprovante de Entrega</h3>
                            <p className="text-sm text-gray-500 font-medium leading-tight">Registre a ciência e anexe o comprovante de recebimento.</p>
                        </div>

                        <div className="space-y-4">
                            <div><label className="text-[10px] font-black uppercase text-gray-400 ml-2">Data da Ciência</label>
                                <input type="date" className="w-full border-2 p-3 rounded-2xl font-black text-center focus:border-primary outline-none" value={cienciaData} onChange={e => setCienciaData(e.target.value)} /></div>

                            <div><label className="text-[10px] font-black uppercase text-gray-400 ml-2">Observações da Entrega</label>
                                <textarea className="w-full border-2 p-3 rounded-2xl text-sm focus:border-primary outline-none h-20" placeholder="Ex: Recebido por terceiro, recusou-se a assinar, etc..." value={entregaObs} onChange={e => setEntregaObs(e.target.value)} /></div>

                            <div className="flex flex-col items-center gap-3">
                                <h4 className="text-[10px] font-black uppercase text-gray-400">Foto do Comprovante (AR / Assinatura)</h4>
                                {entregaFoto ? (
                                    <div className="relative w-full aspect-video rounded-2xl overflow-hidden border-2 border-emerald-500">
                                        <img src={entregaFoto} className="w-full h-full object-cover" />
                                        <button onClick={() => setEntregaFoto('')} className="absolute top-2 right-2 bg-red-500 text-white rounded-full p-1 shadow-lg"><span className="material-symbols-outlined text-sm">close</span></button>
                                    </div>
                                ) : (
                                    <label className="w-full aspect-video border-2 border-dashed border-gray-200 rounded-2xl flex flex-col items-center justify-center cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 transition-all text-gray-400 group">
                                        <span className="material-symbols-outlined text-3xl group-hover:scale-110 transition-transform">add_a_photo</span>
                                        <span className="text-[10px] font-bold mt-2 uppercase">Anexar Foto</span>
                                        <input type="file" className="hidden" onChange={handleAddEntregaPhoto} />
                                    </label>
                                )}
                            </div>
                        </div>

                        <div className="flex gap-3"><button onClick={() => setIsCienciaModalOpen(false)} className="flex-1 py-4 font-bold text-gray-400">Cancelar</button><button onClick={handleSaveCiencia} className="flex-1 py-4 bg-emerald-600 text-white font-black rounded-2xl shadow-lg shadow-emerald-200">SALVAR REGISTRO</button></div>
                    </div>
                </div>
            )}

            {isPrintModalOpen && viewItem && (
                <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-[60] flex items-center justify-center p-4">
                    <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-300">
                        {/* Header do Comprovante */}
                        <div className="p-6 border-b bg-gray-50 flex justify-between items-center">
                            <div>
                                <h3 className="text-xl font-black text-slate-800">Comprovante de Entrega</h3>
                                <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">{viewItem.label_formatada} - {viewItem.pessoas?.nome}</p>
                            </div>
                            <div className="flex gap-2 print:hidden">
                                <button onClick={() => window.print()} className="bg-primary text-white px-4 py-2 rounded-xl font-black text-xs uppercase flex items-center gap-2"><span className="material-symbols-outlined text-sm">print</span> Imprimir</button>
                                <button onClick={() => setIsPrintModalOpen(false)} className="text-gray-400 p-2"><span className="material-symbols-outlined">close</span></button>
                            </div>
                        </div>

                        {/* Conteúdo Imprimível */}
                        <div className="flex-1 overflow-y-auto p-8 space-y-8" id="printable-comprovante">
                            <div className="grid grid-cols-2 gap-8 text-sm">
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Data da Ciência</p>
                                    <p className="font-black text-lg text-emerald-600">{new Date(viewItem.data_ciencia + 'T00:00:00').toLocaleDateString()}</p>
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black text-gray-400 uppercase">Infrator</p>
                                    <p className="font-black text-slate-800">{viewItem.pessoas?.nome}</p>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Observações do Agente</p>
                                <div className="p-4 bg-gray-50 rounded-2xl border text-slate-600 font-medium italic min-h-[60px]">
                                    {viewItem.entrega_obs || 'Nenhuma observação registrada.'}
                                </div>
                            </div>

                            <div className="space-y-4">
                                <p className="text-[10px] font-black text-gray-400 uppercase">Foto do Comprovante / AR / Recibo</p>
                                {viewItem.entrega_foto ? (
                                    <div className="rounded-3xl border-4 border-gray-100 overflow-hidden shadow-lg">
                                        <img src={viewItem.entrega_foto} className="w-full h-auto" />
                                    </div>
                                ) : (
                                    <div className="border-2 border-dashed rounded-3xl p-12 text-center text-gray-300">
                                        <span className="material-symbols-outlined text-4xl mb-2">no_photography</span>
                                        <p className="text-xs font-bold uppercase">Nenhuma foto anexada</p>
                                    </div>
                                )}
                            </div>

                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default Notifications;
