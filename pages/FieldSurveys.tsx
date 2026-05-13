import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../components/AuthContext';
import { compressImage } from '../utils/imageCompressor';
import {
  CachedDocumentType,
  CachedProject,
  createLocalId,
  deleteFieldSurvey,
  FieldSurvey,
  FieldSurveyPhoto,
  getFieldSurveys,
  getOfflineCache,
  refreshOfflineCache,
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
  const [message, setMessage] = useState('');
  const [isListOpen, setIsListOpen] = useState(false);

  const pendingCount = useMemo(
    () => surveys.filter(item => item.status === 'pending' || item.status === 'error').length,
    [surveys]
  );
  const syncedCount = useMemo(() => surveys.filter(item => item.status === 'synced').length, [surveys]);
  const draftCount = useMemo(() => surveys.filter(item => item.status === 'draft').length, [surveys]);

  useEffect(() => {
    loadLocalData();
  }, [user?.id]);

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
        setSurveys(await getFieldSurveys(user.id));
      }
    } catch (error: any) {
      setMessage(error.message || 'Nao foi possivel abrir o banco local.');
    }
  };

  const updateForm = (patch: Partial<SurveyForm>) => setForm(current => ({ ...current, ...patch }));

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

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files?.length) return;

    setIsSaving(true);
    try {
      const photos: FieldSurveyPhoto[] = [];

      for (let index = 0; index < files.length; index++) {
        const blob = await compressImage(files[index]);
        const url = await blobToDataUrl(blob);
        photos.push({
          id: createLocalId(),
          url,
          caption: `Foto ${form.photos.length + photos.length + 1}`,
          createdAt: new Date().toISOString(),
        });
      }

      updateForm({ photos: [...form.photos, ...photos] });
      event.target.value = '';
    } catch (error) {
      setMessage('Nao foi possivel processar uma das fotos.');
    } finally {
      setIsSaving(false);
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
    const survey = makeSurvey(status);
    if (!survey) return;

    setIsSaving(true);
    try {
      await saveFieldSurvey(survey);
      setForm(emptyForm());
      await loadLocalData();
      setMessage(status === 'pending' ? 'Levantamento finalizado localmente e colocado na fila.' : 'Rascunho salvo neste aparelho.');
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
    setIsListOpen(false);
  };

  const removeSurvey = async (survey: FieldSurvey) => {
    const text = survey.status === 'synced'
      ? 'Remover a copia local deste levantamento sincronizado?'
      : 'Excluir este levantamento local? Esta acao nao pode ser desfeita.';

    if (!confirm(text)) return;

    await deleteFieldSurvey(survey.id);
    await loadLocalData();
    if (form.id === survey.id) setForm(emptyForm());
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

  const openRemoteDocument = (survey: FieldSurvey) => {
    if (survey.remoteId) navigate(`/editor/${survey.remoteId}`);
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark p-3 lg:p-5">
      <div className="mx-auto flex max-w-[1500px] flex-col gap-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
            <p className="mt-0.5 max-w-3xl text-xs font-medium text-slate-500 dark:text-slate-400">
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

        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
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
          <button
            onClick={() => setIsListOpen(current => !current)}
            className="ml-auto inline-flex h-8 items-center justify-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-black text-slate-700 hover:bg-slate-100"
          >
            <span className="material-symbols-outlined text-[17px]">{isListOpen ? 'visibility_off' : 'list_alt'}</span>
            {isListOpen ? 'Ocultar lista' : 'Ver lista'}
          </button>
        </div>

        {message && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-900">
            <span className="material-symbols-outlined text-[20px]">info</span>
            <span>{message}</span>
          </div>
        )}

        <div>
          <section className="rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-black text-slate-950 dark:text-white">Novo levantamento</h3>
                  <p className="text-xs font-semibold uppercase text-slate-400">
                    {cacheUpdatedAt ? `Dados preparados em ${new Date(cacheUpdatedAt).toLocaleString('pt-BR')}` : 'Prepare os dados antes de sair para campo'}
                  </p>
                </div>
                {form.id && (
                  <button
                    onClick={() => setForm(emptyForm())}
                    className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"
                  >
                    Limpar
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 p-4 md:grid-cols-2 xl:grid-cols-4">
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
                  rows={3}
                  placeholder="Contexto, solicitacao, condicoes de acesso, envolvidos..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label className="md:col-span-2 xl:col-span-4">
                <span className="text-xs font-black uppercase text-slate-500">Observacoes de campo</span>
                <textarea
                  value={form.notes}
                  onChange={event => updateForm({ notes: event.target.value })}
                  rows={4}
                  placeholder="Patologias, medidas, referencias, riscos, pendencias..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <label className="md:col-span-2 xl:col-span-4">
                <span className="text-xs font-black uppercase text-slate-500">Encaminhamentos</span>
                <textarea
                  value={form.recommendations}
                  onChange={event => updateForm({ recommendations: event.target.value })}
                  rows={2}
                  placeholder="Documentos tecnicos, notificacoes ou projetos que devem nascer deste levantamento..."
                  className="mt-1 block w-full rounded-lg border-slate-200 bg-slate-50 font-medium text-slate-800 focus:border-primary focus:ring-primary/20"
                />
              </label>

              <div className="md:col-span-2 xl:col-span-4">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-black uppercase text-slate-500">Fotos</span>
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50">
                    <span className="material-symbols-outlined text-[18px]">add_a_photo</span>
                    Adicionar
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className="hidden"
                      onChange={handlePhotoUpload}
                    />
                  </label>
                </div>

                {form.photos.length > 0 ? (
                  <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                    {form.photos.map(photo => (
                      <div key={photo.id} className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                        <div className="relative aspect-video bg-slate-200">
                          <img src={photo.url} alt={photo.caption} className="h-full w-full object-cover" />
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

            <div className="sticky bottom-0 z-10 flex flex-col gap-2 border-t border-slate-100 bg-white/95 p-4 backdrop-blur sm:flex-row sm:justify-end dark:border-slate-800 dark:bg-slate-900/95">
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

          {isListOpen && (
          <aside className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 dark:border-slate-800">
              <div>
                <h3 className="text-sm font-black text-slate-950 dark:text-white">Levantamentos locais</h3>
                <p className="text-[10px] font-semibold uppercase text-slate-400">Apoio rapido para editar, enviar ou remover</p>
              </div>
              <button
                onClick={() => setIsListOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                title="Ocultar lista"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto p-2">
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
                          {survey.status === 'synced' && (
                            <button
                              onClick={() => openRemoteDocument(survey)}
                              className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-emerald-600 px-2 text-[11px] font-bold text-white hover:bg-emerald-700"
                            >
                              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
                              Abrir
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
          </aside>
          )}
        </div>
      </div>
    </div>
  );
};

export default FieldSurveys;
