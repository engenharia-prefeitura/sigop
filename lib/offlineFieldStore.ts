import { supabase } from './supabase';

export type FieldSurveyStatus = 'draft' | 'pending' | 'syncing' | 'synced' | 'error';

export interface CachedDocumentType {
  id: string;
  name: string;
}

export interface CachedProject {
  id: string;
  name: string;
  location?: string;
}

export interface FieldSurveyPhoto {
  id: string;
  url: string;
  caption: string;
  createdAt: string;
}

export interface FieldSurvey {
  id: string;
  userId: string;
  userEmail?: string;
  title: string;
  documentTypeId?: string;
  documentTypeName: string;
  projectId?: string;
  projectName?: string;
  eventDate: string;
  location: string;
  initialInfo: string;
  notes: string;
  recommendations: string;
  photos: FieldSurveyPhoto[];
  status: FieldSurveyStatus;
  remoteId?: string;
  lastError?: string;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  syncedAt?: string;
}

export interface OfflineFieldCache {
  documentTypes: CachedDocumentType[];
  projects: CachedProject[];
  updatedAt: string;
}

const DB_NAME = 'sigop_offline_field';
const DB_VERSION = 1;
const SURVEYS_STORE = 'field_surveys';
const CACHE_STORE = 'field_cache';
const FIELD_CACHE_KEY = 'core';

const canUseIndexedDb = () => typeof window !== 'undefined' && 'indexedDB' in window;

const openDb = (): Promise<IDBDatabase> => {
  if (!canUseIndexedDb()) {
    return Promise.reject(new Error('IndexedDB indisponivel neste navegador.'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(SURVEYS_STORE)) {
        const surveys = db.createObjectStore(SURVEYS_STORE, { keyPath: 'id' });
        surveys.createIndex('userId', 'userId', { unique: false });
        surveys.createIndex('status', 'status', { unique: false });
        surveys.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(CACHE_STORE)) {
        db.createObjectStore(CACHE_STORE, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Falha ao abrir banco local.'));
  });
};

const runStore = async <T>(
  storeName: string,
  mode: IDBTransactionMode,
  runner: (store: IDBObjectStore) => IDBRequest<T> | void
): Promise<T | undefined> => {
  const db = await openDb();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = runner(store);

    if (request) {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    } else {
      tx.oncomplete = () => resolve(undefined);
    }

    tx.onerror = () => reject(tx.error);
  }).finally(() => db.close());
};

export const createLocalId = () => {
  const random = Math.random().toString(36).slice(2, 10);
  return `local_${Date.now()}_${random}`;
};

export const getOfflineCache = async (): Promise<OfflineFieldCache> => {
  const result = await runStore<any>(CACHE_STORE, 'readonly', store => store.get(FIELD_CACHE_KEY));
  return result?.data || { documentTypes: [], projects: [], updatedAt: '' };
};

export const refreshOfflineCache = async (): Promise<OfflineFieldCache> => {
  const [typesResult, projectsResult] = await Promise.all([
    supabase.from('document_types').select('id, name').order('name'),
    supabase.from('projects').select('id, name, location').order('created_at', { ascending: false }).limit(100),
  ]);

  if (typesResult.error) throw typesResult.error;
  if (projectsResult.error) throw projectsResult.error;

  const cache: OfflineFieldCache = {
    documentTypes: (typesResult.data || []).map((item: any) => ({ id: item.id, name: item.name })),
    projects: (projectsResult.data || []).map((item: any) => ({
      id: item.id,
      name: item.name,
      location: item.location || '',
    })),
    updatedAt: new Date().toISOString(),
  };

  await runStore(CACHE_STORE, 'readwrite', store => store.put({ id: FIELD_CACHE_KEY, data: cache }));
  return cache;
};

export const getFieldSurveys = async (userId?: string): Promise<FieldSurvey[]> => {
  const all = await runStore<FieldSurvey[]>(SURVEYS_STORE, 'readonly', store => store.getAll());
  return (all || [])
    .filter(item => !userId || item.userId === userId)
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
};

export const getFieldSurvey = async (id: string): Promise<FieldSurvey | undefined> => {
  return runStore<FieldSurvey>(SURVEYS_STORE, 'readonly', store => store.get(id));
};

