import { auth } from '@/auth';
import { query } from '@/lib/db';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE } from '@/lib/request';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    id: null,
    idValid: null,
    found: null,
    updatedAt: null,
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

    const { id } = await params;
    ctx.id = id;
    if (!/^[a-z0-9-]{8,80}$/i.test(id)) {
      ctx.status = 400;
      ctx.idValid = false;
      ctx.error = 'Invalid id';
      return jsonResponse({ error: 'Invalid id' }, { status: 400 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.idValid = true;

    const result = await query(
      'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE id = $1 AND user_email = $2 LIMIT 1',
      [id, session.user.email],
    );
    const row = result.rows[0];
    if (!row) {
      ctx.status = 404;
      ctx.found = false;
      ctx.error = 'Not found';
      return jsonResponse({ error: 'Not found' }, { status: 404 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    ctx.status = 200;
    ctx.found = true;
    ctx.updatedAt = row.updated_at;
    return jsonResponse(row, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('history.get', start, ctx);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    id: null,
    idValid: null,
    deletedRows: null,
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

    const { id } = await params;
    ctx.id = id;
    if (!/^[a-z0-9-]{8,80}$/i.test(id)) {
      ctx.status = 400;
      ctx.idValid = false;
      ctx.error = 'Invalid id';
      return jsonResponse({ error: 'Invalid id' }, { status: 400 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.idValid = true;

    const result = await query(
      'DELETE FROM chat_histories WHERE id = $1 AND user_email = $2',
      [id, session.user.email],
    );
    ctx.status = 204;
    ctx.deletedRows = result.rowCount ?? 0;
    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('history.delete', start, ctx);
  }
}
