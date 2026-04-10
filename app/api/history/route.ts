import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateHistorySaveRequest } from '@/lib/validation';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, durationMs: Date.now() - start }, 'history.list.unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const result = await query(
      'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 50',
      [session.user.email],
    );
    const rows = result.rows;
    logger.info({
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      rows: rows.length,
      newestAt: rows[0]?.updated_at ?? null,
      oldestAt: rows[rows.length - 1]?.updated_at ?? null,
    }, 'history.list');
    return jsonResponse(rows, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'history.list.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, durationMs: Date.now() - start }, 'history.save.unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const contentLength = readContentLength(req);
    if (contentLength !== null && contentLength > LIMITS.historyBodyBytes) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, contentLength }, 'history.save.too_large');
      return jsonResponse({ error: 'Request too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const parsed = validateHistorySaveRequest(await req.json());
    if (!parsed.ok) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, error: parsed.error }, 'history.save.invalid');
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const ciphertextBytes = Math.round((parsed.value.ciphertext.length ?? 0) * 0.75);

    if (parsed.value.id) {
      const upd = await query(
        'UPDATE chat_histories SET iv = $1, ciphertext = $2, updated_at = now() WHERE id = $3 AND user_email = $4',
        [parsed.value.iv, parsed.value.ciphertext, parsed.value.id, session.user.email],
      );
      if ((upd.rowCount ?? 0) > 0) {
        logger.info({
          requestId,
          user: session.user.email,
          id: parsed.value.id,
          op: 'update',
          durationMs: Date.now() - start,
          ciphertextBytes,
        }, 'history.save');
        return jsonResponse({ id: parsed.value.id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
      }
    }

    const result = await query(
      `INSERT INTO chat_histories (id, user_email, iv, ciphertext)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       RETURNING id`,
      [session.user.email, parsed.value.iv, parsed.value.ciphertext],
    );
    logger.info({
      requestId,
      user: session.user.email,
      id: result.rows[0].id,
      op: 'insert',
      durationMs: Date.now() - start,
      ciphertextBytes,
    }, 'history.save');
    return jsonResponse({ id: result.rows[0].id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'history.save.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}