export const saveFieldSurvey = async (survey: FieldSurvey): Promise<void> => {
  await runStore(SURVEYS_STORE, 'readwrite', store => store.put(survey));
};

export const deleteFieldSurvey = async (id: string): Promise<void> => {
  await runStore(SURVEYS_STORE, 'readwrite', store => store.delete(id));
};

export const markSurveyStatus = async (
  survey: FieldSurvey,
  status: FieldSurveyStatus,
  patch: Partial<FieldSurvey> = {}
) => {
  await saveFieldSurvey({
    ...survey,
    ...patch,
    status,
    updatedAt: new Date().toISOString(),
  });
};

const escapeHtml = (text: string) => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#039;');

const paragraphs = (text: string) => {
  return text
    .split(/\n+/)
    .map(part => part.trim())
    .filter(Boolean)
    .map(part => `<p>${escapeHtml(part)}</p>`)
    .join('');
};

export const buildDocumentPayload = (survey: FieldSurvey) => ({
  title: survey.title,
  description: `Levantamento de campo criado offline em ${new Date(survey.createdAt).toLocaleString('pt-BR')}.`,
  document_type_id: survey.documentTypeId || null,
  type: survey.documentTypeName || 'Levantamento de Campo',
  status: 'draft',
  created_by: survey.userId,
  event_date: survey.eventDate || null,
  project_id: survey.projectId || null,
  photos_per_page: 4,
  content: {
    offline_source: {
      local_id: survey.id,
      captured_by: survey.userEmail,
      captured_at: survey.createdAt,
      synced_at: new Date().toISOString(),
    },
    sections: [
      {
        id: 1,
        title: 'Informacoes Iniciais',
        type: 'text',
        content: paragraphs([
          survey.projectName ? `Obra vinculada: ${survey.projectName}` : '',
          survey.location ? `Local: ${survey.location}` : '',
          survey.initialInfo,
        ].filter(Boolean).join('\n')),
      },
      {
        id: 2,
        title: 'Registro de Campo',
        type: 'text',
        content: paragraphs(survey.notes || 'Sem observacoes registradas.'),
      },
      {
        id: 3,
        title: 'Encaminhamentos',
        type: 'text',
        content: paragraphs(survey.recommendations || 'Sem encaminhamentos registrados.'),
      },
      {
        id: 4,
        title: 'Relatorio Fotografico',
        type: 'photos',
        content: '',
        items: survey.photos.map(photo => ({
          id: photo.id,
          url: photo.url,
          caption: photo.caption,
        })),
      },
    ],
  },
});

export const syncFieldSurvey = async (survey: FieldSurvey): Promise<FieldSurvey> => {
  if (!navigator.onLine) {
    throw new Error('Sem internet para sincronizar agora.');
  }

  await markSurveyStatus(survey, 'syncing', { attempts: survey.attempts + 1, lastError: '' });

  const payload = buildDocumentPayload(survey);
  const { data, error } = await supabase.from('documents').insert(payload).select('id').single();

  if (error) {
    const failed = {
      ...survey,
      status: 'error' as FieldSurveyStatus,
      attempts: survey.attempts + 1,
      lastError: error.message,
      updatedAt: new Date().toISOString(),
    };
    await saveFieldSurvey(failed);
    throw error;
  }

  const synced = {
    ...survey,
    status: 'synced' as FieldSurveyStatus,
    attempts: survey.attempts + 1,
    remoteId: data?.id,
    lastError: '',
    syncedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveFieldSurvey(synced);
  return synced;
};

export const syncPendingFieldSurveys = async (userId?: string) => {
  const surveys = await getFieldSurveys(userId);
  const targets = surveys.filter(item => item.status === 'pending' || item.status === 'error');
  const results: { synced: FieldSurvey[]; failed: { survey: FieldSurvey; error: Error }[] } = {
    synced: [],
    failed: [],
  };

  for (const survey of targets) {
    try {
      const synced = await syncFieldSurvey(survey);
      results.synced.push(synced);
    } catch (error: any) {
      results.failed.push({ survey, error });
    }
  }

  return results;
};
