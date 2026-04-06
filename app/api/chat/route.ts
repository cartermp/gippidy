import { NextRequest } from 'next/server';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, parseOpenAIChunk, parseAnthropicChunk, parseGeminiChunk, parseOpenAIResponsesChunk, type Message } from '@/lib/chat';
import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export const runtime = 'nodejs';

const RATE_LIMIT     = 20;
const RATE_WINDOW_MS = 60_000;
const TIMEOUT_MS     = 60_000;
const MAX_MESSAGES   = 200;

import { ALLOWED_MODELS } from '@/lib/models';

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
          const enc = new TextEncoder();
          controller.enqueue(enc.encode('\0')); // signal: search done, generating
          if (text) controller.enqueue(enc.encode(text));
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
  const t = Date.now();
  const ctx: Record<string, string | number | boolean> = {};

  try {

  const session = await auth();
  if (!session?.user?.email) {
    ctx.status = 401; ctx.error = 'unauthenticated';
    return new Response('Unauthorized', { status: 401 });
  }
  ctx.user = session.user.email;

  const allowed = await checkRateLimit(session.user.email);
  if (!allowed) {
    ctx.status = 429;
    return new Response('Rate limit exceeded', { status: 429 });
  }

  const body = await req.json() as {
    messages: Message[];
    model: string;
    systemPrompt?: string;
    webSearch?: boolean;
  };
  const { messages, model, systemPrompt, webSearch } = body;

  if (!Array.isArray(messages) || messages.length === 0) {
    ctx.status = 400; ctx.error = 'invalid_messages';
    return new Response('Invalid messages', { status: 400 });
  }
  if (messages.length > MAX_MESSAGES) {
    ctx.status = 400; ctx.error = 'too_many_messages';
    return new Response(`Too many messages (max ${MAX_MESSAGES})`, { status: 400 });
  }
  if (!ALLOWED_MODELS.has(model)) {
    ctx.status = 400; ctx.error = 'invalid_model';
    return new Response(`Unknown model: ${model}`, { status: 400 });
  }

  const provider = getProvider(model);
  ctx.model = model;
  ctx.provider = provider;
  ctx.msgs = messages.length;
  if (webSearch) ctx.webSearch = true;

  const apiKey =
    (provider === 'openai'    ? process.env.OPENAI_API_KEY               : undefined) ||
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY            : undefined) ||
    (provider === 'google'    ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);

  if (!apiKey) {
    ctx.status = 401; ctx.error = `no_api_key`;
    return new Response(`No API key for ${provider}`, { status: 401 });
  }

  const signal = AbortSignal.any([req.signal, AbortSignal.timeout(TIMEOUT_MS)]);

  // ── Google ───────────────────────────────────────────────────────────────
  if (provider === 'google') {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: toGeminiContents(messages),
          ...(systemPrompt ? { systemInstruction: { parts: [{ text: systemPrompt }] } } : {}),
          ...(webSearch    ? { tools: [{ googleSearch: {} }] } : {}),
        }),
        signal,
      },
    );

    if (!upstream.ok) {
      ctx.status = upstream.status; ctx.error = 'upstream_error';
      return new Response(await upstream.text(), { status: upstream.status });
    }

    ctx.status = 200;
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
              if (!data) continue;
              const text = parseGeminiChunk(data);
              if (text) controller.enqueue(encoder.encode(text));
            }
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
    const res = await anthropicWebSearch(apiKey, messages, systemPrompt, model, signal);
    ctx.status = res.status;
    return res;
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

    if (!upstream.ok) {
      ctx.status = upstream.status; ctx.error = 'upstream_error';
      return new Response(await upstream.text(), { status: upstream.status });
    }

    ctx.status = 200;
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
              const out = parseOpenAIResponsesChunk(curEvent, line.slice(6));
              if (out) controller.enqueue(encoder.encode(out));
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
    ctx.status = upstream.status; ctx.error = 'upstream_error';
    return new Response(body, { status: upstream.status });
  }

  ctx.status = 200;
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

            const text = provider === 'openai'
              ? parseOpenAIChunk(data)
              : parseAnthropicChunk(data);
            if (text) controller.enqueue(encoder.encode(text));
          }
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });

  } catch (err) {
    ctx.status = 500;
    ctx.error = String(err).slice(0, 120);
    throw err;
  } finally {
    const fields = { ...ctx, ms: Date.now() - t };
    const status = ctx.status as number | undefined;
    if (!status || status >= 500)   logger.error(fields, 'chat');
    else if (status >= 400)         logger.warn(fields, 'chat');
    else                            logger.info(fields, 'chat');
  }
}
