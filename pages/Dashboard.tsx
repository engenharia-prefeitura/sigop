
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { isRelationUnavailable, rememberMissingRelation } from '../lib/supabaseCompat';
import { Document, DashboardStats, DocStatus } from '../types';
import { useAuth } from '../components/AuthContext';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth(); // Global user
  const [stats, setStats] = useState<DashboardStats>({
    totalDocuments: 0,
    drafts: 0,
    finished: 0,
    awaitingSignature: 0
  });
  const [recentDocs, setRecentDocs] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal States
  const [modalOpen, setModalOpen] = useState(false);
  const [modalTitle, setModalTitle] = useState('');
  const [modalDocs, setModalDocs] = useState<Document[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [notificationsAvailable, setNotificationsAvailable] = useState(() => !isRelationUnavailable('notificacoes'));

  useEffect(() => {
    if (user) fetchDashboardData();
  }, [user]);

  const fetchDashboardData = async () => {
    if (!user) return; // Guard clause added
    try {
      setLoading(true);





      // Buscar documentos recentes
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('id, title, type, updated_at, status')
        .order('updated_at', { ascending: false })
        .limit(5);

      if (docsError) throw docsError;
      setRecentDocs(docs || []);

      // Buscar contagens
      const { count: total } = await supabase.from('documents').select('*', { count: 'exact', head: true });
      const { count: drafts } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'draft');
      const { count: finished } = await supabase.from('documents').select('*', { count: 'exact', head: true }).eq('status', 'finished');

      // Awaiting Signature (Only for current user)
      let awaitingCount = 0;
      if (user) {
        const { count: authorPending } = await supabase.from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'awaiting_signature')
          .eq('created_by', user.id)
          .is('author_signed_at', null);

        const { count: coAuthorPending } = await supabase.from('documents')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'awaiting_signature')
          .eq('co_author_id', user.id)
          .is('co_author_signed_at', null);

        // Notificações pendentes
        let notifAuthorPending = 0;
        let notifCoAuthorPending = 0;

        if (notificationsAvailable) {
          const notifAuthorResult = await supabase.from('notificacoes')
            .select('*', { count: 'exact', head: true })
            .is('author_signed_at', null)
            .eq('usuario_id', user.id)
            .eq('is_cancelled', false);

          if (rememberMissingRelation('notificacoes', notifAuthorResult.error)) {
            setNotificationsAvailable(false);
          } else {
            notifAuthorPending = notifAuthorResult.count || 0;

            const notifCoAuthorResult = await supabase.from('notificacoes')
              .select('*', { count: 'exact', head: true })
              .is('co_author_signed_at', null)
              .eq('co_author_id', user.id)
              .eq('is_cancelled', false);

            if (rememberMissingRelation('notificacoes', notifCoAuthorResult.error)) {
              setNotificationsAvailable(false);
            } else {
              notifCoAuthorPending = notifCoAuthorResult.count || 0;
            }
          }
        }

        awaitingCount = (authorPending || 0) + (coAuthorPending || 0) + notifAuthorPending + notifCoAuthorPending;
      }

      setStats({
        totalDocuments: total || 0,
        drafts: drafts || 0,
        finished: finished || 0,
        awaitingSignature: awaitingCount
      });

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Erro ao carregar dados:', error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = async (type: string, title: string) => {

    if (type === 'total') {
      navigate('/documents');
      return;
    }

    setModalTitle(title);
    setModalOpen(true);
    setModalLoading(true);

    try {
      if (!user) return;

      let allDocs: any[] = [];

      if (type === 'awaiting_signature') {
        // Buscar Documentos Técnicos pendentes
        const { data: authorDocs } = await supabase.from('documents')
          .select('id, title, status, created_by, co_author_id, author_signed_at, co_author_signed_at, updated_at')
          .eq('status', 'awaiting_signature').eq('created_by', user.id).is('author_signed_at', null);

        const { data: coAuthorDocs } = await supabase.from('documents')
          .select('id, title, status, created_by, co_author_id, author_signed_at, co_author_signed_at, updated_at')
          .eq('status', 'awaiting_signature').eq('co_author_id', user.id).is('co_author_signed_at', null);

        // Buscar Notificações pendentes
        let notifAuthor: any[] = [];
        let notifCoAuthor: any[] = [];

        if (notificationsAvailable) {
          const notifAuthorResult = await supabase.from('notificacoes')
            .select('*, tipo:config_tipos_notificacao(nome)')
            .is('author_signed_at', null).eq('usuario_id', user.id).eq('is_cancelled', false);

          if (rememberMissingRelation('notificacoes', notifAuthorResult.error)) {
            setNotificationsAvailable(false);
          } else {
            notifAuthor = notifAuthorResult.data || [];

            const notifCoAuthorResult = await supabase.from('notificacoes')
              .select('*, tipo:config_tipos_notificacao(nome)')
              .is('co_author_signed_at', null).eq('co_author_id', user.id).eq('is_cancelled', false);

            if (rememberMissingRelation('notificacoes', notifCoAuthorResult.error)) {
              setNotificationsAvailable(false);
            } else {
              notifCoAuthor = notifCoAuthorResult.data || [];
            }
          }
        }

        allDocs = [
          ...(authorDocs || []).map(d => ({ ...d, table: 'documents', displayTitle: d.title })),
          ...(coAuthorDocs || []).map(d => ({ ...d, table: 'documents', displayTitle: d.title })),
          ...notifAuthor.map(n => ({ ...n, table: 'notificacoes', displayTitle: `${n.tipo?.nome} - ${n.label_formatada}`, updated_at: n.updated_at || n.created_at })),
          ...notifCoAuthor.map(n => ({ ...n, table: 'notificacoes', displayTitle: `${n.tipo?.nome} - ${n.label_formatada}`, updated_at: n.updated_at || n.created_at }))
        ];
      } else {
        const { data } = await supabase
          .from('documents')
          .select('id, title, status, updated_at')
          .eq('status', type)
          .order('updated_at', { ascending: false });
        allDocs = (data || []).map(d => ({ ...d, table: 'documents', displayTitle: d.title }));
      }

      setModalDocs(allDocs);
    } catch (err) {
      console.error(err);
    } finally {
      setModalLoading(false);
    }
  };

  const dashboardCards = [
    { label: 'Total de Documentos', value: stats.totalDocuments.toString(), icon: 'folder', trend: '', color: 'blue', type: 'total' },
    { label: 'Rascunhos', value: stats.drafts.toString(), icon: 'edit_document', color: 'gray', type: 'draft' },
    { label: 'Finalizados', value: stats.finished.toString(), icon: 'check_circle', color: 'emerald', type: 'finished' },
    { label: 'Aguardando Assinatura', value: stats.awaitingSignature.toString(), icon: 'history_edu', color: 'orange', pulse: stats.awaitingSignature > 0, type: 'awaiting_signature' },
  ];

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'draft': return 'gray';
      case 'awaiting_signature': return 'orange';
      case 'finished': return 'emerald';
      case 'rejected': return 'red';
      default: return 'blue';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'draft': return DocStatus.DRAFT;
      case 'awaiting_signature': return DocStatus.AWAITING_SIGNATURE;
      case 'finished': return DocStatus.FINISHED;
      case 'rejected': return DocStatus.REJECTED;
      default: return DocStatus.IN_PROGRESS;
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  };

  return (
    <div className="p-6 lg:p-10 max-w-[1400px] mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {dashboardCards.map((stat, idx) => (
            <div
              key={idx}
              onClick={() => handleCardClick(stat.type, stat.label)}
              className="flex flex-col gap-4 rounded-2xl p-6 bg-white dark:bg-[#1A2230] border border-gray-100 dark:border-gray-800 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all group cursor-pointer"
            >
              <div className="flex justify-between items-start">
                <div className={`p-3 rounded-xl bg-${stat.color}-50 dark:bg-${stat.color}-900/20 text-${stat.color}-600`}>
                  <span className="material-symbols-outlined !text-2xl">{stat.icon}</span>
                </div>
                {stat.trend && (
                  <span className="flex items-center text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 px-2 py-1 rounded-full">
                    {stat.trend}
                  </span>
                )}
                {stat.pulse && (
                  <span className="flex items-center size-2.5 rounded-full bg-orange-500 animate-pulse ring-4 ring-orange-500/10"></span>
                )}
              </div>
              <div>
                <p className="text-[#616f89] dark:text-gray-400 text-sm font-semibold mb-1 uppercase tracking-tight">{stat.label}</p>
                <p className="text-[#111318] dark:text-white tracking-tight text-3xl font-black">
                  {loading ? '...' : stat.value}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Table Section */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-1">
            <div>
              <h3 className="text-[#111318] dark:text-white text-xl font-black leading-tight">Documentos Recentes</h3>
              <p className="text-xs text-gray-500 font-medium uppercase tracking-wider mt-1">Últimas modificações realizadas</p>
            </div>
            <button
              onClick={() => navigate('/documents')}
              className="text-sm font-bold text-primary hover:text-blue-700 hover:underline decoration-2 underline-offset-4 transition-all"
            >
              Ver Todos
            </button>
          </div>

          <div className="rounded-2xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-[#1A2230] overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-gray-50/50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-700">
                  <tr>
                    <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-gray-500 dark:text-gray-400">Título do Documento</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-widest text-[10px] text-gray-500 dark:text-gray-400">Tipo</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-widest text-[10px] text-gray-500 dark:text-gray-400">Data de Modificação</th>
                    <th className="px-6 py-5 font-bold uppercase tracking-widest text-[10px] text-gray-500 dark:text-gray-400">Status</th>
                    <th className="px-8 py-5 font-bold uppercase tracking-widest text-[10px] text-gray-500 dark:text-gray-400 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {loading ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-8 text-center text-gray-500">Carregando documentos...</td>
                    </tr>
                  ) : recentDocs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-8 py-8 text-center text-gray-500">Nenhum documento encontrado.</td>
                    </tr>
                  ) : (
                    recentDocs.map((doc) => {
                      const statusColor = getStatusColor(doc.status);
                      const statusLabel = getStatusLabel(doc.status);

                      return (
                        <tr key={doc.id} className="hover:bg-gray-50/50 dark:hover:bg-white/5 transition-colors group">
                          <td className="px-8 py-4 font-bold text-[#111318] dark:text-white">
                            <div className="flex items-center gap-4">
                              <div className={`text-${statusColor}-600 bg-${statusColor}-50 dark:bg-${statusColor}-900/20 p-2 rounded-lg`}>
                                <span className="material-symbols-outlined text-[20px]">description</span>
                              </div>
                              {doc.title}
                            </div>
                          </td>
                          <td className="px-6 py-4 text-[#616f89] dark:text-gray-400 font-medium">{doc.type}</td>
                          <td className="px-6 py-4 text-[#616f89] dark:text-gray-400">{formatDate(doc.updated_at)}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider bg-${statusColor}-100 text-${statusColor}-700 dark:bg-${statusColor}-900/40 dark:text-${statusColor}-300`}>
                              {statusLabel}
                            </span>
                          </td>
                          <td className="px-8 py-4 text-right">
                            <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all transform translate-x-2 group-hover:translate-x-0">
                              <button
                                onClick={() => navigate(`/editor/${doc.id}`)}
                                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-500 dark:text-gray-400 hover:text-primary transition-colors"
                              >
                                <span className="material-symbols-outlined text-[20px]">edit</span>
                              </button>
                            </div>
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Modal Listagem */}
        {modalOpen && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
              <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
                <div className="flex items-center gap-3">
                  <span className="material-symbols-outlined text-gray-400 text-2xl">folder_open</span>
                  <h3 className="font-bold text-gray-900 text-lg">{modalTitle}</h3>
                </div>
                <button onClick={() => setModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500 transition-colors">
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              <div className="flex-1 overflow-y-auto p-0">
                {modalLoading ? (
                  <div className="p-10 text-center text-gray-500">Carregando...</div>
                ) : modalDocs.length === 0 ? (
                  <div className="p-10 text-center text-gray-500 flex flex-col items-center gap-2">
                    <span className="material-symbols-outlined text-4xl opacity-20">sentiment_satisfied</span>
                    Nenhum documento encontrado nesta categoria.
                  </div>
                ) : (
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 border-b border-gray-100 sticky top-0">
                      <tr>
                        <th className="px-6 py-4 font-bold uppercase text-[10px] text-gray-500">Título</th>
                        {modalTitle === 'Aguardando Assinatura' && <th className="px-6 py-4 font-bold uppercase text-[10px] text-gray-500 text-center">Pendência</th>}
                        <th className="px-6 py-4 font-bold uppercase text-[10px] text-gray-500">Data</th>
                        <th className="px-6 py-4 font-bold uppercase text-[10px] text-gray-500 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {modalDocs.map((doc: any) => {
                        let signatureStatus = '';
                        if (modalTitle === 'Aguardando Assinatura') {
                          const isAuthor = doc.created_by === user?.id || doc.usuario_id === user?.id;
                          const isCoAuthor = doc.co_author_id === user?.id;
                          if (isAuthor && !doc.author_signed_at) signatureStatus = 'Sua Assinatura (Autor)';
                          else if (isCoAuthor && !doc.co_author_signed_at) signatureStatus = 'Sua Assinatura (Coautor)';
                        }

                        return (
                          <tr key={doc.id} className="hover:bg-gray-50 transition-colors">
                            <td className="px-6 py-4 font-bold text-gray-800">
                              <div className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-gray-400 text-sm">{doc.table === 'notificacoes' ? 'notifications' : 'description'}</span>
                                {doc.displayTitle}
                              </div>
                            </td>
                            {modalTitle === 'Aguardando Assinatura' && (
                              <td className="px-6 py-4 text-center">
                                <span className="bg-orange-100 text-orange-700 px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-tight">
                                  {signatureStatus}
                                </span>
                              </td>
                            )}
                            <td className="px-6 py-4 text-gray-500">{formatDate(doc.updated_at)}</td>
                            <td className="px-6 py-4 text-right">
                              <button
                                onClick={() => {
                                  if (doc.table === 'notificacoes') navigate('/notifications');
                                  else navigate(`/editor/${doc.id}`);
                                }}
                                className="bg-primary hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold uppercase transition-colors"
                              >
                                Abrir
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
