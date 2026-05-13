import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { compressImage, ImageLocationStamp } from '../utils/imageCompressor';
import {
  CachedDocumentType,
  archiveRemoteFieldSurvey,
  CachedProject,
  createDocumentFromFieldSurvey,
  createLocalId,
  deleteFieldSurvey,
  FieldSurvey,
  FieldSurveyPhoto,
  getFieldSurveys,
  getOfflineCache,
  getRemoteFieldSurveyDocuments,
  refreshOfflineCache,
  RemoteFieldSurveyDocument,
  saveFieldSurvey,
  syncFieldSurvey,
  syncPendingFieldSurveys,
} from '../lib/offlineFieldStore';

type SurveyForm = {
  id?: string;
  title: string;
  documentTypeId: string;
  documentTypeName: string;
  projectId: string;
  projectName: string;
  eventDate: string;
  location: string;
  initialInfo: string;
  notes: string;
  recommendations: string;
  photos: FieldSurveyPhoto[];
};

const today = () => new Date().toISOString().split('T')[0];
const FIELD_SURVEY_AUTOSAVE_PREFIX = 'sigop_field_survey_autosave';

const emptyForm = (): SurveyForm => ({
  title: '',
  documentTypeId: '',
  documentTypeName: 'Levantamento de Campo',
  projectId: '',
  projectName: '',
  eventDate: today(),
  location: '',
  initialInfo: '',
  notes: '',
  recommendations: '',
  photos: [],
});

const blobToDataUrl = (blob: Blob): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
};

const getPhotoLocationStamp = (): Promise<ImageLocationStamp> => {
  const capturedAt = new Date().toISOString();

  if (!navigator.geolocation) {
    return Promise.resolve({ capturedAt });
  }

  return new Promise(resolve => {
    navigator.geolocation.getCurrentPosition(
      position => resolve({
        capturedAt,
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
      }),
      () => resolve({ capturedAt }),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
    );
  });
};

