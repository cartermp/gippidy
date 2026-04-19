import { auth } from '@/auth';
import { query } from '@/lib/db';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateHistorySaveRequest } from '@/lib/validation';

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function getFieldType(value: unknown): string | null {
  if (value === undefined) return null;
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    rows: null,
    topId: null,
    topUpdatedAt: null,
    newestAt: null,
    oldestAt: null,
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

    const result = await query(
      'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 50',
      [session.user.email],
    );
    const rows = result.rows;
    ctx.status = 200;
    ctx.rows = rows.length;
    ctx.topId = rows[0]?.id ?? null;
    ctx.topUpdatedAt = rows[0]?.updated_at ?? null;
    ctx.newestAt = rows[0]?.updated_at ?? null;
    ctx.oldestAt = rows[rows.length - 1]?.updated_at ?? null;
    return jsonResponse(rows, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('history.list', start, ctx);
  }
}

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const requestBytes = readContentLength(req);
  const ctx: Record<string, string | number | boolean | null> = {
    requestId,
    user: null,
    status: null,
    requestBytes,
    hasIdField: false,
    idFieldType: null,
    requestedId: null,
    savedId: null,
    requestedOp: null,
    resolvedOp: null,
    ciphertextChars: null,
    ciphertextBytes: null,
    ivChars: null,
    updated: null,
    inserted: null,
    updateRows: null,
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

    const contentLength = requestBytes;
    if (contentLength !== null && contentLength > LIMITS.historyBodyBytes) {
      ctx.status = 413;
      ctx.error = 'Request too large';
      return jsonResponse({ error: 'Request too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const body = await req.json();
    if (isPlainObject(body)) {
      ctx.hasIdField = hasOwn(body, 'id');
      ctx.idFieldType = getFieldType(body.id);
      ctx.requestedId = typeof body.id === 'string' ? body.id : null;
      ctx.requestedOp = hasOwn(body, 'id') ? 'update' : 'insert';
      ctx.ivChars = typeof body.iv === 'string' ? body.iv.length : null;
      ctx.ciphertextChars = typeof body.ciphertext === 'string' ? body.ciphertext.length : null;
      ctx.ciphertextBytes = typeof body.ciphertext === 'string'
        ? Math.round((body.ciphertext.length ?? 0) * 0.75)
        : null;
    }

    const parsed = validateHistorySaveRequest(body);
    if (!parsed.ok) {
      ctx.status = parsed.status;
      ctx.error = parsed.error;
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const ciphertextBytes = Math.round((parsed.value.ciphertext.length ?? 0) * 0.75);
    ctx.requestedId = parsed.value.id ?? null;
    ctx.requestedOp = parsed.value.id ? 'update' : 'insert';
    ctx.ivChars = parsed.value.iv.length;
    ctx.ciphertextChars = parsed.value.ciphertext.length;
    ctx.ciphertextBytes = ciphertextBytes;

    if (parsed.value.id) {
      const upd = await query(
        'UPDATE chat_histories SET iv = $1, ciphertext = $2, updated_at = now() WHERE id = $3 AND user_email = $4',
        [parsed.value.iv, parsed.value.ciphertext, parsed.value.id, session.user.email],
      );
      ctx.updateRows = upd.rowCount ?? 0;
      if ((upd.rowCount ?? 0) > 0) {
        ctx.status = 200;
        ctx.savedId = parsed.value.id;
        ctx.resolvedOp = 'update';
        ctx.updated = true;
        ctx.inserted = false;
        return jsonResponse({ id: parsed.value.id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
      }
      ctx.updated = false;
    }

    const result = await query(
      `INSERT INTO chat_histories (id, user_email, iv, ciphertext)
       VALUES (gen_random_uuid()::text, $1, $2, $3)
       RETURNING id`,
      [session.user.email, parsed.value.iv, parsed.value.ciphertext],
    );
    ctx.status = 200;
    ctx.savedId = result.rows[0].id;
    ctx.resolvedOp = 'insert';
    ctx.inserted = true;
    return jsonResponse({ id: result.rows[0].id }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('history.save', start, ctx);
  }
}
