import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, type Message } from '@/lib/chat';
import { auth } from '@/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const RATE_LIMIT     = 20;  // requests per window
const RATE_WINDOW_MS = 60_000; // 1 minute
const TIMEOUT_MS     = 60_000; // upstream request timeout

async function checkRateLimit(email: string): Promise<boolean> {
  const bucket = new Date(Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  const result = await query(
    `INSERT INTO rate_limits (email, bucket, count) VALUES ($1, $2, 1)
     ON CONFLICT (email, bucket) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [email, bucket],
  );
  // Probabilistic cleanup of old buckets (≈2% of requests)
  if (Math.random() < 0.02) {
    query(`DELETE FROM rate_limits WHERE bucket < now() - interval '2 minutes'`).catch(() => {});
  }
  return result.rows[0].count <= RATE_LIMIT;
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return new Response('Unauthorized', { status: 401 });

  const allowed = await checkRateLimit(session.user.email);
  if (!allowed) return new Response('Rate limit exceeded', { status: 429 });

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

  // Abort if client disconnects or request times out
  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);

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
        try {
          for await (const chunk of sdkStream) {
            if (signal.aborted) break;
            if (chunk.text) controller.enqueue(enc.encode(chunk.text));
          }
        } finally {
          controller.close();
        }
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
      signal,
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
      signal,
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
      const encoder = new TextEncoder();
      let buffer    = '';

      try {
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
              if (text) controller.enqueue(encoder.encode(text));
            } catch {
              // skip malformed SSE lines
            }
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
}
