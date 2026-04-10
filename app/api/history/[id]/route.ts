import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE } from '@/lib/request';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, durationMs: Date.now() - start }, 'history.delete.unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const { id } = await params;
    if (!/^[a-z0-9-]{8,80}$/i.test(id)) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start }, 'history.delete.invalid');
      return jsonResponse({ error: 'Invalid id' }, { status: 400 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const result = await query(
      'DELETE FROM chat_histories WHERE id = $1 AND user_email = $2',
      [id, session.user.email],
    );
    logger.info({
      requestId,
      user: session.user.email,
      id,
      durationMs: Date.now() - start,
      deleted: result.rowCount ?? 0,
    }, 'history.delete');
    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'history.delete.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}
