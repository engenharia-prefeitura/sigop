
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { PrintLayout, NotificationPrintLayout } from '../components/PrintLayout';

declare const html2pdf: any;

interface PrintPreviewProps {
    mode?: 'document' | 'notification';
}

const PrintPreview: React.FC<PrintPreviewProps> = ({ mode = 'document' }) => {
    const { id } = useParams();
    const navigate = useNavigate();
    const [docData, setDocData] = useState<any>(null);
    const [settings, setSettings] = useState<any>(null);
    const [author, setAuthor] = useState<any>(null);
    const [coAuthor, setCoAuthor] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        if (!id) return;
        setLoading(true);

        const { data: set } = await supabase.from('app_settings').select('*').single();
        setSettings(set);

        if (mode === 'notification') {
            const { data: notify } = await supabase
                .from('notificacoes')
                .select('*, pessoas(*), tipo:config_tipos_notificacao(*)')
                .eq('id', id)
                .single();

            if (notify) {
                setDocData(notify);
                const { data: auth } = await supabase
                    .from('profiles')
                    .select('full_name, role_title, signature_url')
                    .eq('id', notify.usuario_id)
                    .single();
                setAuthor(auth);

                if (notify.co_author_id) {
                    const { data: coAuth } = await supabase
                        .from('profiles')
                        .select('full_name, role_title, signature_url')
                        .eq('id', notify.co_author_id)
                        .single();
                    setCoAuthor(coAuth);
                }
            }
        } else {
            const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single();
            if (doc) {
                setDocData(doc);
                if (doc.created_by) {
                    const { data: auth } = await supabase.from('profiles').select('full_name, role_title, crea, signature_url').eq('id', doc.created_by).single();
                    setAuthor(auth);
                }
                if (doc.co_author_id) {
                    const { data: coAuth } = await supabase.from('profiles').select('full_name, role_title, crea, signature_url').eq('id', doc.co_author_id).single();
                    setCoAuthor(coAuth);
                }
            }
        }

        setLoading(false);
    };

    const handlePrint = () => {
        window.print();
    };

    if (loading) return <div className="p-10 text-center">Carregando visualização...</div>;
    if (!docData) return <div className="p-10 text-center">Documento não encontrado.</div>;

    return (
        <>
            <style>{`
                @media print {
                    .no-print {
                        display: none !important;
                    }
                    body {
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                    .bg-gray-100 {
                        background: white !important;
                        padding: 0 !important;
                        margin: 0 !important;
                    }
                }
            `}</style>
            <div className="bg-gray-100 min-h-screen py-8 overflow-y-auto">
                <div className="max-w-[210mm] mx-auto mb-4 flex justify-between items-center px-4 no-print">
                    <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-gray-600 hover:text-black font-bold">
                        <span className="material-symbols-outlined">arrow_back</span>
                        Voltar
                    </button>
                    <button onClick={handlePrint} className="flex items-center gap-2 bg-blue-600 text-white px-6 py-2 rounded-lg font-bold shadow hover:bg-blue-700">
                        <span className="material-symbols-outlined">print</span>
                        Imprimir / Salvar PDF
                    </button>
                </div>

                {mode === 'notification' ? (
                    <NotificationPrintLayout
                        document={docData}
                        settings={settings}
                        author={author}
                        coAuthor={coAuthor}
                    />
                ) : (
                    <PrintLayout
                        document={docData}
                        settings={settings}
                        author={author}
                        coAuthor={coAuthor}
                    />
                )}
            </div>
        </>
    );
};

export default PrintPreview;
