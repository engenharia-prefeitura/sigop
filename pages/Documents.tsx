
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Document } from '../types';
import { useAuth } from '../components/AuthContext';

const Documents: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation(); // Para receber busca global
  const { user } = useAuth(); // Context User
  const [docs, setDocs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [monthFilter, setMonthFilter] = useState('');

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: string, direction: 'asc' | 'desc' }>({ key: 'created_at', direction: 'desc' });

  // Dropdown Menu State
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // User & Signing
  // const [currentUser, setCurrentUser] = useState<any>(null); // REMOVED
  const [signModalOpen, setSignModalOpen] = useState(false);
  const [signDocId, setSignDocId] = useState<string | null>(null);
  const [signPassword, setSignPassword] = useState('');

  // General Report State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportFilterType, setReportFilterType] = useState<'all' | 'user'>('user');
  const [reportUseMonthFilter, setReportUseMonthFilter] = useState(true);
  const [reportIncludeFinished, setReportIncludeFinished] = useState(true);
  const [reportIncludeDrafts, setReportIncludeDrafts] = useState(false);
  // Simples lista de tipos para filtro (hardcoded por enquanto ou buscar do banco depois)
  const [reportDocTypes, setReportDocTypes] = useState<string[]>([]);
  // Carregar tipos únicos ao abrir modal ou montar componente

  // Carregar tipos únicos ao abrir modal
  useEffect(() => {
    const fetchTypes = async () => {
      if (reportModalOpen) {
        try {
          // Fetch all types (lightweight query)
          const { data } = await supabase.from('documents').select('type');
          if (data) {
            const uniqueTypes = Array.from(new Set(data.map(d => d.type).filter(Boolean))).sort();
            setReportDocTypes(uniqueTypes);
            // Select all by default only if empty selection
            if (reportSelectedTypes.length === 0) setReportSelectedTypes(uniqueTypes);
          }
        } catch (error) {
          console.error("Error fetching types:", error);
        }
      }
    };
    fetchTypes();
  }, [reportModalOpen]);

  const [reportSelectedTypes, setReportSelectedTypes] = useState<string[]>([]);

  // New State for Report Preview
  const [reportPreviewDocs, setReportPreviewDocs] = useState<any[]>([]);
  const [reportExcludedIds, setReportExcludedIds] = useState<Set<string>>(new Set());
  const [reportLoadingPreview, setReportLoadingPreview] = useState(false);

  // Fetch Preview Docs when filters change
  useEffect(() => {
    if (reportModalOpen) {
      fetchReportPreview();
    }
  }, [reportModalOpen, reportFilterType, reportUseMonthFilter, monthFilter, reportIncludeFinished, reportIncludeDrafts, reportSelectedTypes]);

  const fetchReportPreview = async () => {
    setReportLoadingPreview(true);
    try {
      let query = supabase.from('documents').select('id, title, type, status, event_date, created_at, created_by, co_author_id, formatted_number');

      // 1. Filter User Scope
      if (reportFilterType === 'user') {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          query = query.or(`created_by.eq.${user.id},co_author_id.eq.${user.id}`);
        }
      }

      // 2. Filter Month
      if (reportUseMonthFilter && monthFilter) {
        // Since we can't easily do "startsWith" on date column in all supabase versions without RPC or range, 
        // we will fetch more and filter in JS for safety, or use text match if optimized.
        // Let's filter in JS to be safe with existing logic patterns
      }

      // 3. Filter Status
      const statuses = [];
      if (reportIncludeFinished) statuses.push('finished');
      if (reportIncludeDrafts) statuses.push('draft', 'awaiting_signature');

      if (statuses.length > 0) {
        query = query.in('status', statuses);
      } else {
        // No status selected = No docs
        setReportPreviewDocs([]);
        setReportLoadingPreview(false);
        return;
      }

      const { data, error } = await query;

      if (data) {
        let filtered = data;

        // JS Filter for Month
        if (reportUseMonthFilter && monthFilter) {
          filtered = filtered.filter((d: any) => {
            const date = d.event_date || d.created_at;
            return date && date.startsWith(monthFilter);
          });
        }

        // JS Filter for Types
        if (reportSelectedTypes.length > 0 && reportDocTypes.length > 0) {
          filtered = filtered.filter((d: any) => reportSelectedTypes.includes(d.type));
        }

        // Sort by date
        filtered.sort((a, b) => new Date(a.event_date || a.created_at).getTime() - new Date(b.event_date || b.created_at).getTime());

        setReportPreviewDocs(filtered);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setReportLoadingPreview(false);
    }
  };

  const toggleReportDocExclusion = (id: string) => {
    const newSet = new Set(reportExcludedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setReportExcludedIds(newSet);
  };

  const toggleAllReportDocs = (selectAll: boolean) => {
    const newSet = new Set(reportExcludedIds);
    const visibleIds = reportPreviewDocs.map(d => d.id);

    if (selectAll) {
      // Remove visible from excluded list (include them)
      visibleIds.forEach(id => newSet.delete(id));
    } else {
      // Add visible to excluded list (exclude them)
      visibleIds.forEach(id => newSet.add(id));
    }
    setReportExcludedIds(newSet);
  };



  useEffect(() => {
    if (location.state?.globalSearch) {
      setSearchTerm(location.state.globalSearch);
      // Limpar state para não persistir ao navegar
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenuId(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchDocuments();
    }, 500);
    return () => clearTimeout(timer);
  }, [searchTerm, statusFilter, monthFilter]); // Re-fetch on filter change

  const getDbStatus = (filter: string) => {
    if (filter === 'Rascunho') return 'draft';
    if (filter === 'Finalizado') return 'finished';
    return null;
  };

  const fetchDocuments = async () => {
    try {
      setLoading(true);
      let data: any[] | null = [];
      let error = null;

      if (searchTerm) {
        const { data: searchData, error: searchError } = await supabase.rpc('search_documents', {
          search_query: searchTerm
        });
        data = searchData;
        error = searchError;
      } else {
        // Fetch docs simple (no join to avoid cache bug)
        // Optimization: Select only necessary columns to avoid fetching large 'content' JSON
        let query = supabase.from('documents').select(`
          id, 
          title, 
          description, 
          status, 
          created_by, 
          co_author_id, 
          author_signed_at, 
          co_author_signed_at, 
          created_at, 
          updated_at, 
          formatted_number, 
          document_number, 
          event_date,
          type
        `);
        const { data: normalData, error: normalError } = await query;
        data = normalData;
        error = normalError;
      }

      if (error) throw error;

      // WORKAROUND: Client-side join to fix missing FK cache issue
      // Fetch all profiles to map names
      const { data: profiles } = await supabase.from('profiles').select('id, full_name');
      const profileMap = new Map(profiles?.map(p => [p.id, p]) || []);

      // Merge manually
      const mergedData = (data || []).map((doc: any) => ({
        ...doc,
        author: profileMap.get(doc.created_by) || { full_name: 'Desconhecido' },
        co_author: doc.co_author_id ? profileMap.get(doc.co_author_id) : null
      }));

      let filteredDocs = mergedData;
      if (statusFilter !== 'all') {
        const dbStatus = getDbStatus(statusFilter);
        if (dbStatus) filteredDocs = filteredDocs.filter((d: any) => d.status === dbStatus);
      }

      if (monthFilter) {
        filteredDocs = filteredDocs.filter((d: any) => {
          const date = d.event_date || d.created_at;
          return date && date.startsWith(monthFilter);
        });
      }

      setDocs(filteredDocs);
    } catch (error) {
      console.error('Erro ao buscar documentos:', error);
    } finally {
      setLoading(false);
    }
  };

  // Sorting Logic (Client side for filtered results)
  const sortedDocs = [...docs].sort((a, b) => {
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle specific fields
    if (sortConfig.key === 'title') {
      aValue = (aValue || '').toLowerCase();
      bValue = (bValue || '').toLowerCase();
    } else if (sortConfig.key === 'document_number') {
      aValue = aValue || 0;
      bValue = bValue || 0;
    } else {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    }

    if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
    return 0;
  });

  const requestSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getSortIcon = (key: string) => {
    if (sortConfig.key !== key) return <span className="material-symbols-outlined text-[14px] text-gray-300">unfold_more</span>;
    return sortConfig.direction === 'asc'
      ? <span className="material-symbols-outlined text-[14px] text-primary">arrow_upward</span>
      : <span className="material-symbols-outlined text-[14px] text-primary">arrow_downward</span>;
  };

  const removeSignature = async (doc: any, role: 'author' | 'co_author') => {
    if (!confirm('Remover sua assinatura deste documento?')) return;
    try {
      const updates: any = {};
      if (role === 'author') updates.author_signed_at = null;
      else updates.co_author_signed_at = null;

      const otherSigned = role === 'author' ? doc.co_author_signed_at : doc.author_signed_at;

      if (doc.co_author_id) {
        // Se tem co-autor configurado
        if (otherSigned) updates.status = 'awaiting_signature';
        else updates.status = 'draft';
      } else {
        // Sem co-autor, volta para rascunho
        updates.status = 'draft';
      }

      const { error } = await supabase.from('documents').update(updates).eq('id', doc.id);
      if (error) throw error;
      fetchDocuments();
    } catch (err) {
      alert('Erro ao remover assinatura');
    }
  };

  const deleteDocument = async (id: string) => {
    const docToDelete = docs.find(d => d.id === id);
    if (docToDelete && docToDelete.status === 'finished') {
      alert('Este documento está finalizado e não pode ser excluído.');
      return;
    }

    if (!confirm('Tem certeza que deseja excluir?')) return;
    try {
      const { error } = await supabase.from('documents').delete().eq('id', id);
      if (error) throw error;
      setDocs(docs.filter(d => d.id !== id));
      setOpenMenuId(null);
    } catch (err) {
      alert('Erro ao excluir documento');
    }
  };

  const handleSignDocument = async () => {
    if (!signPassword || !signDocId) return alert('Informe sua senha.');

    try {
      // Verify Password
      const { data: { user: signedUser }, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: signPassword
      });
      if (error || !signedUser) throw new Error('Senha incorreta');

      // Fetch doc
      const { data: currentDoc, error: docError } = await supabase.from('documents').select('*').eq('id', signDocId).single();
      if (docError || !currentDoc) throw new Error('Documento não encontrado.');

      const isCoAuthor = user.id === currentDoc.co_author_id;
      const isAuthor = user.id === currentDoc.created_by;

      if (!isCoAuthor && !isAuthor) throw new Error('Você não tem permissão para assinar este documento.');

      const now = new Date().toISOString();
      const updates: any = {};

      if (isCoAuthor) updates.co_author_signed_at = now;
      if (isAuthor) updates.author_signed_at = now;

      // Check Status
      const hasCoAuthor = !!currentDoc.co_author_id;
      let isFullySigned = false;
      if (!hasCoAuthor) {
        // Only author needed (and if we are here, we are the author signing)
        isFullySigned = true;
      } else {
        const authorSigned = isAuthor ? true : !!currentDoc.author_signed_at; // If I am author, I am signing now (true). If not, check DB.
        const coAuthorSigned = isCoAuthor ? true : !!currentDoc.co_author_signed_at; // same logic
        isFullySigned = authorSigned && coAuthorSigned;
      }

      if (isFullySigned) updates.status = 'finished';

      const { error: updateError } = await supabase.from('documents').update(updates).eq('id', signDocId);
      if (updateError) throw updateError;

      alert(isFullySigned ? 'Documento assinado e finalizado!' : 'Assinado com sucesso! Aguardando a outra parte.');

      setSignModalOpen(false);
      setSignPassword('');
      setSignDocId(null);
      fetchDocuments(); // Refresh list

    } catch (err: any) {
      alert(err.message || 'Erro ao assinar.');
    }
  };

  const handleUseAsTemplate = async (sourceDocId: string) => {
    try {
      if (!confirm('Deseja criar um novo documento usando este como modelo? (O texto será mantido, fotos serão removidas)')) return;
      setLoading(true);

      // 1. Fetch full document content
      const { data: sourceDoc, error: fetchError } = await supabase
        .from('documents')
        .select('*')
        .eq('id', sourceDocId)
        .single();

      if (fetchError || !sourceDoc) throw new Error('Erro ao carregar documento original.');

      // 2. Process Sections (Remove photos)
      let newSections = [];
      if (sourceDoc.content && sourceDoc.content.sections) {
        newSections = sourceDoc.content.sections.map((section: any) => {
          if (section.type === 'photos') {
            return { ...section, items: [] }; // Empty photos
          }
          return section; // Keep text sections as is
        });
      }

      // 3. Create New Document Payload
      const newDocPayload = {
        title: `${sourceDoc.title} (Cópia)`,
        description: sourceDoc.description,
        document_type_id: sourceDoc.document_type_id,
        type: sourceDoc.type,
        status: 'draft', // Reset status
        created_by: user.id, // Current user is the author
        content: { sections: newSections },
        event_date: null, // Reset event date
        photos_per_page: sourceDoc.photos_per_page || 4,
        co_author_id: null, // Reset co-author
        author_signed_at: null,
        co_author_signed_at: null
      };

      // 4. Insert
      const { data: newDoc, error: insertError } = await supabase
        .from('documents')
        .insert([newDocPayload])
        .select()
        .single();

      if (insertError) throw insertError;

      // 5. Navigate
      navigate(`/editor/${newDoc.id}`);

    } catch (e: any) {
      console.error(e);
      alert('Erro ao criar documento a partir do modelo: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const openSignModal = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSignDocId(id);
    setSignModalOpen(true);
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return 'Rascunho';
      case 'waiting_signature': return 'Aguardando Assinatura';
      case 'finished': return 'Finalizado';
      case 'rejected': return 'Rejeitado';
      default: return 'Em Progresso';
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit'
    });
  };



  return (
    <div className="p-6 lg:p-10 w-full max-w-[98%] mx-auto animate-in fade-in duration-500 min-h-screen pb-20">
      <div className="flex flex-col gap-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex flex-col gap-1">
            <h2 className="text-[#111318] dark:text-white text-3xl font-black tracking-tight leading-tight">Documentos Técnicos</h2>
            <p className="text-[#616f89] dark:text-gray-400 text-sm font-medium">Gerencie toda a documentação de engenharia.</p>
          </div>
          <div className="flex items-center gap-3">

            <button onClick={() => navigate('/settings')} className="flex h-11 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 text-sm font-bold text-[#111318] dark:text-white hover:bg-gray-50 transition-all shadow-sm">
              <span className="material-symbols-outlined text-[20px] mr-2">settings</span>
              Configurar
            </button>
            <button onClick={() => setReportModalOpen(true)} className="flex h-11 items-center justify-center rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-5 text-sm font-bold text-[#111318] dark:text-white hover:bg-gray-50 transition-all shadow-sm">
              <span className="material-symbols-outlined text-[20px] mr-2">description</span>
              Relatório Geral
            </button>
            <button
              onClick={() => navigate('/editor/novo')}
              className="flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-bold text-white hover:bg-blue-700 transition-all shadow-lg shadow-blue-500/20"
            >
              <span className="material-symbols-outlined text-[20px] mr-2">add</span>
              Novo Documento
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col md:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <div className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-[#616f89]">
              <span className="material-symbols-outlined">search</span>
            </div>
            <input
              className="block w-full rounded-xl border-none bg-gray-50 dark:bg-gray-900 py-3 pl-12 pr-4 text-[#111318] dark:text-white placeholder:text-[#616f89] focus:ring-2 focus:ring-primary/20 text-sm font-medium"
              placeholder="Pesquisar por título ou conteúdo..."
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex w-full md:w-auto gap-3">
            <input
              type="month"
              className="h-11 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-primary/20 cursor-pointer px-4 outline-none"
              value={monthFilter}
              onChange={e => setMonthFilter(e.target.value)}
            />
            <select
              className="h-11 rounded-xl border-gray-200 dark:border-gray-700 dark:bg-gray-900 text-sm font-bold focus:ring-2 focus:ring-primary/20 cursor-pointer pl-4 pr-10 outline-none"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="all">Todos os Status</option>
              <option value="Rascunho">Rascunho</option>
              <option value="Finalizado">Finalizado</option>
            </select>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-visible">
          <div className="overflow-visible min-h-[400px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-800/50">
                  <th onClick={() => requestSort('document_number')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors w-[120px]">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Nº Doc {getSortIcon('document_number')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('title')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Título / Descrição {getSortIcon('title')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('type')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Tipo {getSortIcon('type')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('author_signed_at')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors w-[220px]">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Assinaturas {getSortIcon('author_signed_at')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('created_at')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors w-[150px]">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Criado em {getSortIcon('created_at')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('updated_at')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors w-[150px]">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Atualizado {getSortIcon('updated_at')}
                    </div>
                  </th>
                  <th onClick={() => requestSort('status')} className="py-5 px-6 cursor-pointer hover:bg-gray-100 transition-colors w-[120px]">
                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-gray-500">
                      Status {getSortIcon('status')}
                    </div>
                  </th>
                  <th className="py-5 px-6 text-[10px] font-black uppercase tracking-widest text-gray-500 text-right w-[80px]">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {loading ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-500">Carregando documentos...</td></tr>
                ) : sortedDocs.length === 0 ? (
                  <tr><td colSpan={7} className="py-10 text-center text-gray-500">Nenhum documento encontrado.</td></tr>
                ) : sortedDocs.map((doc: any) => {
                  const statusLabel = getStatusLabel(doc.status);
                  const isFinished = doc.status === 'finished';



                  const isCoAuthor = user?.id === doc.co_author_id;
                  const isAuthor = user?.id === doc.created_by; // Assumindo created_by como autor

                  let needsToSign = false;
                  if (doc.status === 'awaiting_signature') {
                    if (isCoAuthor && !doc.co_author_signed_at) needsToSign = true;
                    else if (isAuthor && !doc.author_signed_at) needsToSign = true;
                  }

                  return (
                    <tr key={doc.id} className="hover:bg-blue-50/30 transition-colors group relative">
                      {/* Coluna 1: Número */}
                      <td className="py-6 px-6 align-top">
                        {doc.formatted_number ? (
                          <div className="inline-block bg-gray-100 border border-gray-200 text-gray-700 px-2 py-1 rounded text-xs font-black">
                            {doc.formatted_number}
                          </div>
                        ) : (
                          <span className="text-gray-300 text-[10px] font-mono">#{doc.id.slice(0, 4)}</span>
                        )}
                      </td>

                      {/* Coluna 2: Título e Detalhes */}
                      <td className="py-6 px-6 align-top">
                        <button
                          onClick={() => navigate(`/editor/${doc.id}`)}
                          className="text-left font-bold text-gray-900 hover:text-primary hover:underline transition-colors text-sm leading-tight block mb-1"
                        >
                          {doc.title}
                        </button>
                        <p className="text-xs text-gray-400 mt-1 line-clamp-1 italic">{doc.description || 'Sem descrição'}</p>
                      </td>

                      {/* Coluna Nova: Tipo */}
                      <td className="py-6 px-6 align-top">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-gray-500 bg-gray-100 px-2 py-1 rounded-md whitespace-nowrap">
                          {doc.type || 'Geral'}
                        </span>
                      </td>

                      {/* Coluna 3: Assinaturas */}
                      <td className="py-6 px-6 align-top">
                        <div className="flex flex-col gap-2">
                          {/* Autor Block */}
                          <div className={`flex items-center gap-2 p-1.5 rounded-lg border text-[11px] ${doc.author_signed_at ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                            <span className="material-symbols-outlined text-[16px]">{doc.author_signed_at ? 'verified' : 'pending'}</span>
                            <div className="flex flex-col leading-none">
                              <span className="font-bold uppercase text-[9px] opacity-70">Autor</span>
                              <span className="font-bold">{doc.author?.full_name?.split(' ')[0] || '-'}</span>
                              {doc.author_signed_at && (
                                <span className="text-[8px] mt-0.5 opacity-80 whitespace-nowrap">{formatDate(doc.author_signed_at)}</span>
                              )}
                            </div>
                          </div>

                          {/* Co-Author Block (if exists) */}
                          {doc.co_author_id && (
                            <div className={`flex items-center gap-2 p-1.5 rounded-lg border text-[11px] ${doc.co_author_signed_at ? 'bg-blue-50 border-blue-100 text-blue-800' : 'bg-gray-50 border-gray-100 text-gray-400'}`}>
                              <span className="material-symbols-outlined text-[16px]">{doc.co_author_signed_at ? 'verified' : 'pending'}</span>
                              <div className="flex flex-col leading-none">
                                <span className="font-bold uppercase text-[9px] opacity-70">Coautor</span>
                                <span className="font-bold">{doc.co_author?.full_name?.split(' ')[0] || '-'}</span>
                                {doc.co_author_signed_at && (
                                  <span className="text-[8px] mt-0.5 opacity-80 whitespace-nowrap">{formatDate(doc.co_author_signed_at)}</span>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </td>

                      {/* Coluna 4: Criado em */}
                      <td className="py-6 px-6 align-top">
                        <span className="text-xs font-medium text-gray-500">{formatDate(doc.created_at)}</span>
                      </td>

                      {/* Coluna 5: Atualizado */}
                      <td className="py-6 px-6 align-top">
                        <span className="text-xs font-bold text-gray-500">{formatDate(doc.updated_at)}</span>
                      </td>

                      {/* Coluna 6: Status */}
                      <td className="py-6 px-6 align-top">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-[10px] font-black uppercase tracking-wide border ${isFinished ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                          'bg-gray-100 text-gray-600 border-gray-200'
                          }`}>
                          {statusLabel}
                        </span>
                      </td>

                      {/* Coluna 7: Ações */}
                      <td className="py-6 px-6 text-right align-top relative">
                        {needsToSign && (
                          <button
                            onClick={(e) => openSignModal(doc.id, e)}
                            className="mr-2 p-2 rounded-full text-green-600 hover:bg-green-50 transition-all inline-block align-middle"
                            title="Assinar Documento"
                          >
                            <span className="material-symbols-outlined text-[20px]">verified_user</span>
                          </button>
                        )}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenMenuId(openMenuId === doc.id ? null : doc.id);
                          }}
                          className={`p-2 rounded-full hover:bg-gray-100 text-gray-400 hover:text-primary transition-all inline-block align-middle ${openMenuId === doc.id ? 'bg-primary/10 text-primary' : ''}`}
                        >
                          <span className="material-symbols-outlined text-[20px]">more_vert</span>
                        </button>

                        {/* Dropdown Menu */}
                        {openMenuId === doc.id && (
                          <div
                            ref={menuRef}
                            className="absolute right-6 top-14 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-200"
                          >
                            <div className="flex flex-col py-1">
                              <button
                                onClick={() => navigate(`/print/${doc.id}`)}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 text-left"
                              >
                                <span className="material-symbols-outlined text-[18px]">print</span> Visualizar PDF
                              </button>

                              <button
                                onClick={() => handleUseAsTemplate(doc.id)}
                                className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 text-left"
                              >
                                <span className="material-symbols-outlined text-[18px]">content_copy</span> Usar como Modelo
                              </button>

                              {!isFinished && (
                                <button
                                  onClick={() => navigate(`/editor/${doc.id}`)}
                                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 text-left"
                                >
                                  <span className="material-symbols-outlined text-[18px]">edit</span> Editar
                                </button>
                              )}

                              {doc.status !== 'draft' && (
                                <button
                                  onClick={() => navigate(`/editor/${doc.id}`)}
                                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 text-left"
                                >
                                  <span className="material-symbols-outlined text-[18px]">undo</span> Reverter Status
                                </button>
                              )}

                              <div className="h-px bg-gray-100 my-1"></div>

                              {!isFinished && (
                                <button
                                  onClick={() => deleteDocument(doc.id)}
                                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-red-600 hover:bg-red-50 text-left"
                                >
                                  <span className="material-symbols-outlined text-[18px]">delete</span> Excluir
                                </button>
                              )}

                              {isAuthor && doc.author_signed_at && (
                                <button
                                  onClick={() => removeSignature(doc, 'author')}
                                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-amber-50 text-left"
                                >
                                  <span className="material-symbols-outlined text-[18px]">cancel</span> Remover Assinatura
                                </button>
                              )}

                              {isCoAuthor && doc.co_author_signed_at && (
                                <button
                                  onClick={() => removeSignature(doc, 'co_author')}
                                  className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-amber-50 text-left"
                                >
                                  <span className="material-symbols-outlined text-[18px]">cancel</span> Remover Assinatura
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {signModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex gap-4 items-start mb-6">
              <div className="p-3 bg-green-100 text-green-700 rounded-xl">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Assinar Documento</h3>
                <p className="text-sm text-gray-500 font-medium leading-tight mt-1">Confirme sua senha para assinar.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Sua senha</label>
                <input
                  type="password"
                  className="w-full border-2 border-gray-100 p-3 rounded-xl mt-1 focus:border-primary outline-none font-bold"
                  placeholder="••••••••"
                  value={signPassword}
                  onChange={e => setSignPassword(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setSignModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                <button onClick={handleSignDocument} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-500/20 transition-colors">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE RELATÓRIO GERAL */}
      {reportModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-8 max-w-4xl w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200 h-[90vh] flex flex-col">
            <div className="flex gap-4 items-start mb-6 border-b pb-4">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                <span className="material-symbols-outlined text-3xl">description</span>
              </div>
              <div className="flex-1">
                <h3 className="text-xl font-black text-gray-900">Relatório Geral</h3>
                <p className="text-sm text-gray-500 font-medium leading-tight mt-1">Configure e selecione os documentos para o PDF.</p>
              </div>
              <div className="flex flex-col items-end">
                <span className="text-3xl font-black text-blue-600 leading-none">{reportPreviewDocs.length - reportExcludedIds.size}</span>
                <span className="text-[10px] font-bold uppercase text-gray-400">Selecionados</span>
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-8 max-h-[70vh] overflow-hidden">

              {/* LEFT COLUMN: FILTERS */}
              <div className="w-full md:w-1/3 flex flex-col gap-5 overflow-y-auto pr-2 custom-scrollbar">

                {/* Filtro de Período */}
                <div>
                  <label className="flex items-center gap-2 mb-2 cursor-pointer">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                      checked={reportUseMonthFilter}
                      onChange={(e) => setReportUseMonthFilter(e.target.checked)}
                    />
                    <span className="text-xs font-bold uppercase text-gray-600">Considerar Filtro de Data (Mês)</span>
                  </label>

                  {reportUseMonthFilter && (
                    <div className="font-bold text-lg text-gray-800 border-b pb-2 mb-4">
                      {monthFilter ? monthFilter.split('-').reverse().join('/') : 'Nenhum mês selecionado'}
                      {!monthFilter && <span className="text-xs text-red-500 block font-medium uppercase mt-1">Selecione um mês na tela anterior.</span>}
                    </div>
                  )}
                  {!reportUseMonthFilter && (
                    <div className="p-2 bg-gray-100 rounded text-xs font-bold text-gray-500 uppercase mb-4">
                      Serão incluídos documentos de <span className="text-black">QUALQUER DATA</span> existente no banco.
                    </div>
                  )}
                </div>

                {/* Filtro de Escopo (User vs All) */}
                <div>
                  <label className="text-xs font-bold uppercase text-gray-400 mb-1 block">Escopo</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 flex items-center justify-center gap-2 p-2 border-2 rounded-xl cursor-pointer transition-colors ${reportFilterType === 'user' ? 'border-primary bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <input type="radio" name="reportType" className="hidden" checked={reportFilterType === 'user'} onChange={() => setReportFilterType('user')} />
                      <span className={`font-bold text-xs uppercase ${reportFilterType === 'user' ? 'text-primary' : 'text-gray-500'}`}>Minha Participação</span>
                    </label>
                    <label className={`flex-1 flex items-center justify-center gap-2 p-2 border-2 rounded-xl cursor-pointer transition-colors ${reportFilterType === 'all' ? 'border-primary bg-blue-50' : 'border-gray-100 hover:bg-gray-50'}`}>
                      <input type="radio" name="reportType" className="hidden" checked={reportFilterType === 'all'} onChange={() => setReportFilterType('all')} />
                      <span className={`font-bold text-xs uppercase ${reportFilterType === 'all' ? 'text-primary' : 'text-gray-500'}`}>Toda a Equipe</span>
                    </label>
                  </div>
                </div>

                {/* Filtro de Status */}
                <div>
                  <label className="text-xs font-bold uppercase text-gray-400 mb-1 block">Status dos Documentos</label>
                  <div className="flex gap-2">
                    <label className={`flex-1 p-2 border rounded-lg cursor-pointer ${reportIncludeFinished ? 'bg-green-50 border-green-200' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={reportIncludeFinished} onChange={e => setReportIncludeFinished(e.target.checked)} className="rounded text-green-600 focus:ring-green-500" />
                        <span className="text-xs font-bold uppercase text-green-700">Finalizados</span>
                      </div>
                    </label>
                    <label className={`flex-1 p-2 border rounded-lg cursor-pointer ${reportIncludeDrafts ? 'bg-orange-50 border-orange-200' : 'border-gray-100'}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={reportIncludeDrafts} onChange={e => setReportIncludeDrafts(e.target.checked)} className="rounded text-orange-600 focus:ring-orange-500" />
                        <span className="text-xs font-bold uppercase text-orange-700">Rascunhos / Andamento</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Filtro de Tipos */}
                {reportDocTypes.length > 0 && (
                  <div>
                    <label className="text-xs font-bold uppercase text-gray-400 mb-1 block">Tipos de Documento</label>
                    <div className="max-h-[100px] overflow-y-auto border border-gray-100 rounded-lg p-2 grid grid-cols-2 gap-2">
                      {reportDocTypes.map(type => (
                        <label key={type} className="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-1 rounded">
                          <input
                            type="checkbox"
                            checked={reportSelectedTypes.includes(type)}
                            onChange={(e) => {
                              if (e.target.checked) setReportSelectedTypes([...reportSelectedTypes, type]);
                              else setReportSelectedTypes(reportSelectedTypes.filter(t => t !== type));
                            }}
                            className="rounded text-blue-600 text-xs"
                          />
                          <span className="text-[10px] font-bold uppercase text-gray-600 truncate">{type}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

              </div>

              {/* RIGHT COLUMN: PREVIEW LIST */}
              <div className="w-full md:w-2/3 flex flex-col h-full bg-gray-50 rounded-xl border border-gray-200 overflow-hidden">
                <div className="p-3 border-b flex justify-between items-center bg-white">
                  <h4 className="font-bold text-gray-700 text-sm uppercase flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">list_alt</span>
                    Documentos no Relatório
                  </h4>
                  <div className="flex gap-2">
                    <button onClick={() => toggleAllReportDocs(true)} className="text-[10px] font-bold uppercase text-blue-600 hover:underline">Marcar Todos</button>
                    <span className="text-gray-300">|</span>
                    <button onClick={() => toggleAllReportDocs(false)} className="text-[10px] font-bold uppercase text-gray-400 hover:text-red-500 hover:underline">Desmarcar Todos</button>
                  </div>
                </div>

                <div className="overflow-y-auto flex-1 p-2 custom-scrollbar">
                  {reportLoadingPreview ? (
                    <div className="h-full flex items-center justify-center text-gray-400 text-sm font-medium animate-pulse">Carregando lista...</div>
                  ) : reportPreviewDocs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-400 text-sm font-medium p-4 text-center">
                      <span className="material-symbols-outlined text-4xl mb-2 opacity-50">search_off</span>
                      Nenhum documento encontrado com os filtros atuais.
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {reportPreviewDocs.map(doc => {
                        const isExcluded = reportExcludedIds.has(doc.id);
                        return (
                          <label key={doc.id} className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${isExcluded ? 'bg-white border-gray-200 opacity-60 hover:opacity-100' : 'bg-white border-blue-200 shadow-sm ring-1 ring-blue-500/20'}`}>
                            <input
                              type="checkbox"
                              checked={!isExcluded}
                              onChange={() => toggleReportDocExclusion(doc.id)}
                              className="mt-1 w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex justify-between items-start gap-2">
                                <span className="font-bold text-sm text-gray-800 truncate block">{doc.title}</span>
                                {doc.formatted_number && <span className="text-[10px] font-black bg-gray-100 px-1.5 py-0.5 rounded text-gray-600 whitespace-nowrap">{doc.formatted_number}</span>}
                              </div>
                              <div className="flex items-center gap-2 mt-1">
                                <span className="text-[10px] font-bold uppercase text-white bg-gray-400 px-1.5 py-0.5 rounded-md">{doc.type || 'GERAL'}</span>
                                <span className="text-[10px] text-gray-400">{formatDate(doc.event_date || doc.created_at)}</span>
                              </div>
                            </div>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>

            </div>
            <div className="flex gap-3 pt-4 border-t">
              <button onClick={() => setReportModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
              <button
                onClick={() => {
                  if (reportUseMonthFilter && !monthFilter) return alert('Por favor, selecione um mês na tela anterior ou desmarque a opção de usar filtro de data.');
                  if (!reportIncludeFinished && !reportIncludeDrafts) return alert('Selecione pelo menos um status (Finalizado ou Rascunho).');

                  const params = new URLSearchParams();
                  if (reportUseMonthFilter && monthFilter) params.append('month', monthFilter);
                  params.append('filter', reportFilterType);
                  params.append('status_finished', String(reportIncludeFinished));
                  params.append('status_drafts', String(reportIncludeDrafts));
                  if (reportSelectedTypes.length > 0) params.append('types', JSON.stringify(reportSelectedTypes));

                  if (reportExcludedIds.size > 0) {
                    const excludedArray = Array.from(reportExcludedIds);
                    params.append('excluded_ids', JSON.stringify(excludedArray));
                  }

                  navigate(`/print-report?${params.toString()}`);
                }}
                className="flex-1 py-3 bg-blue-600 text-white font-bold rounded-xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 transition-colors"
              >
                Gerar Relatório
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Documents;
