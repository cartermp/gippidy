import { NextRequest } from 'next/server';
import { GoogleGenAI } from '@google/genai';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, type Message } from '@/lib/chat';
import { auth } from '@/auth';
import { query } from '@/lib/db';

export const runtime = 'nodejs';

const RATE_LIMIT     = 20;
const RATE_WINDOW_MS = 60_000;
const TIMEOUT_MS     = 60_000;

async function checkRateLimit(email: string): Promise<boolean> {
  const bucket = new Date(Math.floor(Date.now() / RATE_WINDOW_MS) * RATE_WINDOW_MS).toISOString();
  const result = await query(
    `INSERT INTO rate_limits (email, bucket, count) VALUES ($1, $2, 1)
     ON CONFLICT (email, bucket) DO UPDATE SET count = rate_limits.count + 1
     RETURNING count`,
    [email, bucket],
  );
  if (Math.random() < 0.02) {
    query(`DELETE FROM rate_limits WHERE bucket < now() - interval '2 minutes'`).catch(() => {});
  }
  return result.rows[0].count <= RATE_LIMIT;
}

// Anthropic multi-turn loop for web search.
// Each tool round is non-streaming (collect tool_use, return tool_result).
// Final text is enqueued in one shot — client sees it after the search completes.
async function anthropicWebSearch(
  apiKey: string,
  messages: Message[],
  systemPrompt: string | undefined,
  model: string,
  signal: AbortSignal,
): Promise<Response> {
  const headers = {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'Content-Type': 'application/json',
  };
  const tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5 }];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let currentMessages: any[] = toAnthropicMessages(messages);

  for (let round = 0; round < 5; round++) {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: currentMessages,
        ...(systemPrompt ? { system: systemPrompt } : {}),
        max_tokens: 8096,
        tools,
      }),
      signal,
    });

    if (!res.ok) return new Response(await res.text(), { status: res.status });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: { content: any[]; stop_reason: string } = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const toolUseBlocks = data.content.filter((b: any) => b.type === 'tool_use');

    if (!toolUseBlocks.length || data.stop_reason === 'end_turn') {
      const text = data.content
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((b: any) => b.type === 'text')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((b: any) => b.text as string)
        .join('');
      const stream = new ReadableStream({
        start(controller) {
          if (text) controller.enqueue(new TextEncoder().encode(text));
          controller.close();
        },
      });
      return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Append assistant turn + tool results and loop
    currentMessages = [
      ...currentMessages,
      { role: 'assistant', content: data.content },
      {
        role: 'user',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        content: toolUseBlocks.map((b: any) => ({
          type: 'tool_result',
          tool_use_id: b.id,
          content: [],
        })),
      },
    ];
  }

  return new Response('Web search exceeded max rounds', { status: 500 });
}

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) return new Response('Unauthorized', { status: 401 });

  const allowed = await checkRateLimit(session.user.email);
  if (!allowed) return new Response('Rate limit exceeded', { status: 429 });

  const { messages, model, systemPrompt, webSearch } = await req.json() as {
    messages: Message[];
    model: string;
    systemPrompt?: string;
    webSearch?: boolean;
  };

  const provider = getProvider(model);

  const apiKey =
    (provider === 'openai'    ? process.env.OPENAI_API_KEY               : undefined) ||
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY            : undefined) ||
    (provider === 'google'    ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);

  if (!apiKey) return new Response(`No API key for ${provider}`, { status: 401 });

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);

  // ── Google ───────────────────────────────────────────────────────────────
  if (provider === 'google') {
    const ai = new GoogleGenAI({ apiKey });
    let sdkStream: AsyncIterable<import('@google/genai').GenerateContentResponse>;
    try {
      sdkStream = await ai.models.generateContentStream({
        model,
        contents: toGeminiContents(messages),
        config: {
          ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
          ...(webSearch    ? { tools: [{ googleSearch: {} }] }  : {}),
        },
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

  // ── Anthropic with web search: multi-turn loop ───────────────────────────
  if (provider === 'anthropic' && webSearch) {
    return anthropicWebSearch(apiKey, messages, systemPrompt, model, signal);
  }

  // ── OpenAI with web search: Responses API ───────────────────────────────
  // Chat Completions only supports 'function'/'custom' tool types.
  // Web search requires the Responses API (/v1/responses) with a different SSE format.
  if (provider === 'openai' && webSearch) {
    const upstream = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        input: toOpenAIMessages(messages), // no system msg here — use instructions
        ...(systemPrompt ? { instructions: systemPrompt } : {}),
        tools: [{ type: 'web_search' }],
        stream: true,
      }),
      signal,
    });

    if (!upstream.ok) return new Response(await upstream.text(), { status: upstream.status });

    const stream = new ReadableStream({
      async start(controller) {
        const reader  = upstream.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer    = '';
        let curEvent  = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';

            for (const line of lines) {
              if (line.startsWith('event: '))      { curEvent = line.slice(7).trim(); continue; }
              if (line === '')                      { curEvent = ''; continue; }
              if (!line.startsWith('data: '))      continue;
              if (curEvent !== 'response.output_text.delta') continue;
              try {
                const parsed = JSON.parse(line.slice(6));
                if (parsed.delta) controller.enqueue(encoder.encode(parsed.delta));
              } catch { /* skip */ }
            }
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
      body: JSON.stringify({
        model,
        messages: toOpenAIMessages(messages, systemPrompt),
        stream: true,
      }),
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
