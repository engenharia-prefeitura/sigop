
import React, { forwardRef } from 'react';

interface PrintLayoutProps {
    document: any;
    settings: any;
    author: any;
    coAuthor?: any;
    isBulk?: boolean;
}

export const PrintLayout = forwardRef<HTMLDivElement, PrintLayoutProps>(({ document, settings, author, coAuthor, isBulk }, ref) => {
    const sections = document.content?.sections || [];

    // Verificação de assinaturas
    const isAuthorSigned = document.status === 'finished' || !!document.author_signed_at;
    const isCoAuthorSigned = document.status === 'finished' || !!document.co_author_signed_at;

    // Separação de seções
    const textSections = sections.filter((s: any) => s.type !== 'photos');
    const photoSections = sections.filter((s: any) => s.type === 'photos');

    // Data formatada com fallback
    const formatDate = (dateStr: string) => {
        if (!dateStr) return null;
        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) return null;
            return date.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
        } catch (e) { return null; }
    };
    const eventDate = formatDate(document.date || document.event_date);

    return (
        <div ref={ref} className="print-root bg-white text-black w-full">
            <style>{`
                @media print {
                    @page {
                        size: A4;
                        margin: 15mm 15mm 15mm 15mm;
                    }
                    html, body { 
                        margin: 0 !important; 
                        padding: 0 !important;
                        background: white !important;
                        background-color: white !important;
                        -webkit-print-color-adjust: exact; 
                        print-color-adjust: exact;
                    }
                }

                .print-root {
                    font-family: 'Times New Roman', serif;
                    line-height: 1.4;
                    background: white !important;
                    background-color: white !important;
                }

                /* REPETIÇÃO DO CABEÇALHO EM TODAS AS PÁGINAS */
                table.print-table {
                    width: 100%;
                    border-collapse: collapse;
                    table-layout: fixed;
                }
                
                thead.print-header {
                    display: table-header-group;
                }

                /* RODAPÉ DAS ASSINATURAS REPETIDO/FIXO NA BASE */
                tfoot.print-footer-area {
                    display: table-footer-group;
                }

                .footer-space {
                    height: 45mm; /* Espaço para as assinaturas */
                }

                .signature-container {
                    position: fixed;
                    bottom: 0;
                    left: 0;
                    right: 0;
                    width: 100%;
                    height: 40mm;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    gap: 10mm;
                    background: white;
                    border-top: 1px solid #000;
                    z-index: 9999;
                    padding-bottom: 5mm;
                }

                /* ESTILO DAS ASSINATURAS */
                .sig-box {
                    width: 70mm;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: flex-end;
                    position: relative;
                }

                .sig-img {
                    height: 18mm;
                    margin-bottom: -2mm;
                    z-index: 2;
                    object-fit: contain;
                }

                .sig-line {
                    width: 100%;
                    border-top: 1.5px solid #000;
                    margin-bottom: 2px;
                }

                .sig-name {
                    font-weight: bold;
                    text-transform: uppercase;
                    font-size: 10pt;
                    text-align: center;
                }

                .sig-role {
                    font-size: 8pt;
                    text-transform: uppercase;
                    text-align: center;
                }

                /* CONTEÚDO */
                .rich-text {
                    text-align: justify;
                    font-size: 12pt;
                }
                
                .rich-text * {
                    font-size: 12pt !important;
                    font-family: 'Times New Roman', serif !important;
                }

                .rich-text ul { list-style-type: disc; margin-left: 20px; padding-left: 20px; margin-bottom: 8px; }
                .rich-text ol { list-style-type: decimal; margin-left: 20px; padding-left: 20px; margin-bottom: 8px; }
                .rich-text li { margin-bottom: 4px; padding-left: 5px; }
                .rich-text p { margin-bottom: 8px; }

                .info-box {
                    border: 2px solid #000;
                    padding: 15px;
                    margin-bottom: 20px;
                    background: #f9f9f9;
                }

                .section-title {
                    font-weight: bold;
                    border-bottom: 2px solid #ccc;
                    margin-bottom: 10px;
                    margin-top: 10px;
                    text-transform: uppercase;
                    font-size: 12pt;
                }

                .avoid-break {
                    page-break-inside: avoid;
                    break-inside: avoid;
                }

                /* Ocultar elementos na tela que so devem sair no print */
                @media screen {
                    .signature-container { position: relative; margin-top: 50px; border: 1px dashed #ccc; }
                }
            `}</style>

            <table className="print-table">
                {/* CABEÇALHO QUE REPETE */}
                <thead className="print-header">
                    <tr>
                        <td>
                            <div className="header-wrapper flex items-center gap-6 border-b-2 border-black pb-4 mb-4 pt-2">
                                {settings?.company_logo_url && (
                                    <img src={settings.company_logo_url} className="h-16 w-auto object-contain" alt="Logo" />
                                )}
                                <div className="flex-1 text-center">
                                    <h1 className="text-xl font-bold uppercase leading-tight">{settings?.company_name}</h1>
                                    <p className="text-sm font-medium uppercase leading-tight">{settings?.header_text}</p>
                                </div>
                                <div className="min-w-[50px]"></div>
                            </div>
                            {false && photoPages.length > 0 && photoPages.map((page, pageIndex) => (
                                <div
                                    key={pageIndex}
                                    className="photo-page"
                                    style={{ pageBreakAfter: pageIndex < photoPages.length - 1 ? 'always' : 'auto' }}
                                >
                                    <div className="photo-header">
                                        <div className="flex items-center gap-2">
                                            {settings?.company_logo_url && <img src={settings.company_logo_url} className="h-6" alt="Logo" />}
                                            <span className="text-[7pt] font-black uppercase text-slate-500">{settings?.company_name}</span>
                                        </div>
                                        <span className="text-[7pt] font-mono text-slate-400 font-bold uppercase">
                                            Anexo Fotográfico - Registro de Evidências
                                        </span>
                                    </div>
                                    <div className="photo-grid" style={getPhotoGridStyle(page.length)}>
                                        {page.map((f: string, i: number) => {
                                            const photoNumber = pageIndex * photosPerPage + i + 1;
                                            return (
                                                <div key={photoNumber} className="photo-item">
                                                    <div className="photo-frame">
                                                        <img src={f} className="photo-img" alt={`Foto ${photoNumber}`} />
                                                    </div>
                                                    <div className="photo-label">REGISTRO FOTOGRÁFICO #{photoNumber}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </td>
                    </tr>
                </thead>

                {/* CORPO DO DOCUMENTO */}
                <tbody>
                    <tr>
                        <td>
                            <div className="main-content">
                                {/* INFO BOX */}
                                <div className="info-box avoid-break">
                                    <div className="text-center border-b border-black pb-2 mb-3">
                                        <h2 className="text-lg font-black uppercase tracking-widest">{document.title}</h2>
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <p className="text-[8pt] text-gray-500 uppercase font-bold">Documento / Identificação</p>
                                            <p className="text-sm font-bold uppercase">{document.type || 'TÉCNICO'} - {document.formatted_number || 'S/N'}</p>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-[8pt] text-gray-500 uppercase font-bold">Data do Evento</p>
                                            <p className="text-sm font-bold">{eventDate || 'NÃO INFORMADA'}</p>
                                        </div>
                                    </div>
                                </div>

                                {/* SEÇÕES DE TEXTO */}
                                {textSections.map((section: any) => (
                                    <div key={section.id} className="mb-6">
                                        <h3 className="section-title">{section.title}</h3>
                                        <div className="rich-text" dangerouslySetInnerHTML={{
                                            __html: section.content?.replace(/\n/g, '<br/>')
                                        }} />
                                    </div>
                                ))}

                                {/* ANEXO FOTOGRÁFICO */}
                                {photoSections.length > 0 && (
                                    <div className="photo-gallery">
                                        <div style={{ pageBreakBefore: 'always' }}></div>
                                        <h2 className="text-lg font-black uppercase border-b-2 border-black pb-2 mb-6 mt-4">Anexo Fotográfico</h2>
                                        {photoSections.map((section: any) => (
                                            <div key={section.id} className="mb-8">
                                                {section.title !== 'Relatório Fotográfico' && (
                                                    <h3 className="section-title">{section.title}</h3>
                                                )}
                                                <div className={`grid ${document.photos_per_page <= 2 ? 'grid-cols-1' : 'grid-cols-2'} gap-6`}>
                                                    {section.items.map((photo: any) => (
                                                        <div key={photo.id} className="avoid-break border border-gray-300 p-2 bg-white">
                                                            <div className="aspect-video mb-2 bg-gray-50 overflow-hidden">
                                                                <img src={photo.url} className="w-full h-full object-contain" />
                                                            </div>
                                                            <p className="text-[9pt] text-center font-bold uppercase text-gray-700 py-1 border-t bg-gray-50">
                                                                {photo.caption || 'Sem legenda'}
                                                            </p>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </td>
                    </tr>
                </tbody>

                {/* RESERVA DE ESPAÇO PARA O RODAPÉ FIXO */}
                <tfoot className="print-footer-area">
                    <tr>
                        <td>
                            <div className="footer-space"></div>
                        </td>
                    </tr>
                </tfoot>
            </table>

            {/* CONTAINER DE ASSINATURAS FIXO NA BASE DA FOLHA (Z-INDEX ALTO) */}
            <div className={`signature-container ${isBulk ? 'hidden' : ''}`}>
                {/* ASSINATURA AUTOR */}
                <div className="sig-box">
                    {isAuthorSigned && author?.signature_url && (
                        <img
                            src={author.signature_url}
                            className="sig-img"
                            alt="Assinatura"
                            style={{ height: '50mm', width: 'auto', maxWidth: '100%', objectFit: 'contain', position: 'relative', top: '15mm', marginBottom: '-6mm', zIndex: 2 }}
                        />
                    )}
                    <div className="sig-line"></div>
                    <p className="sig-name">{author?.full_name}</p>
                    <p className="sig-role">{author?.role_title} {author?.crea ? `[CREA ${author.crea}]` : ''}</p>
                </div>

                {/* ASSINATURA COAUTOR */}
                {coAuthor && (
                    <div className="sig-box">
                        {isCoAuthorSigned && coAuthor.signature_url && (
                            <img
                                src={coAuthor.signature_url}
                                className="sig-img"
                                alt="Assinatura"
                                style={{ height: '50mm', width: 'auto', maxWidth: '100%', objectFit: 'contain', position: 'relative', top: '15mm', marginBottom: '-6mm', zIndex: 2 }}
                            />
                        )}
                        <div className="sig-line"></div>
                        <p className="sig-name">{coAuthor.full_name}</p>
                        <p className="sig-role">{coAuthor.role_title} {coAuthor.crea ? `[CREA ${coAuthor.crea}]` : ''}</p>
                    </div>
                )}
            </div>
        </div>
    );
});

PrintLayout.displayName = 'PrintLayout';

export const NotificationPrintLayout = forwardRef<HTMLDivElement, PrintLayoutProps>(({ document: doc, settings, author, coAuthor }, ref) => {
    // Usar a assinatura gravada na notificação (author_signed_at) se existir, 
    // ou a assinatura do perfil se já estiver finalizado.
    const isAuthorSigned = !!doc.author_signed_at && !!author?.signature_url;
    const isCoAuthorSigned = !!doc.co_author_signed_at && !!coAuthor?.signature_url;
    const photos = Array.isArray(doc.fotos_json) ? doc.fotos_json : [];
    const requestedPhotosPerPage = Number(doc.photos_per_page || 4);
    const photosPerPage = [1, 2, 4, 6].includes(requestedPhotosPerPage) ? requestedPhotosPerPage : 4;
    const photoPages = photos.reduce((pages: string[][], photo: string, index: number) => {
        const pageIndex = Math.floor(index / photosPerPage);
        if (!pages[pageIndex]) pages[pageIndex] = [];
        pages[pageIndex].push(photo);
        return pages;
    }, []);

    const getPhotoGridStyle = (count: number) => {
        const effectiveCount = Math.max(count, 1);
        if (photosPerPage === 1) return { gridTemplateColumns: '1fr', gridTemplateRows: '1fr' };
        if (photosPerPage === 2) return { gridTemplateColumns: '1fr', gridTemplateRows: `repeat(${Math.max(effectiveCount, 2)}, minmax(0, 1fr))` };
        if (photosPerPage === 6) return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: `repeat(${Math.ceil(Math.max(effectiveCount, 6) / 2)}, minmax(0, 1fr))` };
        return { gridTemplateColumns: '1fr 1fr', gridTemplateRows: `repeat(${Math.ceil(Math.max(effectiveCount, 4) / 2)}, minmax(0, 1fr))` };
    };

    return (
        <div ref={ref} className="print-root bg-white text-black w-full font-serif leading-tight">
            <style>{`
                @media print {
                    @page { size: A4; margin: 15mm; }
                    html, body { margin: 0; padding: 0; background: white; }
                    .print-root { padding: 0 !important; }
                }
                
                table.print-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                thead.print-header { display: table-header-group; }
                tfoot.print-footer-area { display: table-footer-group; }
                .footer-space { height: 45mm; }

                .signature-container {
                    position: fixed; bottom: 0; left: 0; right: 0; width: 100%;
                    height: 45mm; display: flex; flex-direction: column; align-items: center;
                    background: white; border-top: 1px solid #000; z-index: 9999;
                    padding-top: 2mm;
                }

                .signature-row { display: flex; justify-content: center; align-items: flex-end; gap: 10mm; width: 100%; flex: 1; margin-bottom: 2mm; }
                .sig-box { width: 82mm; height: 34mm; position: relative; text-align: center; }
                .sig-img { position: absolute; left: 50%; top: 0; transform: translateX(-50%); height: 30mm; max-width: 78mm; z-index: 2; object-fit: contain; pointer-events: none; }
                .sig-line { position: absolute; left: 0; top: 15mm; width: 100%; border-top: 1.2px solid #000; z-index: 1; }
                .sig-name { position: absolute; left: 0; right: 0; top: 17mm; font-weight: bold; text-transform: uppercase; font-size: 8pt; text-align: center; margin-top: 2px; }
                .sig-role { position: absolute; left: 0; right: 0; top: 23mm; font-size: 7pt; text-transform: uppercase; text-align: center; color: #444; }

                .notif-title { font-size: 13pt; font-weight: 900; text-align: center; color: #000; margin-top: 2mm; text-transform: uppercase; letter-spacing: 1px; }
                .notif-label { font-size: 10pt; font-family: monospace; font-weight: bold; text-align: right; }
                
                .field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; margin-bottom: 2px; border-bottom: 1px solid #f5f5f5; padding-bottom: 2px; }
                .field-label { font-size: 7pt; font-weight: bold; color: #666; text-transform: uppercase; display: block; line-height: 1.1; }
                .field-value { font-size: 9pt; font-weight: bold; color: #000; line-height: 1.2; }

                .infracao-card { margin-bottom: 5px; border: 1px solid #eee; padding: 6px; border-radius: 4px; page-break-inside: avoid; }
                .infracao-titulo { font-size: 9pt; font-weight: bold; text-transform: uppercase; margin-bottom: 2px; color: #000; }
                .infracao-desc { font-size: 8pt; text-align: justify; margin-bottom: 3px; color: #333; line-height: 1.3; }
                .infracao-legal { font-size: 7pt; font-style: italic; color: #444; font-weight: bold; border-top: 1px dashed #eee; padding-top: 2px; }

                .photo-page { page-break-before: always; break-inside: avoid; }
                .photo-header { height: 10mm; display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #e5e7eb; padding-bottom: 1mm; margin-bottom: 2mm; }
                .photo-grid { display: grid; gap: 3mm; height: 172mm; margin-top: 0; }
                .photo-item { border: 1px solid #ccc; padding: 1.5mm; border-radius: 3px; text-align: center; page-break-inside: avoid; display: flex; flex-direction: column; min-height: 0; }
                .photo-frame { flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; background: #fafafa; overflow: hidden; }
                .photo-img { width: 100%; height: 100%; object-fit: contain; }
                .photo-label { font-size: 6pt; font-weight: bold; margin-top: 2px; color: #888; }
                .date-stamp { font-size: 9pt; font-weight: bold; text-align: right; width: 100%; padding-right: 15mm; margin-bottom: 1mm; }

                .watermark-container { position: relative; width: 100%; }
                .watermark {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) rotate(-45deg);
                    font-size: 80pt;
                    color: rgba(255, 0, 0, 0.15);
                    border: 15px solid rgba(255, 0, 0, 0.15);
                    padding: 20px 50px;
                    border-radius: 20px;
                    font-weight: 900;
                    text-transform: uppercase;
                    pointer-events: none;
                    z-index: 1000;
                    white-space: nowrap;
                }
            `}</style>

            <table className="print-table">
                <thead className="print-header">
                    <tr>
                        <td>
                            <div className="border-b-2 border-slate-900 mb-2 pb-2">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-3">
                                        {settings?.company_logo_url && <img src={settings.company_logo_url} className="h-14" alt="Logo" />}
                                        <div className="leading-[1.1]">
                                            <h1 className="text-base font-black uppercase text-slate-900">{settings?.company_name || 'PREFEITURA MUNICIPAL'}</h1>
                                            <p className="text-[9pt] font-bold text-slate-600">{settings?.header_text || 'SERVIÇO PÚBLICO'}</p>
                                        </div>
                                    </div>
                                    <div className="notif-label">Nº {String(doc.numero_sequencial || doc.id?.slice(0, 4)).padStart(4, '0')} - {doc.label_formatada}</div>
                                </div>
                                <div className="notif-title">{doc.tipo?.nome || 'Notificação'}</div>
                            </div>
                        </td>
                    </tr>
                </thead>

                <tbody>
                    <tr>
                        <td className="watermark-container">
                            {doc.is_cancelled && <div className="watermark">CANCELADO</div>}
                            {/* DADOS DO INFRATOR */}
                            <div className="bg-slate-50/50 p-3 rounded-lg border border-slate-100 mb-4">
                                <div className="field-row">
                                    <div>
                                        <span className="field-label">NOTIFICADO:</span>
                                        <span className="field-value">{doc.pessoas?.nome || 'N/A'}</span>
                                    </div>
                                    <div>
                                        <span className="field-label">CPF / CNPJ:</span>
                                        <span className="field-value font-mono">{doc.pessoas?.cpf_cnpj || '---'}</span>
                                    </div>
                                </div>
                                <div className="field-row" style={{ gridTemplateColumns: '1fr' }}>
                                    <div>
                                        <span className="field-label">LOCAL DA INFRAÇÃO:</span>
                                        <span className="field-value uppercase">{doc.loc_infracao || 'NÃO INFORMADO'}</span>
                                    </div>
                                </div>
                                <div className="field-row mt-1" style={{ borderBottom: 0 }}>
                                    <div>
                                        <span className="field-label text-blue-600">PRAZO PARA REGULARIZAÇÃO:</span>
                                        <span className="field-value text-blue-800 uppercase text-xs">{doc.prazo_dias} DIAS CORRIDOS</span>
                                    </div>
                                    <div>
                                        <span className="field-label text-red-600">VALOR DA MULTA:</span>
                                        <span className="field-value text-red-700 text-xs">
                                            {doc.multa_valor > 0
                                                ? `R$ ${new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(doc.multa_valor)}`
                                                : "R$ 0,00 (NÃO APLICADA)"}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* TEXTO PADRÃO DO TIPO SELECIONADO */}
                            <div className="text-[9pt] text-justify leading-tight mb-4 font-serif px-2 whitespace-pre-wrap">
                                {doc.texto_padrao_customizado}
                            </div>

                            {/* INFRAÇÕES */}
                            <div className="px-2">
                                <h3 className="text-xs font-black uppercase text-slate-400 mb-2 tracking-widest bg-slate-100 px-2 py-1 inline-block rounded">Descritivo das Irregularidades</h3>
                                {doc.infracoes_json?.map((inf: any, idx: number) => (
                                    <div key={idx} className="infracao-card">
                                        <div className="infracao-titulo">{idx + 1}. {inf.titulo}</div>
                                        <div className="infracao-desc">{inf.descricao}</div>
                                        <div className="infracao-legal">AMPARO LEGAL: {inf.fundamentacao}</div>
                                    </div>
                                ))}
                            </div>

                            {/* OBSERVAÇÕES */}
                            {doc.observacoes && (
                                <div className="mt-4 px-2">
                                    <h3 className="text-xs font-black uppercase text-slate-400 mb-1 tracking-widest">Observações Técnicas Complementares</h3>
                                    <div className="bg-slate-50 p-3 italic text-[9pt] border border-slate-100 rounded text-slate-700 whitespace-pre-wrap">
                                        {doc.observacoes}
                                    </div>
                                </div>
                            )}

                            {/* ANEXOS FOTOGRÁFICOS */}
                            {photoPages.length > 0 && photoPages.map((page, pageIndex) => (
                                <div
                                    key={pageIndex}
                                    className="photo-page"
                                >
                                    <div className="flex items-center justify-between border-b pb-1 mb-2">
                                        <div className="flex items-center gap-2">
                                            {settings?.company_logo_url && <img src={settings.company_logo_url} className="h-6" alt="Logo" />}
                                            <span className="text-[7pt] font-black uppercase text-slate-500">{settings?.company_name}</span>
                                        </div>
                                        <span className="text-[7pt] font-mono text-slate-400 font-bold uppercase">
                                            Anexo Fotográfico - Registro de Evidências
                                        </span>
                                    </div>
                                    <div className="photo-grid" style={getPhotoGridStyle(page.length)}>
                                        {page.map((f: string, i: number) => {
                                            const photoNumber = pageIndex * photosPerPage + i + 1;
                                            return (
                                                <div key={photoNumber} className="photo-item">
                                                    <div className="photo-frame">
                                                        <img src={f} className="photo-img" alt={`Foto ${photoNumber}`} />
                                                    </div>
                                                    <div className="photo-label">REGISTRO FOTOGRÁFICO #{photoNumber}</div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}

                            {false && doc.fotos_json && doc.fotos_json.length > 0 && (
                                <div className="mt-10" style={{ pageBreakBefore: 'always' }}>
                                    <div className="flex items-center justify-between border-b pb-1 mb-2">
                                        <div className="flex items-center gap-2">
                                            {settings?.company_logo_url && <img src={settings.company_logo_url} className="h-6" alt="Logo" />}
                                            <span className="text-[7pt] font-black uppercase text-slate-500">{settings?.company_name}</span>
                                        </div>
                                        <span className="text-[7pt] font-mono text-slate-400 font-bold uppercase">Anexo Fotográfico - Registro de Evidências</span>
                                    </div>
                                    <div className="photo-grid">
                                        {doc.fotos_json.map((f: string, i: number) => (
                                            <div key={i} className="photo-item">
                                                <img src={f} className="photo-img" alt={`Foto ${i + 1}`} />
                                                <div className="photo-label">REGISTRO FOTOGRÁFICO #{i + 1}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </td>
                    </tr>
                </tbody>

                <tfoot className="print-footer-area">
                    <tr>
                        <td><div className="footer-space"></div></td>
                    </tr>
                </tfoot>
            </table>

            {/* CONTAINER DE ASSINATURAS (FIXO NO FINAL DA FOLHA) */}
            <div className="signature-container">
                <div className="date-stamp">
                    {settings?.company_name || 'Município'}, {new Date(doc.data_emissao).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })}
                </div>
                <div className="signature-row">
                    <div className="sig-box">
                        {isAuthorSigned && <img src={author.signature_url} className="sig-img" alt="Assinatura" />}
                        <div className="sig-line"></div>
                        <p className="sig-name">{author?.full_name || 'AGENTE RESPONSÁVEL'}</p>
                        <p className="sig-role">{author?.role_title || 'CARGO'}</p>
                    </div>

                    {coAuthor && (
                        <div className="sig-box">
                            {isCoAuthorSigned && <img src={coAuthor.signature_url} className="sig-img" alt="Assinatura" />}
                            <div className="sig-line"></div>
                            <p className="sig-name">{coAuthor.full_name}</p>
                            <p className="sig-role">{coAuthor.role_title}</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
});

NotificationPrintLayout.displayName = 'NotificationPrintLayout';
