import type { AiFunctionKey, ProviderId, ProviderPreset } from './types';

export const PROVIDER_PRESETS: ProviderPreset[] = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    format: 'openai',
    baseUrl: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-v1-...',
    docsUrl: 'https://openrouter.ai/keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    format: 'openai',
    baseUrl: 'https://api.deepseek.com',
    keyHint: 'sk-...',
    docsUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    format: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    keyHint: 'sk-proj-...',
    docsUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    format: 'google',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    keyHint: 'AIza...',
    docsUrl: 'https://aistudio.google.com/app/apikey',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    format: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    keyHint: 'sk-ant-...',
    docsUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'custom',
    name: 'Personalizado (compatível OpenAI)',
    format: 'openai',
    baseUrl: '',
    keyHint: 'Chave do seu servidor',
    docsUrl: 'https://platform.openai.com/docs/api-reference',
  },
];

/** Sugestoes de modelo por provedor e funcao (o usuario pode trocar). */
export const DEFAULT_MODELS: Record<ProviderId, Partial<Record<AiFunctionKey, string>>> = {
  openrouter: {
    chat: 'anthropic/claude-sonnet-4.5',
    writer: 'anthropic/claude-sonnet-4.5',
    vision: 'google/gemini-2.5-flash',
    reviewer: 'openai/gpt-4o-mini',
  },
  deepseek: {
    chat: 'deepseek-chat',
    writer: 'deepseek-chat',
    reviewer: 'deepseek-reasoner',
  },
  openai: {
    chat: 'gpt-4o-mini',
    writer: 'gpt-4o',
    vision: 'gpt-4o',
    reviewer: 'gpt-4o-mini',
  },
  google: {
    chat: 'gemini-2.5-flash',
    writer: 'gemini-2.5-pro',
    vision: 'gemini-2.5-flash',
    reviewer: 'gemini-2.5-flash',
  },
  anthropic: {
    chat: 'claude-sonnet-4-5',
    writer: 'claude-sonnet-4-5',
    vision: 'claude-sonnet-4-5',
    reviewer: 'claude-haiku-4-5',
  },
  custom: {},
};

export function getPreset(id: ProviderId): ProviderPreset {
  return PROVIDER_PRESETS.find((p) => p.id === id) ?? PROVIDER_PRESETS[PROVIDER_PRESETS.length - 1];
}
