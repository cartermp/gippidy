import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateShareRequest } from '@/lib/validation';

export async function POST(req: NextRequest) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, durationMs: Date.now() - start }, 'share.create.unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const contentLength = readContentLength(req);
    if (contentLength !== null && contentLength > LIMITS.shareBodyBytes) {
      logger.warn({ requestId, user: session.user.email, contentLength, durationMs: Date.now() - start }, 'share.create.too_large');
      return jsonResponse(
        { error: 'Chat too large to share. Try removing image attachments first.' },
        { status: 413 },
        { requestId, cacheControl: PRIVATE_NO_STORE },
      );
    }

    const body = await req.json();
    const bodyBytes = JSON.stringify(body).length;
    if (bodyBytes > LIMITS.shareBodyBytes) {
      logger.warn({ requestId, user: session.user.email, bodyBytes, durationMs: Date.now() - start }, 'share.create.too_large');
      return jsonResponse(
        { error: 'Chat too large to share. Try removing image attachments first.' },
        { status: 413 },
        { requestId, cacheControl: PRIVATE_NO_STORE },
      );
    }

    const parsed = validateShareRequest(body);
    if (!parsed.ok) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, error: parsed.error }, 'share.create.invalid');
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    let id = '';
    for (let attempt = 0; attempt < 3; attempt++) {
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
      logger.error({ requestId, user: session.user.email, durationMs: Date.now() - start }, 'share.create.collision');
      return jsonResponse({ error: 'Could not create share' }, { status: 503 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    logger.info({
      requestId,
      user: session.user.email,
      id,
      model: parsed.value.model,
      msgs: parsed.value.messages.length,
      bodyBytes,
      durationMs: Date.now() - start,
    }, 'share.create');
    return jsonResponse({ id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'share.create.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}
