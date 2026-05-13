
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../components/AuthContext';
import RichTextEditor from '../components/RichTextEditor';
import AIAssistantPanel from '../components/AIAssistantPanel';

// Helper de debounce para salvar automaticamente (agora no storage)
const useDebounce = (value: any, delay: number) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
};

// Helper: Compress Image
const compressImage = async (source: File | string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.src = typeof source === 'string' ? source : URL.createObjectURL(source);

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 800;
      const MAX_HEIGHT = 800;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx?.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.6));
    };
    img.onerror = (err) => reject(err);
  });
};

const Editor: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Dados do Documento
  const [title, setTitle] = useState('');
  const [docType, setDocType] = useState('');
  const [sections, setSections] = useState<any[]>([]);
  const [status, setStatus] = useState('draft');
  const [description, setDescription] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [photosPerPage, setPhotosPerPage] = useState(4);
  const [coAuthorId, setCoAuthorId] = useState<string | null>(null);

  // Listas auxiliares
  const [docTypesList, setDocTypesList] = useState<any[]>([]);
  const [usersList, setUsersList] = useState<any[]>([]);

  // Assinatura
  const [isSignModalOpen, setIsSignModalOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [zoomedPhoto, setZoomedPhoto] = useState<string | null>(null);
  const [expandedSectionId, setExpandedSectionId] = useState<number | null>(null);
  const [hasAlreadySigned, setHasAlreadySigned] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Debounce para salvar conteúdo
  const debouncedSections = useDebounce(sections, 1000);
  const debouncedTitle = useDebounce(title, 1000);

  const [isDirty, setIsDirty] = useState(false);
  const isLoaded = useRef(false);

  useEffect(() => {
    loadInitialData();
  }, [id]);

  // Bloqueio de Navegação (React Router)
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      const confirm = window.confirm("Você tem alterações não salvas. Se sair agora, elas serão mantidas apenas no navegador. Deseja sair?");
      if (confirm) {
        blocker.proceed();
      } else {
        blocker.reset();
      }
    }
  }, [blocker]);

  // Bloqueio de Fechamento de Aba/Browser
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = ''; // Chrome requer isso
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [isDirty]);

  // Save to LocalStorage on changes
  useEffect(() => {
    if (!loading && id && id !== 'novo' && status === 'draft' && isDirty) {
      saveToLocalStorage();
    }
  }, [debouncedSections, debouncedTitle, description, eventDate, photosPerPage, docType, coAuthorId, status]);

  // Track changes to mark dirty
  useEffect(() => {
    if (!loading && isLoaded.current) {
      setIsDirty(true);
    }
  }, [title, sections, description, eventDate, photosPerPage, docType, coAuthorId]);

  const saveToLocalStorage = () => {
    if (!id || id === 'novo') return;
    const data = {
      title, sections, description, eventDate, photosPerPage, docType, coAuthorId, status,
      updatedAt: Date.now()
    };
    try {
      localStorage.setItem(`draft_${id}`, JSON.stringify(data));
      // Não resetamos isDirty aqui, pois ainda não foi pro banco
    } catch (e) {
      console.error("Erro ao salvar no localStorage", e);
    }
  };

  // Optimization Effect
  useEffect(() => {
    const optimizeExistingImages = async () => {
      if (!loading && isLoaded.current && sections.length > 0) {
        let hasChanges = false;
        const newSections = [...sections];

        for (let sIdx = 0; sIdx < newSections.length; sIdx++) {
          if (newSections[sIdx].type === 'photos' && newSections[sIdx].items) {
            for (let iIdx = 0; iIdx < newSections[sIdx].items.length; iIdx++) {
              const item = newSections[sIdx].items[iIdx];
              if (item.url && item.url.length > 400000 && item.url.startsWith('data:image')) {
                console.log(`Otimizando imagem ${sIdx}-${iIdx}...`);
                try {
                  const compressed = await compressImage(item.url);
                  if (compressed.length < item.url.length) {
                    newSections[sIdx].items[iIdx].url = compressed;
                    hasChanges = true;
                  }
                } catch (e) {
                  console.error('Falha ao otimizar imagem antiga', e);
                }
              }
            }
          }
        }

        if (hasChanges) {
          console.log('Aplicando otimizações de imagem...');
          setSections(newSections);
          setIsDirty(true);
        }
      }
    };

    const timer = setTimeout(() => {
      optimizeExistingImages();
    }, 2000);
    return () => clearTimeout(timer);
  }, [loading]);

  const loadInitialData = async () => {
    setLoading(true);
    // 1. Tipos e Usuários
    const { data: types } = await supabase.from('document_types').select('*');
    if (types) setDocTypesList(types);

    const { data: users } = await supabase.from('profiles').select('id, full_name, role_title');
    if (users) setUsersList(users);



    // Get user from context, don't fetch again
    // if (user) setCurrentUser(user);

    // 2. Se for edição, carregar documento
    if (id && id !== 'novo') {
      const { data: doc } = await supabase.from('documents').select('*').eq('id', id).single();
      if (doc) {
        // Tentar recuperar do LocalStorage primeiro
        const localDraft = localStorage.getItem(`draft_${id}`);
        let loadedFromLocal = false;

        if (localDraft) {
          try {
            const parsed = JSON.parse(localDraft);
            const remoteTime = new Date(doc.updated_at).getTime();
            const localTime = parsed.updatedAt || 0;

            // Se o local for mais recente (ou se quisermos sempre priorizar o rascunho não salvo)
            // Aqui assumimos que se existe local, é pq tem coisa não salva.
            if (localTime > remoteTime) {
              console.log("Restaurando rascunho local...");
              setTitle(parsed.title);
              setDocType(parsed.docType || '');
              setSections(parsed.sections || []);
              setStatus(parsed.status);
              setDescription(parsed.description || '');
              setEventDate(parsed.eventDate || '');
              setPhotosPerPage(parsed.photosPerPage || 4);
              setCoAuthorId(parsed.coAuthorId || null);
              loadedFromLocal = true;
            }
          } catch (e) {
            console.error("Erro ao ler rascunho local", e);
          }
        }

        if (!loadedFromLocal) {
          const matchingType = (types || []).find((type: any) => type.name === doc.type);
          setTitle(doc.title);
          setDocType(doc.document_type_id || matchingType?.id || '');
          setSections(doc.content?.sections || []);
          setStatus(doc.status);
          setDescription(doc.description || '');
          setEventDate(doc.event_date ? new Date(doc.event_date).toISOString().split('T')[0] : '');
          setPhotosPerPage(doc.photos_per_page || 4);
          setCoAuthorId(doc.co_author_id || null);
        }

        // Check signature permissions
        if (user) {
          const isCoAuthor = user.id === doc.co_author_id;
          const isAuthor = user.id === doc.created_by;

          if (isCoAuthor) {
            setHasAlreadySigned(!!doc.co_author_signed_at);
          } else if (isAuthor) {
            setHasAlreadySigned(!!doc.author_signed_at);
          } else {
            setHasAlreadySigned(false);
          }
        }

        if (loadedFromLocal) {
          // Delay dirty flag to ensure controls are populated
          setTimeout(() => setIsDirty(true), 100);
        }
      }
    } else {
      // Novo: criar estrutura base (opcional)
      setSections([
        { id: 1, title: 'Introdução', type: 'text', content: '' },
        { id: 2, title: 'Desenvolvimento', type: 'text', content: '' },
        { id: 3, title: 'Conclusão', type: 'text', content: '' }
      ]);
    }
    setLoading(false);
    // Give a small timeout to avoid immediate dirty trigger due to state updates
    setTimeout(() => { isLoaded.current = true; }, 500);
  };

  // ... (keep existing functions)



  const saveDocument = async () => {
    setSaving(true);
    const typeName = docTypesList.find(t => t.id === docType)?.name || 'Geral';
    const docData = {
      title,
      description,
      document_type_id: docType && docType !== '' ? docType : null,
      type: typeName,
      content: { sections },
      event_date: eventDate && eventDate !== '' ? eventDate : null,
      photos_per_page: photosPerPage,
      co_author_id: coAuthorId && coAuthorId !== '' ? coAuthorId : null,
      status,
      updated_at: new Date()
    };

    if (id && id !== 'novo') {
      await supabase.from('documents').update(docData).eq('id', id);
    }

    // Clear local storage after successful save
    if (id) {
      localStorage.removeItem(`draft_${id}`);
    }

    setSaving(false);
    setIsDirty(false); // Reset dirty state after successful save
  };

  const handleCreate = async () => {
    if (!title) return alert('Digite um título');
    const { data: { user } } = await supabase.auth.getUser();

    const typeName = docTypesList.find(t => t.id === docType)?.name || 'Geral';
    const payload = {
      title,
      description,
      document_type_id: docType && docType !== '' ? docType : null,
      type: typeName,
      content: { sections },
      status: 'draft',
      created_by: user?.id,
      co_author_id: coAuthorId && coAuthorId !== '' ? coAuthorId : null,
      event_date: eventDate && eventDate !== '' ? eventDate : null,
      photos_per_page: photosPerPage
    };

    const { data, error } = await supabase.from('documents').insert(payload).select().single();

    if (error) {
      console.error('Erro ao criar:', error);
      alert(`Erro ao criar documento: ${error.message}`);
    } else if (data) {
      navigate(`/editor/${data.id}`);
    }
  };

  // --- Seções ---
  const updateSection = (index: number, content: string) => {
    const newSections = [...sections];
    newSections[index].content = content;
    setSections(newSections);
  };

  const insertTag = (index: number, tag: string, wrapper: boolean = true) => {
    const textarea = document.getElementById(`textarea-${sections[index].id}`) as HTMLTextAreaElement | null;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = sections[index].content;

    let newText = '';
    if (wrapper) {
      // Bold, Italic, etc
      newText = text.substring(0, start) + `<${tag}>` + text.substring(start, end) + `</${tag}>` + text.substring(end);
    } else {
      // Just insert (like Tab)
      newText = text.substring(0, start) + tag + text.substring(end);
    }

    updateSection(index, newText);

    // Devolve o foco e ajusta cursor (timeout para garantir render)
    setTimeout(() => {
      textarea.focus();
      textarea.selectionStart = textarea.selectionEnd = start + tag.length + (wrapper ? 2 : 0);
    }, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertTag(index, '\t', false); // Insere tab real ou 4 espaços
    }
  };

  const addSection = (type: 'text' | 'photos') => {
    setSections([...sections, {
      id: Date.now(),
      title: type === 'text' ? 'Nova Seção' : 'Relatório Fotográfico',
      type,
      content: '',
      items: []
    }]);
  };

  const insertAiSection = (sectionTitle: string, content: string) => {
    setSections([...sections, {
      id: Date.now(),
      title: sectionTitle,
      type: 'text',
      content: content.replace(/\n/g, '<br/>'),
      items: []
    }]);
  };

  const replaceSectionContent = (sectionId: number, content: string) => {
    setSections(sections.map(section => (
      section.id === sectionId ? { ...section, content } : section
    )));
  };

  const handlePhotoUpload = async (index: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Use saving indicator while processing images
    setSaving(true);

    const newSections = [...sections];
    if (!newSections[index].items) newSections[index].items = [];

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Compressing...
        const compressedBase64 = await compressImage(file);

        newSections[index].items.push({
          id: Date.now() + i,
          url: compressedBase64,
          caption: 'Foto ' + (newSections[index].items.length + 1)
        });
      }
      setSections([...newSections]);
    } catch (error) {
      console.error("Erro ao processar imagem", error);
      alert("Erro ao processar imagem. Tente uma menor.");
    } finally {
      setSaving(false);
    }
  };

  // --- Finalização e Assinatura ---
  const handleFinalize = async () => {
    if (!confirm('Deseja finalizar o documento? Ele ficará disponível para assinatura.')) return;
    setStatus('awaiting_signature');
    await supabase.from('documents').update({ status: 'awaiting_signature' }).eq('id', id);
    alert('Documento finalizado! Agora está disponível para assinatura.');
  };

  const handleSign = async () => {
    if (!password) return alert('Informe sua senha para assinar.');

    try {
      // Verificar senha tentando login
      const { data: { user: signedUser }, error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password
      });

      if (error || !user) throw new Error('Senha incorreta');

      // Buscar estado atual do documento para checar assinaturas existentes
      const { data: currentDoc, error: docError } = await supabase.from('documents').select('*').eq('id', id).single();
      if (docError || !currentDoc) throw new Error('Erro ao buscar documento.');

      const updates: any = {};
      const now = new Date().toISOString();
      const isCoAuthor = user.id === currentDoc.co_author_id;

      // Aplica a assinatura de quem está logado
      if (isCoAuthor) {
        updates.co_author_signed_at = now;
      } else {
        updates.author_signed_at = now;
      }

      // Lógica de Status: Só finaliza se todos assinarem
      const hasCoAuthor = !!currentDoc.co_author_id; // Se tiver ID de coautor é pq exige

      // Verifica se AMBOS estarão assinados após este update
      // Se eu sou co-autor, checo se author_signed_at JÁ EXISTE no banco.
      // Se eu sou autor, checo se co_author_signed_at JÁ EXISTE no banco.
      // Se não tem co-autor, basta a minha assinatura.

      let isFullySigned = false;

      if (!hasCoAuthor) {
        isFullySigned = true;
      } else {
        const authorWillBeSigned = isCoAuthor ? currentDoc.author_signed_at : true; // Se sou coautor, olho o banco. Se sou autor, é true pq tô assinando agora.
        const coAuthorWillBeSigned = isCoAuthor ? true : currentDoc.co_author_signed_at; // Se sou coautor, é true. Se sou autor, olho banco.

        isFullySigned = authorWillBeSigned && coAuthorWillBeSigned;
      }

      if (isFullySigned) {
        updates.status = 'finished';
      } else {
        updates.status = 'awaiting_signature';
      }

      const { error: updateError } = await supabase.from('documents').update(updates).eq('id', id);
      if (updateError) throw updateError;

      // Feedback Check
      const wasAlreadySignedByMe = isCoAuthor ? currentDoc.co_author_signed_at : currentDoc.author_signed_at;
      if (wasAlreadySignedByMe) {
        alert('Você atualizou sua assinatura neste documento.');
        setHasAlreadySigned(true);
      } else if (isFullySigned) {
        setStatus('finished');
        alert('Documento assinado e finalizado com sucesso!');
        setHasAlreadySigned(true);
      } else {
        alert('Sua assinatura foi registrada. Aguardando a outra parte para finalizar.');
        setHasAlreadySigned(true);
      }

      setIsSignModalOpen(false);
      setPassword('');

    } catch (err: any) {
      alert(err.message || 'Erro ao assinar.');
    }
  };

  const handleRevertDraft = async () => {
    if (!confirm('Reverter para rascunho removerá as assinaturas. Confirmar?')) return;
    await supabase.from('documents').update({
      status: 'draft',
      author_signed_at: null,
      co_author_signed_at: null
    }).eq('id', id);
    setStatus('draft');
    alert('Revertido para rascunho.');
  };

  if (loading) return <div>Carregando...</div>;

  if (id === 'novo') {
    return (
      <div className="p-10 max-w-2xl mx-auto animate-in fade-in">
        <h2 className="text-2xl font-black mb-6">Novo Documento</h2>
        <div className="flex flex-col gap-4 bg-white p-8 rounded-2xl shadow-sm border">
          <label className="font-bold text-sm text-gray-500 uppercase">Título</label>
          <input className="border p-3 rounded-xl font-bold bg-gray-50 focus:bg-white focus:ring-2 ring-primary/20 outline-none" placeholder="Ex: Relatório de Vistoria 01" value={title} onChange={e => setTitle(e.target.value)} />

          <label className="font-bold text-sm text-gray-500 uppercase">Tipo de Documento</label>
          <select className="border p-3 rounded-xl bg-gray-50 font-medium" value={docType} onChange={e => setDocType(e.target.value)}>
            <option value="">Selecione...</option>
            {docTypesList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
          </select>

          <label className="font-bold text-sm text-gray-500 uppercase">Data do Evento</label>
          <input type="date" className="border p-3 rounded-xl bg-gray-50 font-medium" value={eventDate} onChange={e => setEventDate(e.target.value)} />

          <label className="font-bold text-sm text-gray-500 uppercase">Coautor (Opcional)</label>
          <select className="border p-3 rounded-xl bg-gray-50 font-medium" value={coAuthorId || ''} onChange={e => setCoAuthorId(e.target.value || null)}>
            <option value="">Sem coautor</option>
            {usersList.filter(u => u.id !== user?.id).map(u => (
              <option key={u.id} value={u.id}>{u.full_name} ({u.role_title})</option>
            ))}
          </select>

          <button onClick={handleCreate} className="bg-primary hover:bg-blue-700 text-white py-4 rounded-xl font-black uppercase tracking-wider mt-4 shadow-lg shadow-blue-500/20 transition-all">Criar Documento</button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      {/* Header do Editor */}
      <div className="bg-white border-b px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div>
          <input disabled={status !== 'draft'} className="text-lg font-black bg-transparent outline-none w-96 placeholder-gray-300" value={title} onChange={e => setTitle(e.target.value)} />
          <p className="text-xs text-gray-400 font-bold uppercase flex items-center gap-2">
            {saving ? <span className="animate-pulse">Salvo...</span> : 'Salvo'}
            <span className="w-1 h-1 rounded-full bg-gray-300"></span>
            {status === 'draft' ? 'Rascunho' : 'Finalizado'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setAiPanelOpen(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 h-10 rounded-lg text-xs font-bold uppercase flex items-center gap-2 shadow"
            title="Abrir assistente IA local"
          >
            <span className="material-symbols-outlined text-[18px]">psychology</span> IA
          </button>

          {(status === 'awaiting_signature' || status === 'finished') && (
            <button onClick={handleRevertDraft} className="text-xs font-bold text-gray-500 hover:text-red-500 uppercase px-4 border border-gray-200 h-10 rounded-lg hover:border-red-200 bg-white">
              {status === 'finished' ? 'Desfazer Finalização' : 'Voltar para Rascunho'}
            </button>
          )}

          {status === 'draft' && (
            <div className="flex gap-2">
              <button
                onClick={async () => { await saveDocument(); alert('Rascunho salvo com sucesso!'); }}
                className="bg-white hover:bg-emerald-50 text-emerald-600 border border-emerald-200 px-4 h-10 rounded-lg text-xs font-bold uppercase flex items-center gap-2 transition-all"
                disabled={saving}
                title="Salvar alterações agora"
              >
                <span className="material-symbols-outlined text-[18px]">save</span>
                {saving ? '...' : 'Salvar'}
              </button>

              <button onClick={handleFinalize} className="bg-blue-600 hover:bg-blue-700 text-white px-5 h-10 rounded-lg text-xs font-bold uppercase shadow flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px]">lock</span> Finalizar Rascunho
              </button>
            </div>
          )}

          {status === 'awaiting_signature' && !hasAlreadySigned && (
            <button onClick={() => setIsSignModalOpen(true)} className="bg-green-600 hover:bg-green-700 text-white px-5 h-10 rounded-lg text-xs font-bold uppercase shadow flex items-center gap-2">
              <span className="material-symbols-outlined text-[18px]">verified_user</span> Assinar
            </button>
          )}

          {status === 'awaiting_signature' && hasAlreadySigned && (
            <div className="flex items-center gap-2 text-green-600 font-bold text-xs uppercase bg-green-50 px-3 py-2 rounded-lg border border-green-100">
              <span className="material-symbols-outlined text-[18px]">check_circle</span> Assinado por você
            </div>
          )}

          <button onClick={async () => { await saveDocument(); navigate(`/print/${id}`); }} className="bg-white hover:bg-gray-50 text-gray-700 border border-gray-200 px-4 h-10 rounded-lg text-xs font-bold uppercase flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">print</span> PDF
          </button>
          <button onClick={() => navigate('/documents')} className="bg-gray-800 hover:bg-black text-white px-4 h-10 rounded-lg text-xs font-bold uppercase">
            Fechar
          </button>
        </div>
      </div>

      {/* Corpo */}
      <div className="flex-1 overflow-y-auto p-4 lg:p-8">
        <div className="max-w-[210mm] mx-auto bg-white min-h-[297mm] shadow-lg border border-gray-200 p-[10mm] flex flex-col gap-8">

          {/* Metadados Visíveis */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100 mb-4 not-prose">
            <div>
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Tipo do Documento</span>
              <select disabled={status !== 'draft'} className="block w-full bg-transparent font-bold text-sm text-blue-900 border-b border-blue-200 focus:border-blue-500 outline-none mt-1 disabled:opacity-50" value={docType} onChange={e => setDocType(e.target.value)}>
                <option value="">Geral</option>
                {docTypesList.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Data do Evento</span>
              <input type="date" disabled={status !== 'draft'} value={eventDate} onChange={e => setEventDate(e.target.value)} className="block w-full bg-transparent font-bold text-sm text-blue-900 border-b border-blue-200 focus:border-blue-500 outline-none mt-1 disabled:opacity-50" />
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Coautor</span>
              <select disabled={status !== 'draft'} className="block w-full bg-transparent font-bold text-sm text-blue-900 border-b border-blue-200 focus:border-blue-500 outline-none mt-1 disabled:opacity-50" value={coAuthorId || ''} onChange={e => setCoAuthorId(e.target.value || null)}>
                <option value="">Nenhum</option>
                {usersList.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <span className="text-[10px] font-black uppercase text-blue-400 tracking-wider">Fotos por Pág.</span>
              <select disabled={status !== 'draft'} className="block w-full bg-transparent font-bold text-sm text-blue-900 border-b border-blue-200 focus:border-blue-500 outline-none mt-1 disabled:opacity-50" value={photosPerPage} onChange={e => setPhotosPerPage(Number(e.target.value))}>
                <option value={2}>2 (Grandes)</option>
                <option value={4}>4 (Médias)</option>
                <option value={6}>6 (Pequenas)</option>
              </select>
            </div>
          </div>

          {sections.map((section, idx) => (
            <div key={section.id} className="group relative hover:bg-gray-50/50 p-4 -mx-4 rounded-xl transition-colors">
              <input
                disabled={status !== 'draft'}
                className="font-bold text-lg mb-2 w-full outline-none placeholder-gray-300 bg-transparent disabled:opacity-70"
                value={section.title}
                onChange={e => {
                  const newSec = [...sections];
                  newSec[idx].title = e.target.value;
                  setSections(newSec);
                }}
              />

              {section.type === 'text' ? (
                <div className="relative group/edit">
                  <RichTextEditor
                    initialValue={section.content}
                    onChange={(html) => updateSection(idx, html)}
                    disabled={status !== 'draft'}
                  />

                  {/* Botão Expandir (Overlay) */}
                  {status === 'draft' && (
                    <button
                      onClick={() => setExpandedSectionId(idx)}
                      className="absolute top-2 right-2 p-1.5 bg-white shadow-sm border border-gray-100 hover:bg-gray-50 rounded text-gray-400 hover:text-primary opacity-0 group-hover/edit:opacity-100 transition-all z-30"
                      title="Expandir Editor"
                    >
                      <span className="material-symbols-outlined text-[18px]">open_in_full</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="bg-white p-4 rounded-xl border-2 border-dashed border-gray-200">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    {section.items?.map((photo: any, pIdx: number) => (
                      <div key={photo.id} className="relative aspect-video bg-gray-100 rounded overflow-hidden shadow-sm group/photo">
                        <img
                          src={photo.url}
                          className="w-full h-full object-cover cursor-pointer hover:scale-105 transition-transform duration-500"
                          onClick={() => setZoomedPhoto(photo.url)}
                        />
                        {status === 'draft' && (
                          <button
                            onClick={() => {
                              const newSec = [...sections];
                              newSec[idx].items.splice(pIdx, 1);
                              setSections(newSec);
                            }}
                            className="absolute top-2 right-2 bg-red-500 text-white p-1 rounded-full opacity-0 group-hover/photo:opacity-100 transition-opacity shadow-md hover:bg-red-600 z-10"
                            title="Remover Foto"
                          >
                            <span className="material-symbols-outlined text-[14px] flex">close</span>
                          </button>
                        )}
                        <input
                          disabled={status !== 'draft'}
                          className="absolute bottom-0 w-full bg-black/70 backdrop-blur-md text-white text-[10px] p-2 text-center outline-none font-medium disabled:opacity-80"
                          value={photo.caption}
                          onChange={e => {
                            const newSec = [...sections];
                            const item = newSec[idx].items.find((p: any) => p.id === photo.id);
                            item.caption = e.target.value;
                            setSections(newSec);
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  {status === 'draft' && (
                    <label className="cursor-pointer flex flex-col items-center justify-center gap-2 text-gray-400 font-bold text-xs bg-gray-50 py-8 rounded-xl hover:bg-gray-100 hover:text-primary transition-all">
                      <span className="material-symbols-outlined text-3xl">add_photo_alternate</span>
                      Clique para adicionar fotos
                      <input type="file" multiple accept="image/*" className="hidden" onChange={e => handlePhotoUpload(idx, e)} />
                    </label>
                  )}
                </div>
              )}

              {status === 'draft' && (
                <button
                  onClick={() => setSections(sections.filter((_, i) => i !== idx))}
                  className="absolute right-2 top-2 opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-500 transition-all p-2 bg-white rounded-full shadow-sm"
                  title="Remover Seção"
                >
                  <span className="material-symbols-outlined text-[18px]">delete</span>
                </button>
              )}
            </div>
          ))}

          {status === 'draft' && (
            <div className="flex gap-4 justify-center mt-8 py-8 border-t border-dashed border-gray-200">
              <button onClick={() => addSection('text')} className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 font-bold text-gray-600 rounded-xl hover:bg-gray-50 text-xs uppercase shadow-sm">
                <span className="material-symbols-outlined text-sm">text_fields</span> Adicionar Texto
              </button>
              <button onClick={() => addSection('photos')} className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-200 font-bold text-gray-600 rounded-xl hover:bg-gray-50 text-xs uppercase shadow-sm">
                <span className="material-symbols-outlined text-sm">image</span> Adicionar Fotos
              </button>
            </div>
          )}
        </div>
      </div>

      <AIAssistantPanel
        open={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        disabled={status !== 'draft'}
        documentContext={{
          title,
          typeName: docTypesList.find(t => t.id === docType)?.name || 'Geral',
          description,
          eventDate,
          sections
        }}
        onInsertSection={insertAiSection}
        onReplaceSection={replaceSectionContent}
      />

      {/* Modal de Edição Expandida */}
      {expandedSectionId !== null && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center px-6 py-4 border-b bg-gray-50">
              <h3 className="font-bold text-gray-700">Editar Seção</h3>
              <button onClick={() => setExpandedSectionId(null)} className="p-2 hover:bg-gray-200 rounded-full text-gray-500">
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <div className="flex-1 p-6 overflow-y-auto bg-gray-50/30">
              <RichTextEditor
                initialValue={sections[expandedSectionId].content}
                onChange={html => updateSection(expandedSectionId, html)}
                className="min-h-full shadow-sm"
              />
            </div>
          </div>
        </div>
      )}

      {/* Modal de Zoom Avançado (Com Scroll) */}
      {zoomedPhoto && (
        <div className="fixed inset-0 bg-black/95 z-[60] flex flex-col items-center justify-center animate-in fade-in" onClick={(e) => {
          if (e.target === e.currentTarget) setZoomedPhoto(null);
        }}>

          {/* Controles de Zoom */}
          <div className="absolute top-6 flex gap-4 bg-black/50 p-2 rounded-full backdrop-blur-sm z-[70]">
            <button onClick={() => {
              const img = document.getElementById('zoomed-img');
              if (img) {
                const curr = Number(img.getAttribute('data-scale') || 1);
                const next = curr + 0.25;
                img.style.width = `${next * 70}vw`; // Base is 70vw
                img.setAttribute('data-scale', String(next));
              }
            }} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors flex items-center justify-center" title="Aumentar Zoom">
              <span className="material-symbols-outlined text-2xl">add</span>
            </button>
            <button onClick={() => {
              const img = document.getElementById('zoomed-img');
              if (img) {
                img.style.width = '70vw';
                img.setAttribute('data-scale', '1');
              }
            }} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors flex items-center justify-center" title="Resetar">
              <span className="material-symbols-outlined text-2xl">restart_alt</span>
            </button>
            <button onClick={() => {
              const img = document.getElementById('zoomed-img');
              if (img) {
                const curr = Number(img.getAttribute('data-scale') || 1);
                const next = Math.max(0.25, curr - 0.25);
                img.style.width = `${next * 70}vw`;
                img.setAttribute('data-scale', String(next));
              }
            }} className="p-2 text-white hover:bg-white/20 rounded-full transition-colors flex items-center justify-center" title="Diminuir Zoom">
              <span className="material-symbols-outlined text-2xl">remove</span>
            </button>
            <div className="w-px bg-white/20 mx-1"></div>
            <button onClick={() => setZoomedPhoto(null)} className="p-2 text-white hover:bg-red-500/50 rounded-full transition-colors flex items-center justify-center" title="Fechar">
              <span className="material-symbols-outlined text-2xl">close</span>
            </button>
          </div>

          <div className="overflow-auto w-full h-full flex items-center justify-center p-10">
            <img
              id="zoomed-img"
              src={zoomedPhoto}
              className="rounded shadow-2xl transition-all duration-200 ease-out origin-center"
              data-scale="1"
              style={{ width: '70vw', maxWidth: 'none', height: 'auto' }}
            />
          </div>
        </div>
      )}

      {/* Modal de Assinatura */}
      {isSignModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl scale-100 animate-in zoom-in-95 duration-200">
            <div className="flex gap-4 items-start mb-6">
              <div className="p-3 bg-green-100 text-green-700 rounded-xl">
                <span className="material-symbols-outlined text-3xl">verified_user</span>
              </div>
              <div>
                <h3 className="text-xl font-black text-gray-900">Assinar Documento</h3>
                <p className="text-sm text-gray-500 font-medium leading-tight mt-1">Confirme sua identidade para carimbar o documento.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-bold uppercase text-gray-400">Sua senha de acesso</label>
                <input
                  type="password"
                  className="w-full border-2 border-gray-100 p-3 rounded-xl mt-1 focus:border-primary outline-none font-bold"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setIsSignModalOpen(false)} className="flex-1 py-3 font-bold text-gray-500 hover:bg-gray-100 rounded-xl transition-colors">Cancelar</button>
                <button onClick={handleSign} className="flex-1 py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 shadow-lg shadow-green-500/20 transition-colors">Confirmar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Editor;
