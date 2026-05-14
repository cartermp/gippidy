export const MODELS = [
  { id: 'gpt-5.5',                label: 'GPT-5.5',           provider: 'openai'    },
  { id: 'claude-opus-4-6',        label: 'Claude Opus 4.6',   provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',      label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',    provider: 'google'    },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',    provider: 'google'    },
 ] as const;

export type ModelId = (typeof MODELS)[number]['id'];

export const DEFAULT_MODEL_ID: ModelId = MODELS[0].id;
export const ALLOWED_MODELS = new Set<ModelId>(MODELS.map(m => m.id));

export function isModelId(value: string): value is ModelId {
  return ALLOWED_MODELS.has(value as ModelId);
}

export function normalizeModelId(value: string | null | undefined): ModelId {
  return value && isModelId(value) ? value : DEFAULT_MODEL_ID;
}

export function getModelLabel(model: string): string {
  return MODELS.find(candidate => candidate.id === model)?.label ?? model;
}
