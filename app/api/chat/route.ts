import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';

export const runtime = 'nodejs';

type Image = { data: string; mimeType: string };
type Message = { role: string; content: string; images?: Image[] };
type Provider = 'openai' | 'anthropic' | 'google';

function getProvider(model: string): Provider {
  if (model.startsWith('claude')) return 'anthropic';
  if (model.startsWith('gemini')) return 'google';
  return 'openai';
}

function toOpenAIMessages(messages: Message[], systemPrompt?: string) {
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

function toAnthropicMessages(messages: Message[]) {
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

function toGeminiContents(messages: Message[]) {
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

export async function POST(req: NextRequest) {
  const { messages, model, systemPrompt } = await req.json() as {
    messages: Message[];
    model: string;
    systemPrompt?: string;
  };

  const provider = getProvider(model);

  const apiKey =
    (provider === 'openai'    ? process.env.OPENAI_API_KEY               : undefined) ||
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY            : undefined) ||
    (provider === 'google'    ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);

  if (!apiKey) {
    return new Response(`No API key for ${provider}`, { status: 401 });
  }

  // ── Google: use SDK ──────────────────────────────────────────────────────
  if (provider === 'google') {
    const ai = new GoogleGenAI({ apiKey });

    let sdkStream: AsyncIterable<import('@google/genai').GenerateContentResponse>;
    try {
      sdkStream = await ai.models.generateContentStream({
        model,
        contents: toGeminiContents(messages),
        ...(systemPrompt ? { config: { systemInstruction: systemPrompt } } : {}),
      });
    } catch (e) {
      return new Response(String(e), { status: 500 });
    }

    const stream = new ReadableStream({
      async start(controller) {
        const enc = new TextEncoder();
        for await (const chunk of sdkStream) {
          if (chunk.text) controller.enqueue(enc.encode(chunk.text));
        }
        controller.close();
      },
    });

    return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }

  // ── OpenAI / Anthropic: SSE ──────────────────────────────────────────────
  let upstream: Response;

  if (provider === 'openai') {
    upstream = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: toOpenAIMessages(messages, systemPrompt), stream: true }),
    });
  } else {
    upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: toAnthropicMessages(messages),
        ...(systemPrompt ? { system: systemPrompt } : {}),
        max_tokens: 8096,
        stream: true,
      }),
    });
  }

  if (!upstream.ok) {
    const body = await upstream.text();
    return new Response(body, { status: upstream.status });
  }

  const stream = new ReadableStream({
    async start(controller) {
      const reader  = upstream.body!.getReader();
      const decoder = new TextDecoder();
      let buffer    = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (!data || data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            let text = '';
            if (provider === 'openai') {
              text = parsed.choices?.[0]?.delta?.content ?? '';
            } else {
              if (parsed.type === 'content_block_delta' && parsed.delta?.type === 'text_delta') {
                text = parsed.delta.text ?? '';
              }
            }
            if (text) controller.enqueue(new TextEncoder().encode(text));
          } catch {
            // skip malformed lines
          }
        }
      }

      controller.close();
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
