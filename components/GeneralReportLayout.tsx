
import React, { forwardRef } from 'react';

interface GeneralReportLayoutProps {
    documents: any[];
    settings: any;
    reportMonth: string;
    currentUser: any;
    filterType: 'all' | 'user';
}

export const GeneralReportLayout = forwardRef<HTMLDivElement, GeneralReportLayoutProps>(({ documents, settings, reportMonth, currentUser, filterType }, ref) => {

    // Formatar Mês/Ano (ex: "2024-02" -> "FEVEREIRO DE 2024")
    const formatMonthYear = (val: string) => {
        if (!val) return '';
        const [year, month] = val.split('-');
        const date = new Date(parseInt(year), parseInt(month) - 1, 1);
        return date.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).toUpperCase();
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return 'Data n/i';
        return new Date(dateStr).toLocaleDateString('pt-BR');
    };

    return (
        <div ref={ref} className="print-root bg-white text-black w-full font-serif text-[12pt]">
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 15mm;
                    }
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important;
                        background: white !important;
                    }
                    .print-root {
                        width: 100%;
                    }
                }

                .print-table { width: 100%; border-collapse: collapse; }
                .print-header { display: table-header-group; }
                .print-footer { display: table-footer-group; }
                .footer-space { height: 50mm; }

                .doc-container {
                    margin-bottom: 30px;
                    border-bottom: 2px dashed #ccc;
                    padding-bottom: 20px;
                    page-break-inside: avoid;
                }
                .doc-header {
                    background-color: #f3f4f6;
                    border: 1px solid #e5e7eb;
                    padding: 10px;
                    margin-bottom: 15px;
                    border-radius: 4px;
                }
                .doc-title { font-weight: bold; font-size: 14pt; text-transform: uppercase; }
                .doc-meta { font-size: 10pt; color: #444; margin-top: 4px; display: flex; justify-content: space-between; font-weight: bold; text-transform: uppercase; }
                
                .section-title {
                    font-weight: bold;
                    border-bottom: 1px solid #000;
                    margin-bottom: 8px;
                    margin-top: 15px;
                    text-transform: uppercase;
                    font-size: 11pt;
                }

                .rich-text { text-align: justify; font-size: 11pt; line-height: 1.4; }
                .rich-text p { margin-bottom: 8px; }

                .photo-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
                .photo-item { border: 1px solid #eee; padding: 5px; page-break-inside: avoid; }
                .photo-img { width: 100%; height: 180px; object-fit: contain; background: #f9f9f9; }
                .photo-caption { font-size: 9pt; text-align: center; font-weight: bold; margin-top: 4px; text-transform: uppercase; }

                .signature-area {
                    margin-top: 50px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    page-break-inside: avoid;
                }
                .sig-line { width: 300px; border-top: 1px solid #000; margin-bottom: 5px; }
                .sig-name { font-weight: bold; text-transform: uppercase; }
                .sig-role { font-size: 10pt; text-transform: uppercase; }
            `}</style>

            <table className="print-table">
                <thead className="print-header">
                    <tr>
                        <td>
                            <div className="flex items-center gap-4 border-b-2 border-black pb-4 mb-6">
                                {settings?.company_logo_url && (
                                    <img src={settings.company_logo_url} className="h-16 w-auto object-contain" alt="Logo" />
                                )}
                                <div className="flex-1 text-center">
                                    <h1 className="text-xl font-bold uppercase">{settings?.company_name}</h1>
                                    <p className="text-sm font-bold text-gray-600 uppercase mb-1">{settings?.header_text}</p>
                                    <div className="border border-black py-1 px-4 text-sm font-bold uppercase inline-block rounded bg-gray-50">
                                        Relatório Geral {filterType === 'all' ? 'de Atividades da Equipe' : `de Atividades de ${currentUser?.full_name?.split(' ')[0]}`} - {formatMonthYear(reportMonth)}
                                    </div>
                                </div>
                                <div className="w-[80px]"></div>
                            </div>
                        </td>
                    </tr>
                </thead>

                <tbody>
                    <tr>
                        <td>
                            {/* PÁGINA DE RESUMO */}
                            <div className="mb-8 p-6 border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 page-break-after-always">
                                <h1 className="text-2xl font-black uppercase text-center mb-6 border-b-2 border-black pb-4">Resumo do Período</h1>

                                <div className="grid grid-cols-2 gap-8 mb-8">
                                    <div className="bg-white p-4 border border-gray-200 rounded-lg">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Período de Referência</p>
                                        <p className="text-lg font-black">{formatMonthYear(reportMonth)}</p>
                                    </div>
                                    <div className="bg-white p-4 border border-gray-200 rounded-lg">
                                        <p className="text-xs font-bold text-gray-400 uppercase">Total de Documentos</p>
                                        <p className="text-lg font-black">{documents.length} Documentos</p>
                                    </div>
                                </div>

                                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 border-b border-gray-200">
                                            <tr>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Data</th>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Identificação</th>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Título</th>
                                                <th className="px-4 py-2 font-bold uppercase text-[10px]">Tipo</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100">
                                            {documents.map((doc, i) => (
                                                <tr key={i}>
                                                    <td className="px-4 py-2 font-mono whitespace-nowrap">{formatDate(doc.event_date || doc.created_at)}</td>
                                                    <td className="px-4 py-2 font-bold text-[10px]">{doc.formatted_number || doc.id.slice(0, 4)}</td>
                                                    <td className="px-4 py-2">{doc.title}</td>
                                                    <td className="px-4 py-2 text-[10px] font-bold uppercase">{doc.type || 'Geral'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                                <div className="mt-8 text-center text-sm font-bold text-gray-500 uppercase">
                                    Este relatório contém {documents.length} registros no sistema.
                                    <br />
                                    Emitido por: {currentUser?.full_name} em {new Date().toLocaleDateString('pt-BR')}
                                </div>
                            </div>

                            <div className="flex flex-col gap-6" style={{ pageBreakBefore: 'always' }}>
                                {documents.length === 0 ? (
                                    <div className="text-center py-10 font-bold text-gray-500 uppercase">
                                        Nenhum documento encontrado para este período com os filtros selecionados.
                                    </div>
                                ) : (
                                    documents.map((doc, idx) => {
                                        const textSections = doc.content?.sections?.filter((s: any) => s.type !== 'photos') || [];
                                        const photoSections = doc.content?.sections?.filter((s: any) => s.type === 'photos') || [];
                                        const isLast = idx === documents.length - 1;

                                        // Pular quebra de página se for o primeiro
                                        const pageBreakClass = idx > 0 ? 'page-break-before-always' : '';

                                        return (
                                            <div key={doc.id} className={`doc-container ${isLast ? 'border-none' : ''}`} style={{ pageBreakBefore: idx > 0 ? 'always' : 'auto' }}>

                                                {/* Cabeçalho do Documento Individual */}
                                                <div className="doc-header">
                                                    <div className="doc-title">{doc.title}</div>
                                                    <div className="doc-meta">
                                                        <span>Doc nº: {doc.formatted_number || doc.id.slice(0, 4)}</span>
                                                        <span>Data: {formatDate(doc.event_date || doc.created_at)}</span>
                                                    </div>
                                                    <div className="doc-meta" style={{ marginTop: 2, fontSize: '9pt', color: '#666' }}>
                                                        <span>Autor: {doc.author?.full_name || 'Desconhecido'}</span>
                                                        <span>Status: {doc.status === 'finished' ? 'FINALIZADO' : doc.status === 'draft' ? 'RASCUNHO' : 'EM ANDAMENTO'}</span>
                                                    </div>
                                                </div>

                                                {/* Textos */}
                                                {textSections.map((sec: any, secIdx: number) => (
                                                    <div key={secIdx}>
                                                        <div className="section-title">{sec.title}</div>
                                                        <div className="rich-text" dangerouslySetInnerHTML={{ __html: sec.content }} />
                                                    </div>
                                                ))}

                                                {/* Fotos */}
                                                {photoSections.length > 0 && (
                                                    <div className='mt-4'>
                                                        <div className="section-title">REGISTRO FOTOGRÁFICO</div>
                                                        {photoSections.map((pSec: any, pSecIdx: number) => (
                                                            <div key={pSecIdx}>
                                                                {pSec.title !== 'Relatório Fotográfico' && <div className="font-bold text-sm uppercase mt-2">{pSec.title}</div>}
                                                                <div className="photo-grid">
                                                                    {pSec.items?.map((item: any, itemIdx: number) => (
                                                                        <div key={itemIdx} className="photo-item">
                                                                            <img src={item.url} className="photo-img" />
                                                                            <div className="photo-caption">{item.caption}</div>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        )
                                    })
                                )}
                            </div>
                        </td>
                    </tr>
                </tbody>

                <tfoot className="print-footer">
                    <tr>
                        <td>
                            <div className="footer-space"></div>
                        </td>
                    </tr>
                </tfoot>
            </table>

        </div>
    );
});

GeneralReportLayout.displayName = 'GeneralReportLayout';