const isMobileDevice = () => {
  if (typeof navigator === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const hasFormContent = (form: SurveyForm) => !!(
  form.id ||
  form.title.trim() ||
  form.documentTypeId ||
  form.projectId ||
  form.location.trim() ||
  form.initialInfo.trim() ||
  form.notes.trim() ||
  form.recommendations.trim() ||
  form.photos.length
);

const statusMeta = {
  draft: { label: 'Rascunho local', color: 'bg-slate-100 text-slate-700 border-slate-200', icon: 'edit_note' },
  pending: { label: 'Aguardando envio', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: 'sync_problem' },
  syncing: { label: 'Enviando', color: 'bg-blue-100 text-blue-800 border-blue-200', icon: 'sync' },
  synced: { label: 'Sincronizado', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: 'cloud_done' },
  error: { label: 'Erro no envio', color: 'bg-red-100 text-red-800 border-red-200', icon: 'error' },
};

const FieldSurveys: React.FC = () => {
  const { user, isOfflineSession } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState<SurveyForm>(emptyForm);
  const [surveys, setSurveys] = useState<FieldSurvey[]>([]);
  const [documentTypes, setDocumentTypes] = useState<CachedDocumentType[]>([]);
  const [projects, setProjects] = useState<CachedProject[]>([]);
  const [cacheUpdatedAt, setCacheUpdatedAt] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [photoUploadStatus, setPhotoUploadStatus] = useState('');
  const [message, setMessage] = useState('');
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [libraryTab, setLibraryTab] = useState<'local' | 'system' | 'archived'>('local');
  const [remoteSurveys, setRemoteSurveys] = useState<RemoteFieldSurveyDocument[]>([]);
  const [selectedPhoto, setSelectedPhoto] = useState<FieldSurveyPhoto | null>(null);

  const pendingCount = useMemo(
    () => surveys.filter(item => item.status === 'pending' || item.status === 'error').length,
    [surveys]
  );
  const syncedCount = useMemo(() => surveys.filter(item => item.status === 'synced').length, [surveys]);
  const draftCount = useMemo(() => surveys.filter(item => item.status === 'draft').length, [surveys]);
  const activeRemoteSurveys = useMemo(() => remoteSurveys.filter(remote => !remote.archivedAt), [remoteSurveys]);
  const archivedRemoteSurveys = useMemo(() => remoteSurveys.filter(remote => !!remote.archivedAt), [remoteSurveys]);
  const canTakePhoto = useMemo(() => isMobileDevice(), []);
  const visiblePhotos = useMemo(
    () => [...form.photos].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [form.photos]
  );
  const autosaveKey = useMemo(
    () => `${FIELD_SURVEY_AUTOSAVE_PREFIX}_${user?.id || 'anon'}`,
    [user?.id]
  );

  useEffect(() => {
    loadLocalData();
  }, [user?.id]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(autosaveKey);
      if (!raw) return;

      const saved = JSON.parse(raw) as { form?: SurveyForm };
      if (saved?.form && hasFormContent(saved.form)) {
        setForm(saved.form);
        setMessage('Rascunho em andamento restaurado neste aparelho.');
      }
    } catch {
      localStorage.removeItem(autosaveKey);
    }
  }, [autosaveKey]);

  useEffect(() => {
    if (!hasFormContent(form)) {
      localStorage.removeItem(autosaveKey);
      return;
    }

    const timer = window.setTimeout(() => {
      try {
        localStorage.setItem(autosaveKey, JSON.stringify({
          form,
          savedAt: new Date().toISOString(),
        }));
      } catch {
        setMessage('Nao foi possivel manter o rascunho automatico. Salve o rascunho manualmente.');
      }
    }, 500);

    return () => window.clearTimeout(timer);
  }, [autosaveKey, form]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!hasFormContent(form)) return;
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [form]);

  useEffect(() => {
    const handleOnline = () => setMessage('Internet voltou. Voce ja pode sincronizar os levantamentos pendentes.');
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, []);

  const loadLocalData = async () => {
    try {
      const cache = await getOfflineCache();
      setDocumentTypes(cache.documentTypes);
      setProjects(cache.projects);
      setCacheUpdatedAt(cache.updatedAt);

      if (user?.id) {
        const [localItems, remoteItems] = await Promise.all([
          getFieldSurveys(user.id),
          getRemoteFieldSurveyDocuments(user.id),
        ]);
        setSurveys(localItems);
        setRemoteSurveys(remoteItems);
      }
    } catch (error: any) {
      setMessage(error.message || 'Nao foi possivel abrir o banco local.');
    }
  };

  const updateForm = (patch: Partial<SurveyForm>) => setForm(current => ({ ...current, ...patch }));
  const clearAutosave = () => localStorage.removeItem(autosaveKey);

  const handleDocumentTypeChange = (id: string) => {
    const selected = documentTypes.find(item => item.id === id);
    updateForm({
      documentTypeId: id,
      documentTypeName: selected?.name || 'Levantamento de Campo',
    });
  };

  const handleProjectChange = (id: string) => {
    const selected = projects.find(item => item.id === id);
    updateForm({
      projectId: id,
      projectName: selected?.name || '',
      location: form.location || selected?.location || '',
    });
  };

  const handleRefreshCache = async () => {
    if (!navigator.onLine) {
      setMessage('Sem internet: usando os dados que ja estavam preparados para campo.');
      return;
    }

    setIsSaving(true);
    try {
      const cache = await refreshOfflineCache();
      setDocumentTypes(cache.documentTypes);
      setProjects(cache.projects);
      setCacheUpdatedAt(cache.updatedAt);
      setMessage('Dados de campo atualizados neste aparelho.');
    } catch (error: any) {
      setMessage(error.message || 'Erro ao preparar dados para campo.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>, applyGeoStamp = false) => {
    const files = event.target.files;
    if (!files?.length) return;
    const shouldApplyGeoStamp = applyGeoStamp && canTakePhoto;

    setIsSaving(true);
    setPhotoUploadStatus(`Preparando ${files.length} foto(s)...`);
    try {
      const photos: FieldSurveyPhoto[] = [];
      if (shouldApplyGeoStamp) setPhotoUploadStatus('Obtendo geolocalizacao...');
      const locationStamp = shouldApplyGeoStamp ? await getPhotoLocationStamp() : null;

      for (let index = 0; index < files.length; index++) {
        setPhotoUploadStatus(`Processando foto ${index + 1} de ${files.length}...`);
        const createdAt = locationStamp?.capturedAt || new Date().toISOString();
        const blob = await compressImage(files[index], locationStamp ? { locationStamp } : undefined);
        const url = await blobToDataUrl(blob);
        photos.push({
          id: createLocalId(),
          url,
          caption: `Foto ${form.photos.length + photos.length + 1}`,
          createdAt,
          latitude: locationStamp?.latitude,
          longitude: locationStamp?.longitude,
          accuracy: locationStamp?.accuracy,
        });
      }

      updateForm({ photos: [...photos.reverse(), ...form.photos] });
      event.target.value = '';
      if (!shouldApplyGeoStamp) {
        setMessage('Foto anexada sem tarja de geolocalizacao.');
      } else {
        setMessage(
          typeof locationStamp?.latitude === 'number'
            ? 'Foto adicionada com tarja de geolocalizacao.'
            : 'Foto adicionada. Localizacao nao autorizada ou indisponivel.'
        );
      }
    } catch (error) {
      setMessage('Nao foi possivel processar uma das fotos.');
    } finally {
      setIsSaving(false);
      setPhotoUploadStatus('');
    }
  };

  const removePhoto = (id: string) => {
    updateForm({ photos: form.photos.filter(photo => photo.id !== id) });
  };

  const updatePhotoCaption = (id: string, caption: string) => {
    updateForm({
      photos: form.photos.map(photo => photo.id === id ? { ...photo, caption } : photo),
    });
  };

  const getCurrentPosition = () => {
    if (!navigator.geolocation) {
      setMessage('Geolocalizacao indisponivel neste aparelho.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        updateForm({
          location: `${position.coords.latitude.toFixed(6)}, ${position.coords.longitude.toFixed(6)}`,
        });
        setMessage('Coordenada registrada no levantamento.');
      },
      () => setMessage('Nao foi possivel capturar a coordenada agora.'),
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  const makeSurvey = (status: 'draft' | 'pending'): FieldSurvey | null => {
    if (!user?.id) {
      setMessage('Entre no sistema com internet uma vez antes de usar o campo offline.');
      return null;
    }

    if (!form.title.trim()) {
      setMessage('Informe um titulo para o levantamento.');
      return null;
    }

    if (!form.initialInfo.trim() && !form.notes.trim() && form.photos.length === 0) {
      setMessage('Registre pelo menos uma informacao, observacao ou foto.');
      return null;
    }

    const now = new Date().toISOString();

    return {
      id: form.id || createLocalId(),
      userId: user.id,
      userEmail: user.email,
      title: form.title.trim(),
      documentTypeId: form.documentTypeId || undefined,
      documentTypeName: form.documentTypeName || 'Levantamento de Campo',
      projectId: form.projectId || undefined,
      projectName: form.projectName || undefined,
      eventDate: form.eventDate,
      location: form.location.trim(),
      initialInfo: form.initialInfo.trim(),
      notes: form.notes.trim(),
      recommendations: form.recommendations.trim(),
      photos: form.photos,
      status,
      attempts: surveys.find(item => item.id === form.id)?.attempts || 0,
      createdAt: surveys.find(item => item.id === form.id)?.createdAt || now,
      updatedAt: now,
    };
  };

  const saveLocal = async (status: 'draft' | 'pending') => {
    if (status === 'pending' && !confirm('Finalizar este levantamento localmente e colocá-lo na fila de sincronização?')) {
      return;
    }

    const survey = makeSurvey(status);
    if (!survey) return;

    setIsSaving(true);
    try {
      await saveFieldSurvey(survey);
      if (status === 'pending') {
        clearAutosave();
        setForm(emptyForm());
      } else {
        setForm(current => ({ ...current, id: survey.id }));
      }
      await loadLocalData();
      setMessage(status === 'pending' ? 'Levantamento finalizado localmente e colocado na fila.' : 'Rascunho salvo neste aparelho sem limpar o formulario.');
    } catch (error: any) {
      setMessage(error.message || 'Erro ao salvar levantamento local.');
    } finally {
      setIsSaving(false);
    }
  };

  const editSurvey = (survey: FieldSurvey) => {
    setForm({
      id: survey.id,
      title: survey.title,
      documentTypeId: survey.documentTypeId || '',
      documentTypeName: survey.documentTypeName,
      projectId: survey.projectId || '',
      projectName: survey.projectName || '',
      eventDate: survey.eventDate || today(),
      location: survey.location || '',
      initialInfo: survey.initialInfo || '',
      notes: survey.notes || '',
      recommendations: survey.recommendations || '',
      photos: survey.photos || [],
    });
    setMessage('Levantamento carregado para edicao.');
    setIsLibraryOpen(false);
  };

  const removeSurvey = async (survey: FieldSurvey) => {
    const text = survey.status === 'synced'
      ? 'Remover a copia local deste levantamento sincronizado?'
      : 'Excluir este levantamento local? Esta acao nao pode ser desfeita.';

    if (!confirm(text)) return;

    await deleteFieldSurvey(survey.id);
    await loadLocalData();
    if (form.id === survey.id) {
      clearAutosave();
      setForm(emptyForm());
    }
  };

  const syncOne = async (survey: FieldSurvey) => {
    setIsSyncing(true);
    try {
      const synced = await syncFieldSurvey(survey);
      await loadLocalData();
      setMessage(`Levantamento enviado. Documento criado no sistema: ${synced.remoteId}`);
    } catch (error: any) {
      await loadLocalData();
      setMessage(error.message || 'Falha ao sincronizar levantamento.');
    } finally {
      setIsSyncing(false);
    }
  };

  const syncAll = async () => {
    setIsSyncing(true);
    try {
      const result = await syncPendingFieldSurveys(user?.id);
      await loadLocalData();
      setMessage(`${result.synced.length} levantamento(s) enviado(s). ${result.failed.length} com erro.`);
    } catch (error: any) {
      setMessage(error.message || 'Erro ao sincronizar fila.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handleCreateDocument = async (remote: RemoteFieldSurveyDocument, forceNew = false) => {
    setIsSyncing(true);
    try {
      const documentId = await createDocumentFromFieldSurvey(remote, { forceNew });
      await loadLocalData();
      setMessage('Documento tecnico criado a partir do levantamento.');
      if (documentId) navigate(`/editor/${documentId}`);
    } catch (error: any) {
      setMessage(error.message || 'Nao foi possivel gerar o documento tecnico.');
    } finally {
      setIsSyncing(false);
    }
  };

  const handlePrepareNotification = (remote: RemoteFieldSurveyDocument) => {
    const survey = remote.payload;
    const content = [
      `LEVANTAMENTO DE ORIGEM: ${survey.title}`,
      survey.eventDate ? `DATA DO LEVANTAMENTO: ${new Date(`${survey.eventDate}T00:00:00`).toLocaleDateString('pt-BR')}` : '',
      survey.projectName ? `OBRA VINCULADA: ${survey.projectName}` : '',
      survey.location ? `LOCAL INFORMADO: ${survey.location}` : '',
      survey.initialInfo ? `INFORMACOES INICIAIS:\n${survey.initialInfo}` : '',
      survey.notes ? `REGISTRO DE CAMPO:\n${survey.notes}` : '',
      survey.recommendations ? `ENCAMINHAMENTOS:\n${survey.recommendations}` : '',
      survey.photos?.length ? `EVIDENCIAS FOTOGRAFICAS: ${survey.photos.length} foto(s) anexada(s).` : '',
    ].filter(Boolean).join('\n\n');

    const draft = {
      locInfracao: survey.location || survey.projectName || '',
      observacoes: content,
      textoPadrao: content,
      fotos: survey.photos?.map(photo => photo.url) || [],
      photosPerPage: 4,
      authorId: user?.id,
      sourceFieldSurveyId: remote.id,
      sourceFieldSurveyTitle: survey.title,
    };

    localStorage.setItem('draft_notif_new', JSON.stringify(draft));
    navigate('/notifications', { state: { openDraftNotification: true } });
  };

  const archiveRemoteSurvey = async (remote: RemoteFieldSurveyDocument) => {
    const used = !!remote.generatedDocumentId || !!remote.generatedNotificationId;
    const text = used
      ? 'Este levantamento ja foi usado. Ele sera arquivado, sem apagar documentos ou notificacoes gerados. Continuar?'
      : 'Arquivar este levantamento no sistema?';

    if (!confirm(text)) return;

    try {
      await archiveRemoteFieldSurvey(remote.id);
      await loadLocalData();
      setMessage('Levantamento arquivado no sistema.');
    } catch (error: any) {
      setMessage(error.message || 'Nao foi possivel arquivar o levantamento.');
    }
  };

  const startNewSurvey = () => {
    const hasContent = hasFormContent(form);

    if (hasContent && !confirm('Iniciar um novo levantamento e limpar o formulario atual?')) return;
    clearAutosave();
    setForm(emptyForm());
    setMessage('Formulario limpo para um novo levantamento.');
  };

  const renderLocalSurveyCard = (survey: FieldSurvey) => {
    const meta = statusMeta[survey.status];
    const canEdit = survey.status === 'draft' || survey.status === 'pending' || survey.status === 'error';
    const canSync = survey.status === 'pending' || survey.status === 'error';

    return (
      <article key={survey.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h4 className="truncate text-sm font-black text-slate-900">{survey.title}</h4>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {survey.eventDate ? new Date(`${survey.eventDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data'} · {survey.photos.length} foto(s)
            </p>
            {survey.projectName && <p className="mt-1 truncate text-xs font-bold text-slate-500">{survey.projectName}</p>}
          </div>
          <span className={`inline-flex flex-none items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-black uppercase ${meta.color}`}>
            <span className={`material-symbols-outlined text-[14px] ${survey.status === 'syncing' ? 'animate-spin' : ''}`}>{meta.icon}</span>
            {meta.label}
          </span>
        </div>

        {survey.lastError && (
          <p className="mt-3 rounded-md bg-red-50 p-2 text-xs font-semibold text-red-700">{survey.lastError}</p>
        )}

        <div className="mt-4 flex flex-wrap gap-2">
          {canEdit && (
            <button onClick={() => editSurvey(survey)} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
              <span className="material-symbols-outlined text-[16px]">edit</span>
              Editar
            </button>
          )}
          {canSync && (
            <button onClick={() => syncOne(survey)} disabled={isSyncing} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-primary px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
              <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
              Enviar
            </button>
          )}
          <button onClick={() => removeSurvey(survey)} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-3 text-xs font-bold text-red-600 hover:bg-red-50">
            <span className="material-symbols-outlined text-[16px]">delete</span>
            Remover
          </button>
        </div>
      </article>
    );
  };

  const renderRemoteSurveyCard = (remote: RemoteFieldSurveyDocument, archived = false) => (
    <article key={remote.id} className={`rounded-lg border p-4 shadow-sm ${archived ? 'border-slate-200 bg-slate-50' : 'border-blue-100 bg-blue-50/70'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="truncate text-sm font-black text-slate-900">{remote.title}</h4>
          <p className="mt-1 text-xs font-semibold text-slate-500">
            {remote.eventDate ? new Date(`${remote.eventDate}T00:00:00`).toLocaleDateString('pt-BR') : new Date(remote.createdAt).toLocaleDateString('pt-BR')}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {remote.generatedDocumentId && <span className="rounded-full bg-blue-100 px-2 py-1 text-[10px] font-black uppercase text-blue-700">Documento</span>}
            {remote.generatedNotificationId && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase text-amber-700">Notificacao</span>}
            {archived && <span className="rounded-full bg-slate-200 px-2 py-1 text-[10px] font-black uppercase text-slate-700">Arquivado</span>}
          </div>
        </div>
        <span className="inline-flex flex-none items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-1 text-[10px] font-black uppercase text-blue-700">
          <span className="material-symbols-outlined text-[14px]">assignment</span>
          Levantamento
        </span>
      </div>

      <p className="mt-3 line-clamp-3 text-xs font-medium text-slate-600">
        {remote.payload?.notes || remote.payload?.initialInfo || 'Sem observacoes registradas.'}
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => handleCreateDocument(remote, archived)} disabled={isSyncing} className="inline-flex h-9 items-center justify-center gap-1 rounded-md bg-blue-600 px-3 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-60">
          <span className="material-symbols-outlined text-[16px]">description</span>
          {archived ? 'Reutilizar em documento' : remote.generatedDocumentId ? 'Abrir documento' : 'Gerar documento'}
        </button>
        <button onClick={() => handlePrepareNotification(remote)} disabled={!!remote.generatedNotificationId} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-amber-200 bg-white px-3 text-xs font-bold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60">
          <span className="material-symbols-outlined text-[16px]">notifications_active</span>
          {remote.generatedNotificationId ? 'Notificacao criada' : archived ? 'Reutilizar em notificacao' : 'Usar em notificacao'}
        </button>
        {!archived && (
          <button onClick={() => archiveRemoteSurvey(remote)} className="inline-flex h-9 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 hover:bg-slate-50">
            <span className="material-symbols-outlined text-[16px]">archive</span>
            Arquivar
          </button>
        )}
      </div>
    </article>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-0 dark:bg-background-dark sm:p-3 lg:p-5">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-3 sm:gap-4">
        <div className="flex flex-col gap-3 px-3 pt-3 sm:px-0 sm:pt-0 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl lg:text-2xl font-black tracking-tight text-slate-950 dark:text-white">Campo Offline</h2>
              {isOfflineSession && (
                <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-100 px-3 py-1 text-xs font-bold text-amber-800">
                  <span className="material-symbols-outlined text-[16px]">offline_bolt</span>
                  Sessao offline
                </span>
              )}
            </div>
            <p className="mt-0.5 hidden max-w-3xl text-xs font-medium text-slate-500 dark:text-slate-400 sm:block">
              Registre levantamentos, fotos e observacoes em campo. O material fica no aparelho ate ser enviado para o sistema.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              onClick={handleRefreshCache}
              disabled={isSaving}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
            >
              <span className="material-symbols-outlined text-[20px]">download</span>
              Preparar campo
            </button>
            <button
              onClick={syncAll}
              disabled={isSyncing || pendingCount === 0}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white shadow-lg shadow-blue-500/20 transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <span className={`material-symbols-outlined text-[20px] ${isSyncing ? 'animate-spin' : ''}`}>sync</span>
              Sincronizar fila
            </button>
          </div>
        </div>

        <div className="mx-3 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 sm:mx-0">
          <span className="inline-flex items-center gap-1">
            <span className="material-symbols-outlined text-[17px] text-slate-400">edit_note</span>
            {draftCount} rascunho(s)
          </span>
          <span className="h-4 w-px bg-slate-200"></span>
          <span className="inline-flex items-center gap-1 text-amber-700">
            <span className="material-symbols-outlined text-[17px]">sync_problem</span>
            {pendingCount} pendente(s)
          </span>
          <span className="h-4 w-px bg-slate-200"></span>
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <span className="material-symbols-outlined text-[17px]">cloud_done</span>
            {syncedCount} enviado(s)
          </span>
          <span className="h-4 w-px bg-slate-200"></span>
          <span className="inline-flex items-center gap-1 text-blue-700">
            <span className="material-symbols-outlined text-[17px]">description</span>
            {activeRemoteSurveys.length} no sistema
          </span>
          <button
            onClick={() => setIsLibraryOpen(true)}
            className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-700 hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[17px]">inventory_2</span>
            Central
          </button>
        </div>

        {message && (
          <div className="mx-3 flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900 sm:mx-0">
            <span className="material-symbols-outlined text-[20px]">info</span>
            <span>{message}</span>
          </div>
        )}

        <div>
          <section className="min-h-[calc(100vh-9rem)] rounded-none border-y border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:rounded-lg sm:border">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">Novo levantamento</h3>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {cacheUpdatedAt ? `Dados preparados em ${new Date(cacheUpdatedAt).toLocaleString('pt-BR')}` : 'Prepare os dados antes de sair para campo'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                {form.id && (
                  <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">
                    Rascunho salvo
                  </span>
                )}
                  <button
                    onClick={startNewSurvey}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Iniciar novo
                  </button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-3 pb-28 sm:p-4 sm:pb-4 md:grid-cols-2 xl:grid-cols-4">
              <label className="md:col-span-2">
                <span className="text-xs font-black uppercase text-slate-500">Titulo</span>
                <input
                  value={form.title}
                  onChange={event => updateForm({ title: event.target.value })}
                  placeholder="Ex: Vistoria inicial da ponte rural"
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-bold text-slate-900 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label>
                <span className="text-xs font-black uppercase text-slate-500">Tipo de documento</span>
                <select
                  value={form.documentTypeId}
                  onChange={event => handleDocumentTypeChange(event.target.value)}
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:ring-primary/20"
                >
                  <option value="">Levantamento de Campo</option>
                  {documentTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-xs font-black uppercase text-slate-500">Obra vinculada</span>
                <select
                  value={form.projectId}
                  onChange={event => handleProjectChange(event.target.value)}
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:ring-primary/20"
                >
                  <option value="">Sem obra vinculada</option>
                  {projects.map(project => (
                    <option key={project.id} value={project.id}>{project.name}</option>
                  ))}
                </select>
              </label>

              <label>
                <span className="text-xs font-black uppercase text-slate-500">Data do evento</span>
                <input
                  type="date"
                  value={form.eventDate}
                  onChange={event => updateForm({ eventDate: event.target.value })}
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label>
                <span className="text-xs font-black uppercase text-slate-500">Local ou coordenada</span>
                <div className="mt-1 flex gap-2">
                  <input
                    value={form.location}
                    onChange={event => updateForm({ location: event.target.value })}
                    placeholder="Comunidade, rua, coordenada..."
                    className="block min-w-0 flex-1 rounded-lg border-slate-200 bg-slate-50 font-semibold text-slate-800 focus:border-primary focus:ring-primary/20"
                  />
                  <button
                    type="button"
                    onClick={getCurrentPosition}
                    title="Capturar coordenada"
                    className="inline-flex h-11 w-11 flex-none items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                  >
                    <span className="material-symbols-outlined text-[20px]">my_location</span>
                  </button>
                </div>
              </label>

              <label className="md:col-span-2 xl:col-span-4">
                <span className="text-xs font-black uppercase text-slate-500">Informacoes iniciais</span>
                <textarea
                  value={form.initialInfo}
                  onChange={event => updateForm({ initialInfo: event.target.value })}
                  rows={4}
                  placeholder="Contexto, solicitacao, condicoes de acesso, envolvidos..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label className="md:col-span-2 xl:col-span-4">
                <span className="text-xs font-black uppercase text-slate-500">Observacoes de campo</span>
                <textarea
                  value={form.notes}
                  onChange={event => updateForm({ notes: event.target.value })}
                  rows={7}
                  placeholder="Patologias, medidas, referencias, riscos, pendencias..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label className="md:col-span-2 xl:col-span-4">
                <span className="text-xs font-black uppercase text-slate-500">Encaminhamentos</span>
                <textarea
                  value={form.recommendations}
                  onChange={event => updateForm({ recommendations: event.target.value })}
                  rows={4}
                  placeholder="Documentos tecnicos, notificacoes ou projetos que devem nascer deste levantamento..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <div className="md:col-span-2 xl:col-span-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-col">
                    <span className="text-xs font-black uppercase text-slate-500">Fotos</span>
                    {form.photos.length > 0 && (
                      <span className="text-[11px] font-bold text-slate-400">{form.photos.length} foto(s) - mais recentes primeiro</span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {canTakePhoto && (
                      <label className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                        <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                        Tirar foto
                        <input
                          type="file"
                          accept="image/*"
                          capture="environment"
                          multiple
                          disabled={isSaving}
                          className="hidden"
                          onChange={event => handlePhotoUpload(event, true)}
                        />
                      </label>
                    )}
                    <label className={`inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 ${isSaving ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
                      <span className="material-symbols-outlined text-[18px]">photo_library</span>
                      Anexar foto
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        disabled={isSaving}
                        className="hidden"
                        onChange={event => handlePhotoUpload(event, false)}
                      />
                    </label>
                  </div>
                </div>

                {photoUploadStatus && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">
                    <span className="size-4 rounded-full border-2 border-blue-200 border-t-blue-600 animate-spin"></span>
                    {photoUploadStatus}
                  </div>
                )}

                {form.photos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {visiblePhotos.map(photo => (
                      <div key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <div className="relative aspect-video bg-slate-200">
                          <button
                            type="button"
                            onClick={() => setSelectedPhoto(photo)}
                            className="h-full w-full bg-slate-100"
                            title="Ver foto inteira"
                          >
                            <img src={photo.url} alt={photo.caption} className="h-full w-full object-contain" />
                          </button>
                          <button
                            onClick={() => removePhoto(photo.id)}
                            title="Remover foto"
                            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-white shadow"
                          >
                            <span className="material-symbols-outlined text-[18px]">close</span>
                          </button>
                        </div>
                        <input
                          value={photo.caption}
                          onChange={event => updatePhotoCaption(photo.id, event.target.value)}
                          className="block w-full border-0 bg-white px-3 py-2 text-sm font-semibold text-slate-700 focus:ring-primary/20"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-3 flex min-h-24 items-center justify-center rounded-lg border-2 border-dashed border-slate-200 bg-slate-50 text-center text-sm font-semibold text-slate-400">
                    Nenhuma foto adicionada.
                  </div>
                )}
              </div>
            </div>

            <div className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-2 gap-2 border-t border-slate-100 bg-white/95 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:sticky sm:flex sm:flex-col sm:justify-end sm:p-4 md:flex-row dark:border-slate-800 dark:bg-slate-900/95">
              <button
                onClick={() => saveLocal('draft')}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-5 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">save</span>
                Salvar rascunho
              </button>
              <button
                onClick={() => saveLocal('pending')}
                disabled={isSaving}
                className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-slate-900 px-5 text-sm font-bold text-white shadow-sm transition hover:bg-black disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                Finalizar localmente
              </button>
            </div>
          </section>

          {selectedPhoto && (
            <aside className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/80 p-3 backdrop-blur-sm">
              <div className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-black text-slate-950 dark:text-white">{selectedPhoto.caption}</h3>
                    <p className="text-[11px] font-semibold uppercase text-slate-400">Foto do levantamento</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPhoto(null)}
                    className="inline-flex h-9 w-9 flex-none items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-white"
                    title="Fechar foto"
                  >
                    <span className="material-symbols-outlined text-[20px]">close</span>
                  </button>
                </div>
                <div className="flex min-h-0 flex-1 items-center justify-center bg-slate-950 p-2">
                  <img src={selectedPhoto.url} alt={selectedPhoto.caption} className="max-h-[78vh] w-full object-contain" />
                </div>
              </div>
            </aside>
          )}

          {isLibraryOpen && (
          <aside className="fixed inset-0 z-50 flex items-end bg-slate-950/55 p-0 backdrop-blur-sm sm:items-center sm:p-4">
            <div className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl dark:bg-slate-900 sm:mx-auto sm:max-w-6xl sm:rounded-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className="text-base font-black text-slate-950 dark:text-white">Central de levantamentos</h3>
                <p className="hidden text-xs font-semibold uppercase text-slate-400 sm:block">Locais, sincronizados e arquivados para consulta e reutilizacao</p>
              </div>
              <button
                onClick={() => setIsLibraryOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Fechar central"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="grid grid-cols-3 gap-1 border-b border-slate-100 bg-slate-50 p-2 dark:border-slate-800 dark:bg-slate-950">
              {[
                { id: 'local', label: 'Local', count: surveys.length, icon: 'phone_iphone' },
                { id: 'system', label: 'Sistema', count: activeRemoteSurveys.length, icon: 'cloud_done' },
                { id: 'archived', label: 'Arquivados', count: archivedRemoteSurveys.length, icon: 'archive' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setLibraryTab(tab.id as 'local' | 'system' | 'archived')}
                  className={`flex min-w-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-black transition sm:gap-2 ${
                    libraryTab === tab.id
                      ? 'bg-white text-primary shadow-sm dark:bg-slate-800'
                      : 'text-slate-500 hover:bg-white/70 hover:text-slate-800 dark:hover:bg-slate-900 dark:hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                  <span className="truncate">{tab.label}</span>
                  <span className="rounded-full bg-slate-200 px-1.5 py-0.5 text-[10px] text-slate-700 dark:bg-slate-700 dark:text-slate-100">{tab.count}</span>
                </button>
              ))}
            </div>

            <div className={`${libraryTab === 'local' ? 'block' : 'hidden'} flex-1 overflow-y-auto p-3 sm:p-4`}>
              {surveys.length === 0 ? (
                <div className="flex min-h-24 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-4 text-center text-xs font-semibold text-slate-400">
                  <span className="material-symbols-outlined mb-1 text-3xl opacity-50">inventory_2</span>
                  Nenhum levantamento salvo localmente.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                  {surveys.map(survey => {
                    const meta = statusMeta[survey.status];
                    const canEdit = survey.status === 'draft' || survey.status === 'pending' || survey.status === 'error';
                    const canSync = survey.status === 'pending' || survey.status === 'error';

                    return (
                      <article key={survey.id} className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-800 dark:bg-slate-950">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="truncate text-xs font-black text-slate-900 dark:text-white">{survey.title}</h4>
                            <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                              {survey.eventDate ? new Date(`${survey.eventDate}T00:00:00`).toLocaleDateString('pt-BR') : 'Sem data'} · {survey.photos.length} foto(s)
                            </p>
                          </div>
                          <span className={`inline-flex flex-none items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${meta.color}`}>
                            <span className={`material-symbols-outlined text-[13px] ${survey.status === 'syncing' ? 'animate-spin' : ''}`}>{meta.icon}</span>
                            {meta.label}
                          </span>
                        </div>

                        {survey.projectName && (
                          <p className="mt-2 truncate text-xs font-bold text-slate-500">{survey.projectName}</p>
                        )}

                        {survey.lastError && (
                          <p className="mt-2 rounded-md bg-red-50 p-2 text-[11px] font-semibold text-red-700">{survey.lastError}</p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {canEdit && (
                            <button
                              onClick={() => editSurvey(survey)}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                            >
                              <span className="material-symbols-outlined text-[16px]">edit</span>
                              Editar
                            </button>
                          )}
                          {canSync && (
                            <button
                              onClick={() => syncOne(survey)}
                              disabled={isSyncing}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-primary px-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                            >
                              <span className="material-symbols-outlined text-[16px]">cloud_upload</span>
                              Enviar
                            </button>
                          )}
                          <button
                            onClick={() => removeSurvey(survey)}
                            className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-red-200 bg-white px-2 text-[11px] font-bold text-red-600 hover:bg-red-50"
                          >
                            <span className="material-symbols-outlined text-[16px]">delete</span>
                            Remover
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </div>

            <div className={`${libraryTab === 'system' ? 'block' : 'hidden'} flex-1 overflow-y-auto p-3 sm:p-4`}>
              <div className="mb-2 flex items-center justify-between gap-2 px-1">
                <div>
                  <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">Levantamentos no sistema</h4>
                  <p className="text-[10px] font-semibold uppercase text-slate-400">Aparecem em qualquer aparelho e podem virar documento ou notificacao</p>
                </div>
                <button
                  onClick={loadLocalData}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-700 hover:bg-slate-50"
                >
                  <span className="material-symbols-outlined text-[16px]">refresh</span>
                  Atualizar
                </button>
              </div>

              {activeRemoteSurveys.length === 0 ? (
                <div className="flex min-h-20 items-center justify-center rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs font-semibold text-slate-400">
                  Nenhum levantamento sincronizado encontrado no sistema.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-2 lg:grid-cols-2 2xl:grid-cols-3">
                  {activeRemoteSurveys.map(remote => (
                    <article key={remote.id} className="rounded-lg border border-blue-100 bg-blue-50/60 p-3 shadow-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h4 className="truncate text-xs font-black text-slate-900">{remote.title}</h4>
                          <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                            {remote.eventDate ? new Date(`${remote.eventDate}T00:00:00`).toLocaleDateString('pt-BR') : new Date(remote.createdAt).toLocaleDateString('pt-BR')}
                          </p>
                        </div>
                        <span className="inline-flex flex-none items-center gap-1 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase text-blue-700">
                          <span className="material-symbols-outlined text-[13px]">description</span>
                          Levantamento
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        <button
                          onClick={() => handleCreateDocument(remote)}
                          disabled={isSyncing}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-blue-600 px-2 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-60"
                        >
                          <span className="material-symbols-outlined text-[16px]">description</span>
                          {remote.generatedDocumentId ? 'Abrir documento' : 'Gerar documento'}
                        </button>
                        <button
                          onClick={() => handlePrepareNotification(remote)}
                          disabled={!!remote.generatedNotificationId}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-amber-200 bg-white px-2 text-[11px] font-bold text-amber-700 hover:bg-amber-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">notifications_active</span>
                          {remote.generatedNotificationId ? 'Notificacao criada' : 'Usar em notificacao'}
                        </button>
                        <button
                          onClick={() => archiveRemoteSurvey(remote)}
                          className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-bold text-slate-600 hover:bg-slate-50"
                        >
                          <span className="material-symbols-outlined text-[16px]">archive</span>
                          Arquivar
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
            <div className={`${libraryTab === 'archived' ? 'block' : 'hidden'} flex-1 overflow-y-auto p-3 sm:p-4`}>
              <div className="mb-3 px-1">
                <h4 className="text-xs font-black uppercase text-slate-700 dark:text-slate-200">Levantamentos arquivados</h4>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Historico guardado para consulta e reutilizacao futura</p>
              </div>

              {archivedRemoteSurveys.length === 0 ? (
                <div className="flex min-h-56 flex-col items-center justify-center rounded-lg border border-dashed border-slate-200 p-5 text-center text-sm font-semibold text-slate-400">
                  <span className="material-symbols-outlined mb-2 text-4xl opacity-50">archive</span>
                  Nenhum levantamento arquivado.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
                  {archivedRemoteSurveys.map(remote => renderRemoteSurveyCard(remote, true))}
                </div>
              )}
            </div>
            </div>
          </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default FieldSurveys;
