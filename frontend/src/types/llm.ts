export type LLMProvider = 'gemini' | 'openai';

export interface LLMConfig {
  provider: LLMProvider;
  apiKey: string | null;
  model: string;
}

export const GEMINI_MODELS = [
  { id: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' },
  { id: 'gemini-1.0-pro', label: 'Gemini 1.0 Pro' },
] as const;

export const OPENAI_MODELS = [
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
  { id: 'gpt-4', label: 'GPT-4' },
  { id: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
] as const;

export const DEFAULT_LLM_CONFIG: LLMConfig = {
  provider: 'gemini',
  apiKey: null,
  model: 'gemini-2.5-flash',
};

export const PROVIDER_LABELS: Record<LLMProvider, string> = {
  gemini: 'Google Gemini',
  openai: 'ChatGPT (OpenAI)',
};
