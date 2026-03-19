type Image = { data: string; mimeType: string };
type Pdf   = { name: string; data: string };  // base64, application/pdf
export type Message = { role: string; content: string; images?: Image[]; pdfs?: Pdf[] };
export type Provider = 'openai' | 'anthropic' | 'google';

export function getProvider(model: string): Provider {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  return 'openai';
}

export function toOpenAIMessages(messages: Message[], systemPrompt?: string) {
  const result = messages.map(m => {
    // PDFs not supported by chat completions; surface as a text note
    const pdfNote = m.pdfs?.map(p => `[PDF attached: ${p.name} — this model cannot read PDFs]`).join('\n') ?? '';
    const fullContent = [pdfNote, m.content].filter(Boolean).join('\n');

    if (!m.images?.length) return { role: m.role, content: fullContent };
    return {
      role: m.role,
      content: [
        ...m.images.map(img => ({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        })),
        ...(fullContent ? [{ type: 'text', text: fullContent }] : []),
      ],
    };
  });
  if (systemPrompt) result.unshift({ role: 'system', content: systemPrompt });
  return result;
}

export function toAnthropicMessages(messages: Message[]) {
  return messages.map(m => {
    const hasContent = m.images?.length || m.pdfs?.length;
    if (!hasContent) return { role: m.role, content: m.content };
    return {
      role: m.role,
      content: [
        ...(m.pdfs ?? []).map(pdf => ({
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: pdf.data },
        })),
        ...(m.images ?? []).map(img => ({
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
      ...(m.pdfs ?? []).map(pdf => ({
        inlineData: { mimeType: 'application/pdf', data: pdf.data },
      })),
      ...(m.images ?? []).map(img => ({
        inlineData: { mimeType: img.mimeType, data: img.data },
      })),
      ...(m.content ? [{ text: m.content }] : []),
    ],
  }));
}
