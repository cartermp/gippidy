import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { query } from '@/lib/db';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateShareRequest } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const requestBytes = readContentLength(req);
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    requestBytes,
    bodyBytes: null,
    model: null,
    msgs: null,
    hasSystemPrompt: null,
    shareId: null,
    insertAttempts: 0,
    error: null,
  };

  try {
    const session = await auth();
    if (!session?.user?.email) {
      ctx.status = 401;
      ctx.error = 'Unauthorized';
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.user = session.user.email;

    if (requestBytes !== null && requestBytes > LIMITS.shareBodyBytes) {
      ctx.status = 413;
      ctx.error = 'Request too large';
      return jsonResponse(
        { error: 'Chat too large to share. Try removing image attachments first.' },
        { status: 413 },
        { requestId, cacheControl: PRIVATE_NO_STORE },
      );
    }

    const body = await req.json();
    const bodyBytes = JSON.stringify(body).length;
    ctx.bodyBytes = bodyBytes;
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      ctx.model = typeof body.model === 'string' ? body.model : null;
      ctx.msgs = Array.isArray(body.messages) ? body.messages.length : null;
      ctx.hasSystemPrompt = typeof body.systemPrompt === 'string' ? body.systemPrompt.length > 0 : null;
    }
    if (bodyBytes > LIMITS.shareBodyBytes) {
      ctx.status = 413;
      ctx.error = 'Request too large';
      return jsonResponse(
        { error: 'Chat too large to share. Try removing image attachments first.' },
        { status: 413 },
        { requestId, cacheControl: PRIVATE_NO_STORE },
      );
    }

    const parsed = validateShareRequest(body);
    if (!parsed.ok) {
      ctx.status = parsed.status;
      ctx.error = parsed.error;
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.model = parsed.value.model;
    ctx.msgs = parsed.value.messages.length;
    ctx.hasSystemPrompt = Boolean(parsed.value.systemPrompt);

    let id = '';
    for (let attempt = 0; attempt < 3; attempt++) {
      ctx.insertAttempts = attempt + 1;
      id = crypto.randomUUID().replace(/-/g, '');
      const result = await query(
        `INSERT INTO shared_chats (id, created_by, model, system_prompt, messages)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT DO NOTHING`,
        [id, session.user.email, parsed.value.model, parsed.value.systemPrompt || null, JSON.stringify(parsed.value.messages)],
      );
      if ((result.rowCount ?? 0) > 0) break;
      id = '';
    }

    if (!id) {
      ctx.status = 503;
      ctx.error = 'Could not create share';
      return jsonResponse({ error: 'Could not create share' }, { status: 503 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    ctx.status = 200;
    ctx.shareId = id;
    return jsonResponse({ id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('share.create', start, ctx);
  }
}
