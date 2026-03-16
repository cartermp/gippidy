type Image = { data: string; mimeType: string };
export type Message = { role: string; content: string; images?: Image[] };
export type Provider = 'openai' | 'anthropic' | 'google';

export function getProvider(model: string): Provider {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  return 'openai';
}

export function toOpenAIMessages(messages: Message[], systemPrompt?: string) {
  const result = messages.map(m => {
    if (!m.images?.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        ...m.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
      ],
    };
  });
  if (systemPrompt) result.unshift({ role: 'system', content: systemPrompt });
  return result;
}

export function toAnthropicMessages(messages: Message[]) {
  return messages.map(m => {
    if (!m.images?.length) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        ...m.images.map(img => ({
          type: 'image',
          source: { type: 'base64', media_type: img.mimeType, data: img.data },
        })),
        ...(m.content ? [{ type: 'text', text: m.content }] : []),
      ],
    };
  });
}

export function toGeminiContents(messages: Message[]) {
  return messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [
      ...(m.images ?? []).map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      })),
      ...(m.content ? [{ text: m.content }] : []),
    ],
  }));
}
