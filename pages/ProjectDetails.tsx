import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import 'leaflet/dist/leaflet.css';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';

// Fix Leaflet Icons (duplicated from Projects.tsx for now to avoid external dep)
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: markerIcon2x,
    iconUrl: markerIcon,
    shadowUrl: markerShadow,
});

import { supabase } from '../lib/supabase';

// Helper for currency formatting
const formatCurrency = (val: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

interface Project {
    id: string;
    name: string;
    location: string;
    budget: number;
    latitude?: number;
    longitude?: number;
    custom_data?: any;
    status: string;
}

interface Document {
    id: string;
    title: string;
    category: string;
    url: string;
    created_at: string;
}

interface Additive {
    id: string;
    description: string;
    value: number;
    date: string;
    pdf_url?: string;
}

interface Measurement {
    id: string;
    reference_month: string;
    value: number;
    observation?: string;
    pdf_url?: string;
    additive_id?: string;
}

const ProjectDetails: React.FC = () => {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const [project, setProject] = useState<Project | null>(null);
    const [activeTab, setActiveTab] = useState(localStorage.getItem('sigop_active_tab') || 'dashboard');

    useEffect(() => {
        localStorage.setItem('sigop_active_tab', activeTab);
    }, [activeTab]);

    const [documents, setDocuments] = useState<Document[]>([]);
    const [additives, setAdditives] = useState<Additive[]>([]);
    const [measurements, setMeasurements] = useState<Measurement[]>([]);

    const [loading, setLoading] = useState(true);

    // Modal States
    const [isDocModalOpen, setIsDocModalOpen] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isMeasModalOpen, setIsMeasModalOpen] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isFileModalOpen, setIsFileModalOpen] = useState(false);
    const [selectedFileContent, setSelectedFileContent] = useState<string | null>(null);

    // Detail Modal State
    const [detailType, setDetailType] = useState<'measured' | 'balance' | 'additives' | 'pct_additives' | null>(null);

    // Tech Doc Linking Modal
    const [isLinkDocModalOpen, setIsLinkDocModalOpen] = useState(false);
    const [linkableDocs, setLinkableDocs] = useState<any[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isSearchingDocs, setIsSearchingDocs] = useState(false);

    // Form States
    const [newDoc, setNewDoc] = useState<{ title: string; category: string; url: string; file_content?: any | null }>({ title: '', category: 'Outros', url: '', file_content: null });

    // Additive Form
    const [editingAddId, setEditingAddId] = useState<string | null>(null);
    const [newAdd, setNewAdd] = useState<{ description: string; value: string; date: string; pdf_url: string; file_content?: any | null }>({ description: '', value: '', date: new Date().toISOString().split('T')[0], pdf_url: '', file_content: null });

    // Measurement Form
    const [editingMeasId, setEditingMeasId] = useState<string | null>(null);
    const [newMeas, setNewMeas] = useState<{ reference_month: string; value: string; observation: string; pdf_url: string; additive_id: string; file_content?: any | null }>({ reference_month: new Date().toISOString().split('T')[0], value: '', observation: '', pdf_url: '', additive_id: '', file_content: null });

    useEffect(() => {
        if (id) fetchProjectData();
    }, [id]);

    const fetchProjectData = async () => {
        try {
            setLoading(true);
            const projReq = await supabase.from('projects').select('*').eq('id', id).single();
            const docsReq = await supabase.from('project_documents').select('*').eq('project_id', id).order('created_at', { ascending: false });
            const addReq = await supabase.from('project_additives').select('*').eq('project_id', id).order('date', { ascending: false });
            const measReq = await supabase.from('project_measurements').select('*').eq('project_id', id).order('reference_month', { ascending: false });

            if (projReq.error) throw projReq.error;

            setProject(projReq.data);
            setDocuments(docsReq.data || []);
            setAdditives(addReq.data || []);
            setMeasurements(measReq.data || []);
        } catch (e) {
            console.error(e);
            alert('Erro ao carregar obra.');
            navigate('/projects');
        } finally {
            setLoading(false);
        }
    };

    const calculateFinancials = () => {
        if (!project) return { totalContract: 0, totalAdditives: 0, totalMeasured: 0, balance: 0, progress: 0 };

        const totalAdditives = additives.reduce((sum, a) => sum + (Number(a.value) || 0), 0);
        const totalContract = (Number(project.budget) || 0) + totalAdditives;
        const totalMeasured = measurements.reduce((sum, m) => sum + (Number(m.value) || 0), 0);
        const balance = totalContract - totalMeasured;
        const progress = totalContract > 0 ? (totalMeasured / totalContract) * 100 : 0;

        return { totalContract, totalAdditives, totalMeasured, balance, progress };
    };

    // --- DOCUMENTS ---
    const handleSaveDocument = async () => {
        if (!newDoc.title) return alert('Informe o título do documento');
        if (!newDoc.file_content && !newDoc.url) return alert('Informe uma URL ou anexe um arquivo.');

        setIsSaving(true);
        const payload = {
            project_id: id,
            title: newDoc.title,
            category: newDoc.category,
            url: newDoc.url,
            file_content: newDoc.file_content
        };
        const { error } = await supabase.from('project_documents').insert([payload]);

        setIsSaving(false);
        if (error) return alert(error.message);
        setIsDocModalOpen(false);
        setNewDoc({ title: '', category: 'Outros', url: '', file_content: null });
        fetchProjectData();
    };

    const handleDeleteDocument = async (docId: string) => {
        if (!window.confirm("Tem certeza que deseja excluir este documento?")) return;
        const { error } = await supabase.from('project_documents').delete().eq('id', docId);
        if (error) alert(error.message);
        else fetchProjectData();
    };

    // --- ADDITIVES ---
    const openAddModal = (additive?: Additive) => {
        if (additive) {
            setEditingAddId(additive.id);
            setNewAdd({
                description: additive.description,
                value: String(additive.value),
                date: additive.date,
                pdf_url: additive.pdf_url || '',
                file_content: null
            });
        } else {
            setEditingAddId(null);
            setNewAdd({ description: '', value: '', date: new Date().toISOString().split('T')[0], pdf_url: '', file_content: null });
        }
        setIsAddModalOpen(true);
    };

    const handleSaveAdditive = async () => {
        if (!newAdd.value) return alert('Informe o valor');
        const val = parseFloat(String(newAdd.value).replace(/\./g, '').replace(',', '.'));

        setIsSaving(true);
        const payload = {
            project_id: id,
            description: newAdd.description,
            value: val,
            date: newAdd.date,
            pdf_url: newAdd.pdf_url,
            file_content: newAdd.file_content
        };

        let result;
        if (editingAddId) {
            result = await supabase.from('project_additives').update(payload).eq('id', editingAddId);
        } else {
            result = await supabase.from('project_additives').insert([payload]);
        }

        setIsSaving(false);
        if (result.error) return alert(result.error.message);
        setIsAddModalOpen(false);
        fetchProjectData();
    };

    const handleDeleteAdditive = async (addId: string) => {
        // 1. Check for linked measurements
        const { count, error: countError } = await supabase
            .from('project_measurements')
            .select('*', { count: 'exact', head: true })
            .eq('additive_id', addId);

        if (countError) {
            console.error(countError);
            return alert("Erro ao verificar vínculos.");
        }

        // 2. Construct message
        let msg = "Tem certeza que deseja excluir este aditivo?";
        if (count && count > 0) {
            msg += `\n\nATENÇÃO: Existem ${count} medições vinculadas a este aditivo.\n\nElas serão EXCLUÍDAS permanentemente e o valor medido será removido do saldo executado.`;
        }

        if (!window.confirm(msg)) return;

        // 3. Delete linked measurements first (manual cascade to avoid SET NULL or orphan records)
        if (count && count > 0) {
            const { error: delMeasError } = await supabase
                .from('project_measurements')
                .delete()
                .eq('additive_id', addId);

            if (delMeasError) return alert("Erro ao excluir medições vinculadas: " + delMeasError.message);
        }

        // 4. Delete the additive
        const { error } = await supabase.from('project_additives').delete().eq('id', addId);

        if (error) alert(error.message);
        else fetchProjectData();
    };

    // --- MEASUREMENTS ---
    const openMeasModal = (meas?: Measurement) => {
        if (meas) {
            setEditingMeasId(meas.id);
            setNewMeas({
                reference_month: meas.reference_month,
                value: String(meas.value),
                observation: meas.observation || '',
                pdf_url: meas.pdf_url || '',
                additive_id: meas.additive_id || '',
                file_content: null
            });
        } else {
            setEditingMeasId(null);
            setNewMeas({ reference_month: new Date().toISOString().split('T')[0], value: '', observation: '', pdf_url: '', additive_id: '', file_content: null });
        }
        setIsMeasModalOpen(true);
    };

    const handleSaveMeasurement = async () => {
        if (!newMeas.value) return alert('Informe o valor');
        const val = parseFloat(String(newMeas.value).replace(/\./g, '').replace(',', '.'));

        // VALIDATION LOGIC
        const currentAdditiveId = newMeas.additive_id || null;

        let limit = 0;
        let label = '';

        if (currentAdditiveId) {
            const add = additives.find(a => a.id === currentAdditiveId);
            if (!add) return alert('Erro: Aditivo selecionado não encontrado.');
            limit = Number(add.value);
            label = 'Aditivo';
        } else {
            limit = Number(project?.budget || 0);
            label = 'Contrato Base';
        }

        // Calculate total already measured for this scope (excluding current editing item)
        const previousMeasurements = measurements
            .filter(m => (m.additive_id || null) === currentAdditiveId && m.id !== editingMeasId)
            .reduce((sum, m) => sum + Number(m.value), 0);

        const newTotal = previousMeasurements + val;

        if (newTotal > limit) {
            return alert(`ERRO: O valor total medido (${formatCurrency(newTotal)}) excede o valor do ${label} (${formatCurrency(limit)}).\nSaldo Disponível: ${formatCurrency(limit - previousMeasurements)}`);
        }

        const payload = {
            project_id: id,
            value: val,
            reference_month: newMeas.reference_month,
            observation: newMeas.observation,
            pdf_url: newMeas.pdf_url,
            additive_id: currentAdditiveId,
            file_content: newMeas.file_content
        };

        setIsSaving(true);
        let result;
        if (editingMeasId) {
            result = await supabase.from('project_measurements').update(payload).eq('id', editingMeasId);
        } else {
            result = await supabase.from('project_measurements').insert([payload]);
        }

        setIsSaving(false);
        if (result.error) return alert(result.error.message);
        setIsMeasModalOpen(false);
        fetchProjectData();
    };

    const handleDeleteMeasurement = async (measId: string) => {
        if (!window.confirm("Excluir esta medição?")) return;
        const { error } = await supabase.from('project_measurements').delete().eq('id', measId);
        if (error) alert(error.message);
        else fetchProjectData();
    };



    // --- LINK TECH DOCS ---
    const handleOpenLinkModal = async () => {
        setIsLinkDocModalOpen(true);
        setIsSearchingDocs(true);
        // Fetch docs not linked to ANY project or just fetch all?
        // Let's fetch all for simplicity, and show status.
        // Or filter: where project_id is null OR project_id != current
        const { data } = await supabase.from('documents').select('*').is('project_id', null).order('created_at', { ascending: false }).limit(50);
        setLinkableDocs(data || []);
        setIsSearchingDocs(false);
    };

    const handleLinkDocument = async (docId: string) => {
        const { error } = await supabase.from('documents').update({ project_id: id }).eq('id', docId);
        if (error) alert('Erro ao vincular: ' + error.message);
        else {
            setIsLinkDocModalOpen(false);
            // Trigger refresh - reloading page for now as it's simplest for this subcomponent structure
            window.location.reload();
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="p-10 text-center text-gray-400">Carregando detalhes...</div>;
    if (!project) return null;

    const financials = calculateFinancials();

    return (
        <div className="p-6 lg:p-10 max-w-[1600px] mx-auto pb-32">


            {/* PRINT REPORT (Compact Layout) */}
            <div className="hidden print:block p-8 bg-white text-black text-xs">
                <div className="text-center mb-4 border-b pb-2 flex justify-between items-end">
                    <div className="text-left">
                        <h1 className="text-xl font-black uppercase text-black mb-0 leading-none">{project.name}</h1>
                        <p className="text-[10px] text-gray-500 mt-1 uppercase">Relatório Gerencial Sintético</p>
                    </div>
                    <p className="text-[10px] text-gray-400">Emissão: {new Date().toLocaleDateString()}</p>
                </div>

                <div className="grid grid-cols-2 gap-8">
                    {/* 1. Resumo Financeiro Compacto */}
                    <div className="mb-4">
                        <h3 className="text-sm font-bold uppercase border-b border-black mb-2">Resumo Financeiro</h3>
                        <div className="space-y-1">
                            <div className="flex justify-between border-b border-gray-100 py-1">
                                <span className="font-bold text-gray-600">Orçamento Base:</span>
                                <span className="font-mono">{formatCurrency((Number(project.budget || 0)))}</span>
                            </div>
                            <div className="flex justify-between border-b border-gray-100 py-1 text-amber-700">
                                <span className="font-bold">Total Aditivos:</span>
                                <span className="font-mono">+ {formatCurrency(financials.totalAdditives)}</span>
                            </div>
                            <div className="flex justify-between border-t border-black pt-1 mt-1 font-black bg-gray-50 p-1">
                                <span className="uppercase">Contrato Final:</span>
                                <span className="font-mono">{formatCurrency(financials.totalContract)}</span>
                            </div>
                            <div className="flex justify-between font-black text-blue-800 bg-blue-50 p-1">
                                <span className="uppercase">Total Medido:</span>
                                <span className="font-mono">{formatCurrency(financials.totalMeasured)} ({financials.progress.toFixed(2)}%)</span>
                            </div>
                            <div className="flex justify-between font-bold text-gray-500 pt-1">
                                <span className="uppercase">Saldo:</span>
                                <span className="font-mono">{formatCurrency(financials.balance)}</span>
                            </div>
                        </div>
                    </div>

                    {/* 2. Donut Chart Representation (CSS/SVG) or Summary Box */}
                    <div className="mb-4 flex flex-col items-center justify-center">
                        <div className="relative size-24 mb-2">
                            <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-gray-100" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="8" />
                                <path className="text-blue-600" strokeDasharray={`${Math.min(financials.progress, 100)}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="8" />
                            </svg>
                            <div className="absolute inset-0 flex items-center justify-center font-black text-sm">{financials.progress.toFixed(0)}%</div>
                        </div>
                        <p className="text-[10px] text-center uppercase font-bold text-gray-500">Execução Física/Financeira</p>
                    </div>
                </div>

                {/* 3. Latest Measurements Table Only */}
                <div className="mb-4 break-inside-avoid">
                    <h3 className="text-sm font-bold uppercase border-b border-black mb-2">Últimas 10 Medições</h3>
                    <table className="w-full text-xs border-collapse">
                        <thead className="bg-gray-100 font-bold text-left">
                            <tr>
                                <th className="p-1 border-b">Ref.</th>
                                <th className="p-1 border-b">Tipo</th>
                                <th className="p-1 border-b text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody>
                            {measurements.slice(0, 10).map(m => (
                                <tr key={m.id} className="border-b border-gray-50">
                                    <td className="p-1">{new Date(m.reference_month).toLocaleDateString()}</td>
                                    <td className="p-1">{m.additive_id ? 'Aditivo' : 'Base'}</td>
                                    <td className="p-1 text-right font-mono">{formatCurrency(m.value)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="border-t pt-2 text-center text-[8px] text-gray-400">SIGOP - Sistema Integrado de Gestão de Obras Públicas - Documento Interno</div>
            </div>

            {/* MAIN APP UI (Hidden on print) */}
            <div className="print:hidden">
                {/* HEADER */}
                <div className="flex justify-between items-start mb-8">
                    <div>
                        <button onClick={() => navigate('/projects')} className="text-gray-400 text-xs font-bold uppercase hover:text-primary mb-2 flex items-center gap-1">
                            <span className="material-symbols-outlined text-sm">arrow_back</span> Voltar para Obras
                        </button>
                        <h2 className="text-[#111318] dark:text-white text-3xl font-black tracking-tight">{project.name}</h2>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span className="flex items-center gap-1"><span className="material-symbols-outlined text-sm">location_on</span> {project.location || 'Sem local'}</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${project.status === 'in_progress' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>{project.status === 'in_progress' ? 'Em Andamento' : project.status}</span>
                        </div>
                    </div>

                    <div className="flex items-center gap-6">
                        {/* Progress Circle moved to Header */}
                        <div className="relative size-16">
                            <svg className="size-full -rotate-90" viewBox="0 0 36 36">
                                <path className="text-gray-200 dark:text-gray-700" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                                <path className="text-blue-600 drop-shadow-md transition-all duration-1000 ease-out" strokeDasharray={`${Math.min(financials.progress, 100)}, 100`} d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" fill="none" stroke="currentColor" strokeWidth="4" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-[10px] font-black leading-none">
                                <span className="text-blue-600">{financials.progress.toFixed(0)}%</span>
                                <span className="text-[6px] text-gray-400 uppercase">Exec.</span>
                            </div>
                        </div>

                        <div className="flex flex-col items-end gap-2">
                            <div className="text-right mb-2">
                                <p className="text-xs font-bold uppercase text-gray-400">Valor Atual do Contrato</p>
                                <p className="text-2xl font-black text-emerald-600">{formatCurrency(financials.totalContract)}</p>
                            </div>
                            <button onClick={handlePrint} className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 dark:bg-slate-700 dark:hover:bg-slate-600 dark:text-white px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors">
                                <span className="material-symbols-outlined text-sm">print</span> Imprimir Relatório
                            </button>
                        </div>
                    </div>
                </div >

                {/* TABS */}
                {/* TABS MENU */}
                <div className="flex border-b border-gray-200 dark:border-slate-700 mb-6 overflow-x-auto">
                    {[
                        { id: 'dashboard', label: 'Visão Geral', icon: 'dashboard' },
                        { id: 'status_report', label: 'Status da Obra', icon: 'pie_chart' },
                        { id: 'measurements', label: 'Financeiro e Medições', icon: 'payments' },
                        { id: 'docs', label: 'Arquivos da Obra', icon: 'folder_open' },
                        { id: 'tech_docs', label: 'Documentos Técnicos', icon: 'description' },
                        { id: 'additives', label: 'Aditivos Contratuais', icon: 'note_add' },
                        { id: 'map', label: 'Geolocalização', icon: 'map' },
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`flex items-center gap-2 px-6 py-4 border-b-2 font-bold text-xs uppercase transition-all whitespace-nowrap outline-none ${activeTab === tab.id
                                ? 'border-primary text-primary bg-primary/5'
                                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                                }`}
                        >
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* CONTENT */}
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-300">

                    {/* DASHBOARD TAB */}
                    {activeTab === 'dashboard' && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                            <div onClick={() => setDetailType('measured')} className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all hover:border-blue-300 group">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-gray-400 text-[10px] font-black uppercase mb-2">Executado (Medido)</h4>
                                    <span className="material-symbols-outlined text-gray-300 group-hover:text-blue-500 text-sm">info</span>
                                </div>
                                <p className="text-2xl font-black text-blue-600">{formatCurrency(financials.totalMeasured)}</p>
                                <div className="mt-4 w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                                    <div className="bg-blue-600 h-full rounded-full" style={{ width: `${Math.min(100, financials.progress)}%` }}></div>
                                </div>
                                <p className="text-right text-[10px] font-bold text-gray-400 mt-1">{financials.progress.toFixed(2)}% Concluído</p>
                            </div>

                            <div onClick={() => setDetailType('balance')} className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all hover:border-gray-300 group">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-gray-400 text-[10px] font-black uppercase mb-2">Saldo a Medir</h4>
                                    <span className="material-symbols-outlined text-gray-300 group-hover:text-gray-500 text-sm">info</span>
                                </div>
                                <p className="text-2xl font-black text-gray-700 dark:text-gray-200">{formatCurrency(financials.balance)}</p>
                            </div>

                            <div onClick={() => setDetailType('additives')} className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all hover:border-amber-300 group">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-gray-400 text-[10px] font-black uppercase mb-2">Total de Aditivos</h4>
                                    <span className="material-symbols-outlined text-gray-300 group-hover:text-amber-500 text-sm">info</span>
                                </div>
                                <p className="text-2xl font-black text-amber-500">{formatCurrency(financials.totalAdditives)}</p>
                            </div>

                            <div onClick={() => setDetailType('pct_additives')} className="bg-white dark:bg-slate-800 p-6 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700 cursor-pointer hover:shadow-md transition-all hover:border-emerald-300 group">
                                <div className="flex justify-between items-start">
                                    <h4 className="text-gray-400 text-[10px] font-black uppercase mb-2">% Aditivado</h4>
                                    <span className="material-symbols-outlined text-gray-300 group-hover:text-emerald-500 text-sm">info</span>
                                </div>
                                <p className={`text-2xl font-black ${(financials.totalAdditives / (project.budget || 1)) > 0.25 ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {((financials.totalAdditives / (project.budget || 1)) * 100).toFixed(2)}%
                                </p>
                                <p className="text-right text-[10px] font-bold text-gray-400 mt-1">do Contrato Base</p>
                            </div>

                            <div className="col-span-full bg-white dark:bg-slate-800 p-8 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
                                <h3 className="font-bold text-lg mb-6">Evolução Financeira e Curva S</h3>
                                <FinancialEvolutionChart measurements={measurements} totalContract={financials.totalContract} />
                            </div>
                        </div>
                    )}

                    {/* STATUS REPORT TAB (NEW) */}
                    {activeTab === 'status_report' && (
                        <div className="bg-white dark:bg-slate-800 p-10 rounded-3xl shadow-sm border border-gray-100 dark:border-slate-700">
                            <h3 className="font-black text-2xl mb-8 flex items-center gap-3"><span className="material-symbols-outlined text-primary">pie_chart</span> Composição do Executado</h3>

                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                                {/* Pie Chart Visualization */}
                                <div className="relative h-[300px] flex items-center justify-center">
                                    <svg viewBox="0 0 100 100" className="w-[300px] h-[300px] -rotate-90 transform">
                                        {(() => {
                                            const total = (Number(project.budget) || 0) + financials.totalAdditives;
                                            if (total === 0) return null;

                                            const measuredBase = measurements.filter(m => !m.additive_id).reduce((s, m) => s + Number(m.value), 0);
                                            const measuredAdds = measurements.filter(m => m.additive_id).reduce((s, m) => s + Number(m.value), 0);
                                            const balance = total - measuredBase - measuredAdds;

                                            const p1 = (measuredBase / total) * 100; // Base Measured
                                            const p2 = (measuredAdds / total) * 100; // Adds Measured
                                            const p3 = (balance / total) * 100;      // Remaining

                                            // Calculate Arc Paths
                                            const r = 40; const cx = 50; const cy = 50;
                                            const circ = 2 * Math.PI * r;

                                            const dash1 = (p1 * circ) / 100;
                                            const dash2 = (p2 * circ) / 100;
                                            const dash3 = (p3 * circ) / 100;

                                            const off1 = 0;
                                            const off2 = -(dash1);
                                            const off3 = -(dash1 + dash2);

                                            return (
                                                <>
                                                    {/* Base Measured Segment (Blue) */}
                                                    <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="#2563eb" strokeWidth="15"
                                                        strokeDasharray={`${dash1} ${circ}`} strokeDashoffset={off1} />

                                                    {/* Additives Measured Segment (Amber) */}
                                                    <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="#d97706" strokeWidth="15"
                                                        strokeDasharray={`${dash2} ${circ}`} strokeDashoffset={off2} />

                                                    {/* Balance Segment (Gray) */}
                                                    <circle cx={cx} cy={cy} r={r} fill="transparent" stroke="#e5e7eb" strokeWidth="15"
                                                        strokeDasharray={`${dash3} ${circ}`} strokeDashoffset={off3} />

                                                    {/* Center Label */}
                                                    <text x="50" y="55" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 50 50)" className="fill-gray-700 dark:fill-white text-[12px] font-black">
                                                        {financials.progress.toFixed(1)}%
                                                    </text>
                                                    <text x="50" y="65" textAnchor="middle" dominantBaseline="middle" transform="rotate(90 50 50)" className="fill-gray-400 text-[6px] uppercase font-bold">
                                                        Executado
                                                    </text>
                                                </>
                                            );
                                        })()}
                                    </svg>
                                </div>

                                {/* Legends and Stats */}
                                <div className="space-y-6">
                                    <div className="flex items-center gap-4 bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                                        <div className="size-4 bg-blue-600 rounded-full shadow-sm ring-2 ring-white"></div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold uppercase text-blue-600">Executado do Contrato Original</p>
                                            <p className="text-xl font-black text-gray-800 dark:text-gray-200">
                                                {formatCurrency(measurements.filter(m => !m.additive_id).reduce((s, m) => s + Number(m.value), 0))}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 bg-amber-50 dark:bg-amber-900/10 p-4 rounded-2xl border border-amber-100 dark:border-amber-800">
                                        <div className="size-4 bg-amber-600 rounded-full shadow-sm ring-2 ring-white"></div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold uppercase text-amber-600">Executado de Aditivos</p>
                                            <p className="text-xl font-black text-gray-800 dark:text-gray-200">
                                                {formatCurrency(measurements.filter(m => m.additive_id).reduce((s, m) => s + Number(m.value), 0))}
                                            </p>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-4 bg-gray-50 dark:bg-gray-800/50 p-4 rounded-2xl border border-gray-100 dark:border-gray-700">
                                        <div className="size-4 bg-gray-200 rounded-full shadow-sm ring-2 ring-white"></div>
                                        <div className="flex-1">
                                            <p className="text-xs font-bold uppercase text-gray-400">Saldo Restante a Medir</p>
                                            <p className="text-xl font-black text-gray-800 dark:text-gray-200">{formatCurrency(financials.balance)}</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TECHNICAL DOCUMENTS TAB (NEW) */}
                    {activeTab === 'tech_docs' && (
                        <div>
                            <div className="bg-blue-50 border border-blue-100 p-6 rounded-2xl mb-6 flex justify-between items-center">
                                <div>
                                    <h3 className="font-bold text-blue-800 uppercase text-sm mb-1">Documentos Técnicos Vinculados</h3>
                                    <p className="text-xs text-blue-600">Relacione ou crie documentos técnicos (ofícios, relatórios, laudos) para esta obra.</p>
                                </div>
                                <button onClick={handleOpenLinkModal} className="bg-blue-600 text-white font-bold px-4 py-2 rounded-xl text-xs uppercase shadow-lg shadow-blue-500/20 hover:bg-blue-700 transition-colors">
                                    Vincular Documento
                                </button>
                            </div>

                            <TechnicalDocumentsList projectId={project.id} />
                        </div>
                    )}

                    {/* MAP TAB */}
                    {activeTab === 'map' && (
                        <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden shadow-sm h-[600px] relative border border-gray-100 dark:border-slate-700 z-0">
                            {project.longitude && project.latitude ? (
                                <MapContainer
                                    center={[project.latitude, project.longitude]}
                                    zoom={17}
                                    style={{ height: '100%', width: '100%' }}
                                >
                                    <TileLayer
                                        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
                                        attribution='Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
                                        maxNativeZoom={17}
                                        maxZoom={22}
                                    />

                                    <SingleMapCenter coords={[project.latitude, project.longitude]} />

                                    <Marker position={[project.latitude, project.longitude]}>
                                        <Popup>
                                            <div className="text-center">
                                                <h3 className="font-bold text-sm mb-1">{project.name}</h3>
                                                <p className="text-xs text-gray-500">{project.location}</p>
                                            </div>
                                        </Popup>
                                    </Marker>
                                </MapContainer>
                            ) : (
                                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 bg-gray-50">
                                    <span className="material-symbols-outlined text-5xl mb-2 opacity-50">location_off</span>
                                    <p className="font-medium uppercase">Coordenadas não cadastradas</p>
                                    <p className="text-xs">Edite a obra para adicionar Latitude e Longitude.</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* DOCUMENTS TAB */}
                    {activeTab === 'docs' && (
                        <div>
                            <div className="flex justify-end mb-6">
                                <button onClick={() => setIsDocModalOpen(true)} className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">upload_file</span> Novo Documento
                                </button>
                            </div>
                            {documents.length === 0 ? (
                                <div className="p-10 text-center text-gray-400 bg-white dark:bg-slate-800 rounded-3xl">Nenhum documento anexado.</div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {documents.map(doc => (
                                        <div key={doc.id} className="bg-white dark:bg-slate-800 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex items-start gap-4">
                                            <div className="size-10 bg-red-50 text-red-500 rounded-lg flex items-center justify-center flex-shrink-0">
                                                <span className="material-symbols-outlined">description</span>
                                            </div>
                                            <div className="flex-1 overflow-hidden">
                                                <h5 className="font-bold truncate" title={doc.title}>{doc.title}</h5>
                                                <span className="text-xs text-gray-400 uppercase block mb-1">{doc.category}</span>
                                                {/* Logic: if file_content exists in DB (even if not loaded in list for perf, assume we have it or fetch it) 
                                                    Actually, for now we load * select.
                                                */}
                                                {(doc as any).file_content ? (
                                                    <button onClick={() => { setSelectedFileContent((doc as any).file_content); setIsFileModalOpen(true); }} className="text-primary hover:text-blue-700 block" title="Visualizar Arquivo">
                                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                                    </button>
                                                ) : doc.url ? (
                                                    <a href={doc.url} target="_blank" rel="noreferrer" className="text-primary hover:text-blue-700 block" title="Link Externo">
                                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                                    </a>
                                                ) : <span className="text-gray-300 block">-</span>}
                                            </div>
                                            <button onClick={() => handleDeleteDocument(doc.id)} className="text-gray-300 hover:text-red-500">
                                                <span className="material-symbols-outlined text-lg">delete</span>
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ADDITIVES TAB */}
                    {activeTab === 'additives' && (
                        <div>
                            <div className="flex justify-end mb-6">
                                <button onClick={() => openAddModal()} className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">add</span> Novo Aditivo
                                </button>
                            </div>
                            {additives.length === 0 ? (
                                <div className="p-10 text-center text-gray-400 bg-white dark:bg-slate-800 rounded-3xl">Nenhum aditivo cadastrado.</div>
                            ) : (
                                <div className="space-y-4">
                                    {additives.map(add => (
                                        <div key={add.id} className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-gray-100 dark:border-slate-700 flex justify-between items-center group">
                                            <div>
                                                <h5 className="font-bold text-lg">{add.description}</h5>
                                                <p className="text-sm text-gray-500">Data: {new Date(add.date).toLocaleDateString()}</p>
                                                {(add as any).file_content ? (
                                                    <button onClick={() => { setSelectedFileContent((add as any).file_content); setIsFileModalOpen(true); }} className="text-primary hover:text-blue-700 mt-2" title="Visualizar Anexo">
                                                        <span className="material-symbols-outlined text-lg">visibility</span>
                                                    </button>
                                                ) : add.pdf_url && (
                                                    <a href={add.pdf_url} target="_blank" className="text-primary hover:text-blue-700 mt-2 flex items-center" title="Link Externo">
                                                        <span className="material-symbols-outlined text-lg">link</span>
                                                    </a>
                                                )}
                                            </div>
                                            <div className="flex items-center gap-6">
                                                <div className="text-right">
                                                    <span className="block text-xs text-gray-400 uppercase font-bold">Valor Adicionado</span>
                                                    <span className="font-black text-xl text-amber-500">+ {formatCurrency(add.value)}</span>
                                                </div>
                                                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button onClick={() => openAddModal(add)} className="p-2 bg-gray-100 hover:bg-blue-100 text-gray-400 hover:text-blue-600 rounded-full transition-colors"><span className="material-symbols-outlined text-sm">edit</span></button>
                                                    <button onClick={() => handleDeleteAdditive(add.id)} className="p-2 bg-gray-100 hover:bg-red-100 text-gray-400 hover:text-red-600 rounded-full transition-colors"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* MEASUREMENTS TAB */}
                    {activeTab === 'measurements' && (
                        <div>
                            <div className="flex justify-end mb-6">
                                <button onClick={() => openMeasModal()} className="bg-primary text-white font-bold px-4 py-2 rounded-xl text-sm flex items-center gap-2">
                                    <span className="material-symbols-outlined text-sm">post_add</span> Nova Medição
                                </button>
                            </div>
                            <div className="bg-white dark:bg-slate-800 rounded-3xl overflow-hidden border border-gray-100 dark:border-slate-700">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 dark:bg-slate-900 border-b dark:border-slate-700 text-gray-400 uppercase text-[10px]">
                                        <tr>
                                            <th className="px-6 py-4">Data Ref.</th>
                                            <th className="px-6 py-4">Referência</th>
                                            <th className="px-6 py-4">Obs</th>
                                            <th className="px-6 py-4 text-right">Valor Medido</th>
                                            <th className="px-6 py-4">Anexo</th>
                                            <th className="px-6 py-4 text-right">Ações</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y dark:divide-slate-700">
                                        {measurements.length === 0 ? (
                                            <tr><td colSpan={6} className="px-6 py-10 text-center text-gray-400">Nenhuma medição lançada.</td></tr>
                                        ) : measurements.map(m => {
                                            const relatedAdditive = additives.find(a => a.id === m.additive_id);
                                            return (
                                                <tr key={m.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/50 group">
                                                    <td className="px-6 py-4 font-bold">{new Date(m.reference_month).toLocaleDateString()}</td>
                                                    <td className="px-6 py-4">
                                                        {m.additive_id ?
                                                            <span className="bg-amber-100 text-amber-700 px-2 py-1 rounded text-xs font-bold">Aditivo ({relatedAdditive?.description.slice(0, 10)}...)</span> :
                                                            <span className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs font-bold">Contrato Base</span>
                                                        }
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-500 max-w-[200px] truncate" title={m.observation}>{m.observation || '-'}</td>
                                                    <td className="px-6 py-4 text-right font-mono font-bold text-gray-900 dark:text-white">{formatCurrency(m.value)}</td>
                                                    <td className="px-6 py-4">
                                                        {(m as any).file_content ? (
                                                            <button onClick={() => { setSelectedFileContent((m as any).file_content); setIsFileModalOpen(true); }} className="text-primary hover:text-blue-700" title="Visualizar Medição">
                                                                <span className="material-symbols-outlined">visibility</span>
                                                            </button>
                                                        ) : m.pdf_url ? (
                                                            <a href={m.pdf_url} target="_blank" className="text-primary hover:text-blue-700" title="Link Externo">
                                                                <span className="material-symbols-outlined">link</span>
                                                            </a>
                                                        ) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => openMeasModal(m)} className="text-gray-400 hover:text-blue-600"><span className="material-symbols-outlined text-sm">edit</span></button>
                                                            <button onClick={() => handleDeleteMeasurement(m.id)} className="text-gray-400 hover:text-red-600"><span className="material-symbols-outlined text-sm">delete</span></button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                    <tfoot className="bg-gray-50 dark:bg-slate-900 font-bold border-t dark:border-slate-700">
                                        <tr>
                                            <td colSpan={3} className="px-6 py-4 text-right uppercase text-xs text-gray-500">Total Medido</td>
                                            <td className="px-6 py-4 text-right text-lg text-blue-600 font-black">{formatCurrency(financials.totalMeasured)}</td>
                                            <td colSpan={2}></td>
                                        </tr>
                                    </tfoot>
                                </table>
                            </div>
                        </div>
                    )}

                </div>
            </div >

            {/* MODALS */}
            {/* Doc Modal */}
            {/* Doc Modal (Upload File Support) */}
            {
                isDocModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                            <h3 className="text-xl font-bold mb-4">Novo Arquivo / Documento</h3>
                            <div className="space-y-4">
                                <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Título (Ex: Planta Baixa)" value={newDoc.title} onChange={e => setNewDoc({ ...newDoc, title: e.target.value })} />
                                <select className="w-full bg-gray-50 border p-3 rounded-xl" value={newDoc.category} onChange={e => setNewDoc({ ...newDoc, category: e.target.value })}>
                                    <option value="Projeto">Projeto</option>
                                    <option value="Edital">Edital</option>
                                    <option value="Contrato">Contrato</option>
                                    <option value="Planilha">Planilha</option>
                                    <option value="Outros">Outros</option>
                                </select>

                                <div>
                                    <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Link Externo (URL)</label>
                                    <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="https://..." value={newDoc.url} onChange={e => setNewDoc({ ...newDoc, url: e.target.value })} />
                                </div>

                                <div className="border-t pt-2 mt-2">
                                    <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Ou Anexar Arquivo (PDF/Imagem)</label>
                                    <input
                                        type="file"
                                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    // Store base64 in file_content NOT url
                                                    setNewDoc({ ...newDoc, file_content: reader.result as string, url: '' });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                    <p className="text-[10px] text-gray-400 mt-1">Arquivos locais serão convertidos e salvos no banco.</p>
                                </div>

                            </div>
                            <div className="flex gap-2 mt-6">
                                <button onClick={() => setIsDocModalOpen(false)} className="flex-1 py-3 font-bold text-gray-400">Cancelar</button>
                                <button onClick={handleSaveDocument} disabled={isSaving} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar'}</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Additive Modal */}
            {
                isAddModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                            <h3 className="text-xl font-bold mb-4">{editingAddId ? 'Editar Aditivo' : 'Novo Aditivo'}</h3>
                            <div className="space-y-4">
                                <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Descrição (Ex: Aditivo de Prazo e Valor)" value={newAdd.description} onChange={e => setNewAdd({ ...newAdd, description: e.target.value })} />
                                <input type="number" className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Valor (R$)" value={newAdd.value} onChange={e => setNewAdd({ ...newAdd, value: e.target.value })} />
                                <input type="date" className="w-full bg-gray-50 border p-3 rounded-xl" value={newAdd.date} onChange={e => setNewAdd({ ...newAdd, date: e.target.value })} />
                                <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Link do PDF (Opcional)" value={newAdd.pdf_url} onChange={e => setNewAdd({ ...newAdd, pdf_url: e.target.value })} />

                                <div className="border-t pt-2 mt-2">
                                    <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Ou Anexar Arquivo (PDF)</label>
                                    <input
                                        type="file"
                                        accept="application/pdf,image/*"
                                        className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                        onChange={(e) => {
                                            const file = e.target.files?.[0];
                                            if (file) {
                                                const reader = new FileReader();
                                                reader.onloadend = () => {
                                                    setNewAdd({ ...newAdd, file_content: reader.result as string });
                                                };
                                                reader.readAsDataURL(file);
                                            }
                                        }}
                                    />
                                </div>
                            </div>
                            <div className="flex gap-2 mt-6">
                                <button onClick={() => setIsAddModalOpen(false)} className="flex-1 py-3 font-bold text-gray-400">Cancelar</button>
                                <button onClick={handleSaveAdditive} disabled={isSaving} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50">{isSaving ? 'Salvando...' : 'Salvar'}</button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Measurement Modal */}
            {isMeasModalOpen && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
                    <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-md shadow-2xl">
                        <h3 className="text-xl font-bold mb-4">{editingMeasId ? 'Editar Medição' : 'Nova Medição'}</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Referente a</label>
                                <select className="w-full bg-gray-50 border p-3 rounded-xl" value={newMeas.additive_id} onChange={e => setNewMeas({ ...newMeas, additive_id: e.target.value })}>
                                    <option value="">Contrato Principal</option>
                                    {additives.map(add => <option key={add.id} value={add.id}>Aditivo: {add.description} ({formatCurrency(add.value)})</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Valor Medido (R$)</label>
                                <input type="number" className="w-full bg-gray-50 border p-3 rounded-xl font-black text-lg" placeholder="0.00" value={newMeas.value} onChange={e => setNewMeas({ ...newMeas, value: e.target.value })} />
                            </div>
                            <div>
                                <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Data da Medição</label>
                                <input type="date" className="w-full bg-gray-50 border p-3 rounded-xl" value={newMeas.reference_month} onChange={e => setNewMeas({ ...newMeas, reference_month: e.target.value })} />
                            </div>
                            <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Observações" value={newMeas.observation} onChange={e => setNewMeas({ ...newMeas, observation: e.target.value })} />
                            <input className="w-full bg-gray-50 border p-3 rounded-xl" placeholder="Link do PDF da Medição" value={newMeas.pdf_url} onChange={e => setNewMeas({ ...newMeas, pdf_url: e.target.value })} />

                            <div className="border-t pt-2 mt-2">
                                <label className="text-xs uppercase text-gray-400 font-bold block mb-1">Ou Anexar Arquivo (PDF)</label>
                                <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    className="w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) {
                                            const reader = new FileReader();
                                            reader.onloadend = () => {
                                                setNewMeas({ ...newMeas, file_content: reader.result as string });
                                            };
                                            reader.readAsDataURL(file);
                                        }
                                    }}
                                />
                            </div>
                        </div>
                        <div className="flex gap-2 mt-6">
                            <button onClick={() => setIsMeasModalOpen(false)} className="flex-1 py-3 font-bold text-gray-400">Cancelar</button>
                            <button onClick={handleSaveMeasurement} disabled={isSaving} className="flex-1 py-3 bg-primary text-white rounded-xl font-bold disabled:opacity-50">{isSaving ? 'Lançando...' : 'Lançar Medição'}</button>
                        </div>
                    </div>
                </div>
            )
            }

            {/* File Viewer Modal */}
            {
                isFileModalOpen && selectedFileContent && (
                    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 print:hidden">
                        <div className="bg-white dark:bg-slate-800 rounded-3xl w-full max-w-5xl h-[85vh] flex flex-col shadow-2xl overflow-hidden relative">
                            <div className="flex justify-between items-center p-4 border-b dark:border-slate-700 bg-gray-50 dark:bg-slate-900">
                                <h3 className="font-bold text-gray-700 dark:text-gray-200">Visualizar Arquivo</h3>
                                <button onClick={() => { setIsFileModalOpen(false); setSelectedFileContent(null); }} className="bg-gray-200 hover:bg-gray-300 dark:bg-slate-700 dark:hover:bg-slate-600 rounded-full p-2 transition-colors">
                                    <span className="material-symbols-outlined text-gray-600 dark:text-white">close</span>
                                </button>
                            </div>
                            <div className="flex-1 bg-gray-100 dark:bg-slate-950 relative">
                                <iframe
                                    src={selectedFileContent}
                                    className="w-full h-full border-0"
                                    title="File Viewer"
                                />
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Detail Modal */}
            {
                detailType && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-4 print:hidden" onClick={() => setDetailType(null)}>
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-lg shadow-2xl relative" onClick={e => e.stopPropagation()}>
                            <button onClick={() => setDetailType(null)} className="absolute top-4 right-4 bg-gray-100 p-2 rounded-full hover:bg-gray-200">
                                <span className="material-symbols-outlined">close</span>
                            </button>

                            {detailType === 'measured' && (
                                <>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-blue-600">payments</span> Detalhamento: Executado</h3>
                                    <div className="space-y-4">
                                        <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl">
                                            <p className="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase">Total Geral</p>
                                            <p className="text-3xl font-black text-blue-700 dark:text-blue-300">{formatCurrency(financials.totalMeasured)}</p>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="p-3 border rounded-xl">
                                                <p className="text-xs text-gray-500">Do Contrato Original</p>
                                                <p className="font-bold">{formatCurrency(measurements.filter(m => !m.additive_id).reduce((s, m) => s + Number(m.value), 0))}</p>
                                            </div>
                                            <div className="p-3 border rounded-xl">
                                                <p className="text-xs text-gray-500">De Aditivos</p>
                                                <p className="font-bold text-amber-600">{formatCurrency(measurements.filter(m => m.additive_id).reduce((s, m) => s + Number(m.value), 0))}</p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {detailType === 'balance' && (
                                <>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-gray-600">account_balance_wallet</span> Detalhamento: Saldo</h3>
                                    <div className="space-y-4">
                                        <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-xl">
                                            <p className="text-xs text-gray-500 font-bold uppercase">Saldo a Medir</p>
                                            <p className="text-3xl font-black text-gray-700 dark:text-gray-200">{formatCurrency(financials.balance)}</p>
                                        </div>
                                        <div className="text-sm space-y-2 border-t pt-4">
                                            <div className="flex justify-between">
                                                <span className="text-gray-500">Contrato Original:</span>
                                                <span className="font-mono">{formatCurrency(project.budget)}</span>
                                            </div>
                                            <div className="flex justify-between text-amber-600">
                                                <span>(+) Aditivos:</span>
                                                <span className="font-mono">{formatCurrency(financials.totalAdditives)}</span>
                                            </div>
                                            <div className="flex justify-between text-blue-600 font-bold border-b pb-2 mb-2">
                                                <span>(-) Já Medido:</span>
                                                <span className="font-mono">{formatCurrency(financials.totalMeasured)}</span>
                                            </div>
                                            <div className="flex justify-between font-black text-lg">
                                                <span>= Saldo Final:</span>
                                                <span className="font-mono">{formatCurrency(financials.balance)}</span>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                            {detailType === 'additives' && (
                                <>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-amber-500">note_add</span> Detalhamento: Aditivos</h3>
                                    <div className="space-y-4">
                                        <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-xl mb-4">
                                            <p className="text-xs text-amber-600 font-bold uppercase">Total Aditivado</p>
                                            <p className="text-3xl font-black text-amber-600">{formatCurrency(financials.totalAdditives)}</p>
                                        </div>
                                        <div className="max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                                            {additives.length === 0 ? <p className="text-gray-400 text-center text-sm">Nenhum aditivo.</p> :
                                                additives.map(add => (
                                                    <div key={add.id} className="mb-2 p-3 border rounded-xl flex justify-between items-center text-sm">
                                                        <div>
                                                            <p className="font-bold">{add.description}</p>
                                                            <p className="text-xs text-gray-500">{new Date(add.date).toLocaleDateString()}</p>
                                                        </div>
                                                        <p className="font-mono font-bold text-amber-600">+{formatCurrency(add.value)}</p>
                                                    </div>
                                                ))}
                                        </div>
                                    </div>
                                </>
                            )}

                            {detailType === 'pct_additives' && (
                                <>
                                    <h3 className="text-xl font-bold mb-4 flex items-center gap-2"><span className="material-symbols-outlined text-emerald-500">percent</span> Cálculo de Percentual</h3>
                                    <div className="space-y-4">
                                        <div className="bg-emerald-50 p-4 rounded-xl mb-4">
                                            <p className="text-xs text-emerald-600 font-bold uppercase">% Sobre Contrato Base</p>
                                            <p className="text-3xl font-black text-emerald-600">{((financials.totalAdditives / (project.budget || 1)) * 100).toFixed(2)}%</p>
                                        </div>
                                        <div className="text-sm bg-gray-100 p-4 rounded-xl font-mono text-center">
                                            <p className="text-gray-500 mb-2">Fórmula:</p>
                                            <p className="font-bold text-lg">( Total Aditivos / Valor Inicial ) × 100</p>
                                            <div className="mt-4 pt-4 border-t border-gray-300 text-left">
                                                <p>Total Aditivos: <span className="float-right text-amber-600 font-bold">{formatCurrency(financials.totalAdditives)}</span></p>
                                                <p>Valor Inicial: <span className="float-right font-bold">{formatCurrency(project.budget)}</span></p>
                                            </div>
                                        </div>
                                    </div>
                                </>
                            )}

                        </div>
                    </div>
                )
            }

            {/* Link Tech Doc Modal */}
            {
                isLinkDocModalOpen && (
                    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex items-center justify-center p-4 print:hidden">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl w-full max-w-2xl shadow-2xl h-[80vh] flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h3 className="text-xl font-bold">Vincular Documento Técnico</h3>
                                <button onClick={() => setIsLinkDocModalOpen(false)} className="bg-gray-100 p-2 rounded-full hover:bg-gray-200">
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>

                            <div className="mb-4">
                                <input
                                    className="w-full bg-gray-50 dark:bg-slate-900 border p-3 rounded-xl"
                                    placeholder="Buscar documento por título..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                />
                            </div>

                            <div className="flex-1 overflow-y-auto custom-scrollbar space-y-3">
                                {isSearchingDocs ? (
                                    <div className="flex flex-col items-center justify-center h-48">
                                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary mb-3"></div>
                                        <p className="text-gray-400 text-sm animate-pulse">Buscando documentos disponíveis...</p>
                                    </div>
                                ) : linkableDocs.length === 0 ? (
                                    <p className="text-center text-gray-400 py-10">Nenhum documento disponível para vínculo.</p>
                                ) : (
                                    linkableDocs
                                        .filter(d => d.title.toLowerCase().includes(searchTerm.toLowerCase()))
                                        .map(doc => (
                                            <div key={doc.id} className="bg-gray-50 dark:bg-slate-900 p-4 rounded-xl border border-gray-100 dark:border-slate-700 flex justify-between items-center">
                                                <div>
                                                    <h5 className="font-bold text-sm">{doc.title}</h5>
                                                    <p className="text-xs text-gray-500">{new Date(doc.created_at).toLocaleDateString()} • {doc.type || 'Geral'}</p>
                                                </div>
                                                <button onClick={() => handleLinkDocument(doc.id)} className="bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg text-xs font-bold uppercase hover:bg-blue-200">
                                                    Vincular
                                                </button>
                                            </div>
                                        ))
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

        </div >
    );
};

// Subcomponent for Technical Documents
const TechnicalDocumentsList = ({ projectId }: { projectId: string }) => {
    const [docs, setDocs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const navigate = useNavigate();

    const loadDocs = async () => {
        const { data } = await supabase.from('documents').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
        setDocs(data || []);
        setLoading(false);
    };

    useEffect(() => {
        loadDocs();
    }, [projectId]);

    const handleUnlink = async (e: React.MouseEvent, docId: string) => {
        e.stopPropagation();
        if (!window.confirm('Deseja realmente desvincular este documento desta obra?')) return;

        const { error } = await supabase.from('documents').update({ project_id: null }).eq('id', docId);
        if (error) alert('Erro: ' + error.message);
        else loadDocs();
    }

    if (loading) return <div className="text-center py-10 text-gray-400">Carregando documentos...</div>;

    if (docs.length === 0) return (
        <div className="text-center py-12 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
            <span className="material-symbols-outlined text-4xl text-gray-300 mb-2">description</span>
            <p className="text-gray-500 font-bold text-sm uppercase">Nenhum documento técnico vinculado.</p>
        </div>
    );

    return (
        <div className="grid grid-cols-1 gap-4">
            {docs.map(doc => (
                <div key={doc.id} onClick={() => navigate(`/editor/${doc.id}`)} className="bg-white p-4 rounded-xl border border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer transition-all flex justify-between items-center group relative">
                    <div className="flex items-center gap-4">
                        <div className={`size-10 rounded-lg flex items-center justify-center ${doc.status === 'finished' ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                            <span className="material-symbols-outlined">article</span>
                        </div>
                        <div>
                            <h4 className="font-bold text-gray-800 text-sm">{doc.title}</h4>
                            <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                                <span className="bg-gray-100 px-1.5 py-0.5 rounded uppercase font-bold text-[10px]">{doc.type || 'Geral'}</span>
                                <span>•</span>
                                <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${doc.status === 'finished' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                            {doc.status === 'finished' ? 'Finalizado' : 'Em Andamento'}
                        </span>

                        <button
                            onClick={(e) => handleUnlink(e, doc.id)}
                            className="p-2 bg-red-50 text-red-500 rounded-full hover:bg-red-100 transition-colors z-10"
                            title="Desvincular Documento"
                        >
                            <span className="material-symbols-outlined text-lg">link_off</span>
                        </button>

                        <span className="material-symbols-outlined text-gray-300 group-hover:text-primary">arrow_forward_ios</span>
                    </div>
                </div>
            ))}
        </div>
    );
};

// Map Helper
const SingleMapCenter = ({ coords }: { coords: [number, number] }) => {
    const map = useMap();
    useEffect(() => {
        map.setView(coords, 17);
        // Force map resize check to avoid grey tiles (common in tabs)
        setTimeout(() => map.invalidateSize(), 500);
    }, [coords, map]);
    return null;
};

// SVG Chart Component
const FinancialEvolutionChart = ({ measurements, totalContract }: { measurements: Measurement[], totalContract: number }) => {
    if (!measurements || measurements.length === 0) {
        return <div className="h-80 w-full flex items-center justify-center text-gray-400 text-xs bg-gray-50 rounded-xl border border-dashed">Sem dados para exibir o gráfico</div>;
    }

    // Sort and Aggregate Data by Month
    // Fix: Parse YYYY-MM-DD as UTC to avoid timezone shifts
    const sortedData = [...measurements].sort((a, b) => a.reference_month.localeCompare(b.reference_month));

    // Group purely by YYYY-MM
    const monthlyDataMap = new Map<string, { dateStr: string, value: number, formatted: string }>();

    sortedData.forEach(m => {
        // Assume YYYY-MM-DD string from input date field
        const [year, month, day] = m.reference_month.split('-').map(Number);
        const dateObj = new Date(year, month - 1, day); // Local time construction is safer for display if consistent
        const key = `${year}-${month}`; // Key by Year-Month (1-12)

        if (!monthlyDataMap.has(key)) {
            monthlyDataMap.set(key, {
                dateStr: m.reference_month,
                value: 0,
                formatted: dateObj.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' })
            });
        }
        monthlyDataMap.get(key)!.value += Number(m.value);
    });

    const chartData = Array.from(monthlyDataMap.values());

    const validValues = chartData.map(d => d.value);
    const avgValue = validValues.reduce((a, b) => a + b, 0) / (validValues.length || 1);

    // Calculate Accumulated
    let accum = 0;
    const dataWithAccum = chartData.map(d => {
        accum += d.value;
        return { ...d, accumulated: accum, accumPct: (accum / (totalContract || 1)) * 100 };
    });

    // Dimensions & Scales
    const width = 1200; // Logical width for viewing
    const height = 400;
    const padding = { top: 40, right: 40, bottom: 40, left: 60 };
    const chartInnerWidth = width - padding.left - padding.right;
    const chartInnerHeight = height - padding.top - padding.bottom;

    const maxMonthly = Math.max(...dataWithAccum.map(d => d.value));
    const maxAccum = totalContract > 0 ? totalContract : Math.max(...dataWithAccum.map(d => d.accumulated)) * 1.1;

    // Scale Helpers
    const getX = (i: number) => {
        if (dataWithAccum.length <= 1) return width / 2;
        return padding.left + (i * (chartInnerWidth / (dataWithAccum.length - 1)));
    };

    // Scale Monthly values to 60% of chart height Max
    const getMonthlyY = (val: number) => {
        const pct = val / (maxMonthly || 1);
        return (height - padding.bottom) - (pct * (chartInnerHeight * 0.6));
    };

    // Scale Accumulated to 100% of chart height
    const getAccumY = (val: number) => {
        const pct = val / (maxAccum || 1);
        return padding.top + chartInnerHeight * (1 - pct);
    };

    const avgY = getMonthlyY(avgValue);

    return (
        <div className="w-full h-[400px] bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-gray-100 dark:border-slate-700 p-4">
            <div className="w-full h-full relative">
                <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" className="w-full h-full overflow-visible">

                    {/* Grid Lines ONLY (removed average and monthly trend) */}
                    {[0, 0.25, 0.5, 0.75, 1].map(pct => {
                        const y = padding.top + chartInnerHeight * (1 - pct);
                        return (
                            <g key={pct}>
                                <line x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#e5e7eb" strokeWidth="1" />
                                <text x={padding.left - 10} y={y + 4} textAnchor="end" fontSize="12" fill="#9ca3af" className="font-mono">{Math.round(pct * 100)}%</text>
                            </g>
                        );
                    })}

                    {/* Accumulated Path (S-Curve) */}
                    <path
                        d={`M ${dataWithAccum.map((d, i) => `${getX(i)} ${getAccumY(d.accumulated)}`).join(' L ')}`}
                        fill="none"
                        stroke="#10b981"
                        strokeWidth="4"
                        strokeLinecap="round"
                        className="drop-shadow-sm"
                    />

                    {/* Data Points Loop */}
                    {dataWithAccum.map((d, i) => {
                        const x = getX(i);
                        const barY = getMonthlyY(d.value);
                        const barHeight = (height - padding.bottom) - barY;
                        const accumY = getAccumY(d.accumulated);

                        return (
                            <g key={i} className="group">
                                {/* Bar */}
                                <rect
                                    x={x - 10}
                                    y={barY}
                                    width={20}
                                    height={barHeight}
                                    fill="#3b82f6"
                                    opacity="0.2"
                                    rx="2"
                                    className="scale-y-100 group-hover:fill-blue-600 group-hover:opacity-40 transition-all origin-bottom"
                                />

                                {/* Monthly Dot */}
                                <circle cx={x} cy={barY} r="3" fill="#3b82f6" />

                                {/* Accum Dot */}
                                <circle cx={x} cy={accumY} r="5" fill="white" stroke="#10b981" strokeWidth="3" className="group-hover:r-7 transition-all" />

                                {/* Hover Line */}
                                <line x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="black" strokeWidth="1" strokeDasharray="2 2" opacity="0" className="group-hover:opacity-20" />

                                {/* X Label */}
                                <text x={x} y={height - 10} textAnchor="middle" fontSize="11" fill="#6b7280" fontWeight="bold">{d.formatted}</text>

                                {/* Tooltip (using SVG group relative to point) */}
                                <g className="opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none" transform={`translate(${x > width / 2 ? x - 160 : x + 20}, ${accumY - 40})`}>
                                    <rect width="150" height="90" rx="8" fill="#1e293b" fillOpacity="0.95" />
                                    <text x="75" y="20" textAnchor="middle" fill="white" fontWeight="bold" fontSize="12">{d.formatted}</text>

                                    <text x="10" y="45" fill="#93c5fd" fontSize="11">Mensal:</text>
                                    <text x="140" y="45" textAnchor="end" fill="white" fontSize="11" fontWeight="bold">
                                        {new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(d.value)}
                                    </text>

                                    <text x="10" y="65" fill="#86efac" fontSize="11">Acumulado:</text>
                                    <text x="140" y="65" textAnchor="end" fill="white" fontSize="11" fontWeight="bold">
                                        {new Intl.NumberFormat('pt-BR', { notation: 'compact', style: 'currency', currency: 'BRL' }).format(d.accumulated)}
                                    </text>

                                    <text x="10" y="82" fill="#d1d5db" fontSize="10">{d.accumPct.toFixed(1)}% Concluído</text>
                                </g>
                            </g>
                        );
                    })}
                </svg>

                {/* Legend Overlay */}
                <div className="absolute top-2 right-2 flex flex-col gap-1 bg-white/90 p-3 rounded-lg border text-xs shadow-sm">
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-1 bg-green-500 rounded-full"></span>
                        <span className="font-bold text-gray-700">Curva S (Acumulado)</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-3 h-1 bg-blue-500 rounded-full"></span>
                        <span className="text-gray-600">Medição Mensal</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default ProjectDetails;
