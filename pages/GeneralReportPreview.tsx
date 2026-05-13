
import React, { useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { GeneralReportLayout } from '../components/GeneralReportLayout';

const GeneralReportPreview: React.FC = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const month = searchParams.get('month');
    const filter = searchParams.get('filter') as 'all' | 'user';

    const [documents, setDocuments] = useState<any[]>([]);
    const [settings, setSettings] = useState<any>(null);
    const [currentUser, setCurrentUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, [month, filter]);

    const loadData = async () => {
        setLoading(true);
        try {
            // 1. Configurações e Usuário
            const { data: set } = await supabase.from('app_settings').select('*').maybeSingle();
            setSettings(set);

            const { data: { user } } = await supabase.auth.getUser();
            if (!user) {
                alert('Usuário não autenticado');
                navigate('/login');
                return;
            }

            // Busca perfil completo para assinatura
            const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle();
            setCurrentUser(profile);

            // 2. Query Parameters
            const statusFinished = searchParams.get('status_finished') === 'true';
            const statusDrafts = searchParams.get('status_drafts') === 'true';
            const typesParam = searchParams.get('types');
            const targetTypes = typesParam ? JSON.parse(typesParam) : null;
            const excludedIdsParam = searchParams.get('excluded_ids');
            const excludedIds = excludedIdsParam ? JSON.parse(excludedIdsParam) : [];

            let query = supabase.from('documents').select('*');

            // Filtro de Usuário
            if (filter === 'user') {
                query = query.or(`created_by.eq.${user.id},co_author_id.eq.${user.id}`);
            }

            // Filtro de Status na Query
            // Como Supabase .or() é complexo com outros filtros, vamos trazer tudo do usuário e filtrar status no JS se necessário, 
            // mas podemos tentar otimizar: 'status.in.(finished,draft)'
            const statuses = [];
            if (statusFinished) statuses.push('finished');
            if (statusDrafts) statuses.push('draft', 'awaiting_signature'); // Incluir awaiting signature como "Andamento"

            if (statuses.length > 0) {
                query = query.in('status', statuses);
            }

            const { data: rawDocs, error } = await query;
            if (error) throw error;

            // Fetch Profiles Manually to avoid Join Error
            const { data: profiles } = await supabase.from('profiles').select('id, full_name, role_title');
            const profileMap = new Map(profiles?.map(p => [p.id, p]));

            // Map profiles to docs
            const docsWithProfiles = (rawDocs || []).map((doc: any) => ({
                ...doc,
                author: profileMap.get(doc.created_by),
                co_author: profileMap.get(doc.co_author_id)
            }));



            // Filtros Client Side (Data e Tipo)
            let filteredDocs = docsWithProfiles;

            // 1. Data (Se Mês foi fornecido na URL)
            if (month) {
                filteredDocs = filteredDocs.filter((doc: any) => {
                    const date = doc.event_date || doc.created_at;
                    return date && date.startsWith(month);
                });
            }

            // 2. Tipos (Se array de tipos foi fornecido)
            if (targetTypes && Array.isArray(targetTypes)) {
                filteredDocs = filteredDocs.filter((doc: any) => targetTypes.includes(doc.type));
            }

            // 3. Excluded IDs
            if (excludedIds && excludedIds.length > 0) {
                filteredDocs = filteredDocs.filter((doc: any) => !excludedIds.includes(doc.id));
            }

            // Ordenar por data
            filteredDocs.sort((a: any, b: any) => {
                const dA = new Date(a.event_date || a.created_at).getTime();
                const dB = new Date(b.event_date || b.created_at).getTime();
                return dA - dB;
            });

            setDocuments(filteredDocs);

        } catch (err) {
            console.error(err);
            alert('Erro ao gerar relatório');
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="p-10 text-center font-bold text-gray-500">Gerando Relatório Geral...</div>;

    return (
        <div className="bg-gray-100 min-h-screen">
            <style>{`
                @media print {
                    .no-print { display: none !important; }
                }
            `}</style>

            {/* Toolbar Fixa */}
            <div className="no-print fixed top-0 left-0 right-0 bg-white border-b shadow-sm p-4 z-50 flex justify-between items-center">
                <button onClick={() => navigate('/documents')} className="flex items-center gap-2 text-gray-600 hover:text-black font-bold">
                    <span className="material-symbols-outlined">arrow_back</span>
                    Voltar aos Documentos
                </button>
                <div className="text-sm font-bold text-gray-500">
                    {documents.length} documentos encontrados em {month}
                </div>
                <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700">
                    <span className="material-symbols-outlined">print</span>
                    Imprimir Relatório
                </button>
            </div>

            <div className="pt-20 pb-10 flex justify-center overflow-y-auto">
                <div className="w-[210mm] bg-white shadow-xl min-h-[297mm]">
                    <GeneralReportLayout
                        documents={documents}
                        settings={settings}
                        reportMonth={month || ''}
                        currentUser={currentUser}
                        filterType={filter || 'all'}
                    />
                </div>
            </div>
        </div>
    );
};

export default GeneralReportPreview;
