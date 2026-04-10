import { NextRequest } from 'next/server';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, parseOpenAIChunk, parseAnthropicChunk, parseGeminiChunk, parseOpenAIResponsesChunk, type Message } from '@/lib/chat';
import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, PRIVATE_NO_STORE, readContentLength, textResponse } from '@/lib/request';
import { LIMITS, validateChatRequest } from '@/lib/validation';

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

function chatHeaders(requestId: string): HeadersInit {
  return {
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': PRIVATE_NO_STORE,
    'X-Request-Id': requestId,
  };
}

function getUpstreamRequestId(response: Response): string | null {
  return response.headers.get('anthropic-request-id')
    ?? response.headers.get('x-request-id')
    ?? response.headers.get('request-id');
}

function summarizeMessages(messages: Message[]) {
  let promptChars = 0;
  let imageCount = 0;
  let pdfCount = 0;

  for (const message of messages) {
    promptChars += message.content.length;
    imageCount += message.images?.length ?? 0;
    pdfCount += message.pdfs?.length ?? 0;
  }

  return { promptChars, imageCount, pdfCount };
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
  requestId: string,
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

    if (!res.ok) return textResponse(await res.text(), { status: res.status }, { requestId, cacheControl: PRIVATE_NO_STORE });

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
      return new Response(stream, { headers: chatHeaders(requestId) });
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

  return textResponse('Web search exceeded max rounds', { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
}

export async function POST(req: NextRequest) {
  const t = Date.now();
  const requestId = getRequestId(req);
  const ctx: Record<string, string | number | boolean | null> = { requestId };

  try {
    const authStart = Date.now();
    const session = await auth();
    ctx.authMs = Date.now() - authStart;
    if (!session?.user?.email) {
      ctx.status = 401; ctx.error = 'unauthenticated';
      return textResponse('Unauthorized', { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.user = session.user.email;

    const contentLength = readContentLength(req);
    if (contentLength !== null) ctx.requestBytes = contentLength;
    if (contentLength !== null && contentLength > LIMITS.chatBodyBytes) {
      ctx.status = 413; ctx.error = 'request_too_large';
      return textResponse('Request too large', { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const rateLimitStart = Date.now();
    const allowed = await checkRateLimit(session.user.email);
    ctx.rateLimitMs = Date.now() - rateLimitStart;
    if (!allowed) {
      ctx.status = 429;
      return textResponse('Rate limit exceeded', { status: 429 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const parsed = validateChatRequest(await req.json());
    if (!parsed.ok) {
      ctx.status = parsed.status;
      ctx.error = parsed.error;
      return textResponse(parsed.error, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const { messages, model, systemPrompt, webSearch } = parsed.value;

  const provider = getProvider(model);
  ctx.model = model;
  ctx.provider = provider;
  ctx.msgs = messages.length;
  ctx.systemPromptChars = systemPrompt?.length ?? 0;
  if (webSearch) ctx.webSearch = true;
  const summary = summarizeMessages(messages);
  ctx.promptChars = summary.promptChars;
  ctx.images = summary.imageCount;
  ctx.pdfs = summary.pdfCount;

  const apiKey =
    (provider === 'openai'    ? process.env.OPENAI_API_KEY               : undefined) ||
    (provider === 'anthropic' ? process.env.ANTHROPIC_API_KEY            : undefined) ||
    (provider === 'google'    ? process.env.GOOGLE_GENERATIVE_AI_API_KEY : undefined);

  if (!apiKey) {
    ctx.status = 401; ctx.error = `no_api_key`;
    return textResponse(`No API key for ${provider}`, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }

  const timeoutSignal = AbortSignal.timeout(TIMEOUT_MS);
  const signal = AbortSignal.any([req.signal, timeoutSignal]);

  // ── Google ───────────────────────────────────────────────────────────────
  if (provider === 'google') {
    const upstreamStartedAt = Date.now();
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
      ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
      return textResponse(await upstream.text(), { status: upstream.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    ctx.status = 200;
    ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
    ctx.upstreamStatus = upstream.status;
    const upstreamRequestId = getUpstreamRequestId(upstream);
    if (upstreamRequestId) ctx.upstreamRequestId = upstreamRequestId;
    const stream = new ReadableStream({
      async start(controller) {
        const reader  = upstream.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer    = '';
        let firstByteMs: number | null = null;
        let outputChars = 0;
        let streamError: string | null = null;
        let shouldClose = true;
        const streamStartedAt = Date.now();
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
              if (!text) continue;
              if (firstByteMs === null) firstByteMs = Date.now() - t;
              outputChars += text.length;
              controller.enqueue(encoder.encode(text));
            }
          }
        } catch (error) {
          shouldClose = false;
          streamError = String(error).slice(0, 200);
          controller.error(error);
        } finally {
          if (shouldClose) controller.close();
          const fields = {
            ...ctx,
            firstByteMs,
            streamDurationMs: Date.now() - streamStartedAt,
            outputChars,
            clientAborted: req.signal.aborted,
            timedOut: timeoutSignal.aborted,
            streamError,
          };
          if (streamError && !req.signal.aborted && !timeoutSignal.aborted) logger.error(fields, 'chat.stream');
          else if (req.signal.aborted || timeoutSignal.aborted) logger.warn(fields, 'chat.stream');
          else logger.info(fields, 'chat.stream');
        }
      },
    });

    return new Response(stream, { headers: chatHeaders(requestId) });
  }

  // ── Anthropic with web search: multi-turn loop ───────────────────────────
  if (provider === 'anthropic' && webSearch) {
    const res = await anthropicWebSearch(apiKey, messages, systemPrompt, model, signal, requestId);
    ctx.status = res.status;
    return res;
  }

  // ── OpenAI with web search: Responses API ───────────────────────────────
  // Chat Completions only supports 'function'/'custom' tool types.
  // Web search requires the Responses API (/v1/responses) with a different SSE format.
  if (provider === 'openai' && webSearch) {
    const upstreamStartedAt = Date.now();
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
      ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
      return textResponse(await upstream.text(), { status: upstream.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    ctx.status = 200;
    ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
    ctx.upstreamStatus = upstream.status;
    const upstreamRequestId = getUpstreamRequestId(upstream);
    if (upstreamRequestId) ctx.upstreamRequestId = upstreamRequestId;
    const stream = new ReadableStream({
      async start(controller) {
        const reader  = upstream.body!.getReader();
        const decoder = new TextDecoder();
        const encoder = new TextEncoder();
        let buffer    = '';
        let curEvent  = '';
        let firstByteMs: number | null = null;
        let outputChars = 0;
        let streamError: string | null = null;
        let shouldClose = true;
        const streamStartedAt = Date.now();

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
              if (!out) continue;
              if (firstByteMs === null) firstByteMs = Date.now() - t;
              outputChars += out.replace(/\0/g, '').length;
              controller.enqueue(encoder.encode(out));
            }
          }
        } catch (error) {
          shouldClose = false;
          streamError = String(error).slice(0, 200);
          controller.error(error);
        } finally {
          if (shouldClose) controller.close();
          const fields = {
            ...ctx,
            firstByteMs,
            streamDurationMs: Date.now() - streamStartedAt,
            outputChars,
            clientAborted: req.signal.aborted,
            timedOut: timeoutSignal.aborted,
            streamError,
          };
          if (streamError && !req.signal.aborted && !timeoutSignal.aborted) logger.error(fields, 'chat.stream');
          else if (req.signal.aborted || timeoutSignal.aborted) logger.warn(fields, 'chat.stream');
          else logger.info(fields, 'chat.stream');
        }
      },
    });

    return new Response(stream, { headers: chatHeaders(requestId) });
  }

  // ── OpenAI / Anthropic: SSE ──────────────────────────────────────────────
  let upstream: Response;
  const upstreamStartedAt = Date.now();

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
    ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
    return textResponse(body, { status: upstream.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }

  ctx.status = 200;
  ctx.upstreamConnectMs = Date.now() - upstreamStartedAt;
  ctx.upstreamStatus = upstream.status;
  const upstreamRequestId = getUpstreamRequestId(upstream);
  if (upstreamRequestId) ctx.upstreamRequestId = upstreamRequestId;
  const stream = new ReadableStream({
    async start(controller) {
      const reader  = upstream.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();
      let buffer    = '';
      let firstByteMs: number | null = null;
      let outputChars = 0;
      let streamError: string | null = null;
      let shouldClose = true;
      const streamStartedAt = Date.now();

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
            if (!text) continue;
            if (firstByteMs === null) firstByteMs = Date.now() - t;
            outputChars += text.length;
            controller.enqueue(encoder.encode(text));
          }
        }
      } catch (error) {
        shouldClose = false;
        streamError = String(error).slice(0, 200);
        controller.error(error);
      } finally {
        if (shouldClose) controller.close();
        const fields = {
          ...ctx,
          firstByteMs,
          streamDurationMs: Date.now() - streamStartedAt,
          outputChars,
          clientAborted: req.signal.aborted,
          timedOut: timeoutSignal.aborted,
          streamError,
        };
        if (streamError && !req.signal.aborted && !timeoutSignal.aborted) logger.error(fields, 'chat.stream');
        else if (req.signal.aborted || timeoutSignal.aborted) logger.warn(fields, 'chat.stream');
        else logger.info(fields, 'chat.stream');
      }
    },
  });

  return new Response(stream, { headers: chatHeaders(requestId) });

  } catch (err) {
    ctx.status = 500;
    ctx.error = String(err).slice(0, 120);
    return textResponse('Internal Server Error', { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    const fields = { ...ctx, ms: Date.now() - t };
    const status = ctx.status as number | undefined;
    if (!status || status >= 500)   logger.error(fields, 'chat');
    else if (status >= 400)         logger.warn(fields, 'chat');
    else                            logger.info(fields, 'chat');
  }
}
