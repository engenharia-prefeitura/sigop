import { supabase } from './supabase';

export const AI_VISIBILITY_CHANGED_EVENT = 'sigop_ai_visibility_changed';
export const DEFAULT_AI_ASSISTANT_ENABLED = true;

export const normalizeAiAssistantEnabled = (settings: any) =>
  settings?.ai_assistant_enabled !== false;

export const getAiAssistantEnabled = async () => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('ai_assistant_enabled')
      .maybeSingle();

    if (error) {
      console.warn('Nao foi possivel ler a visibilidade global da IA.', error.message);
      return DEFAULT_AI_ASSISTANT_ENABLED;
    }

    return normalizeAiAssistantEnabled(data);
  } catch (error) {
    console.warn('Erro ao consultar visibilidade global da IA.', error);
    return DEFAULT_AI_ASSISTANT_ENABLED;
  }
};

export const notifyAiVisibilityChanged = () => {
  try {
    window.dispatchEvent(new Event(AI_VISIBILITY_CHANGED_EVENT));
  } catch {}
};
