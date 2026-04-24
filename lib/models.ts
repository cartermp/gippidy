export const MODELS = [
  { id: 'gpt-5.5',                label: 'GPT-5.5',           provider: 'openai'    },
  { id: 'claude-opus-4-6',        label: 'Claude Opus 4.6',   provider: 'anthropic' },
  { id: 'claude-sonnet-4-6',      label: 'Claude Sonnet 4.6', provider: 'anthropic' },
  { id: 'gemini-3.1-pro-preview', label: 'Gemini 3.1 Pro',    provider: 'google'    },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',    provider: 'google'    },
];

export const ALLOWED_MODELS = new Set(MODELS.map(m => m.id));
