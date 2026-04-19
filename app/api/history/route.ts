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

function isMissingHistoryTitleColumns(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? String(error);
  return candidate.code === '42703' && (message.includes('title_iv') || message.includes('title_ciphertext'));
}

type HistorySaveValue = {
  id?: string;
  iv: string;
  ciphertext: string;
  titleIv?: string;
  titleCiphertext?: string;
};

async function listHistoryRows(email: string, titleOnly: boolean) {
  if (!titleOnly) {
    const result = await query(
      'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 50',
      [email],
    );
    return { rows: result.rows, legacySchema: false };
  }

  try {
    const result = await query(
      `SELECT id, updated_at, title_iv, title_ciphertext,
              CASE WHEN title_ciphertext IS NULL THEN iv ELSE NULL END AS iv,
              CASE WHEN title_ciphertext IS NULL THEN ciphertext ELSE NULL END AS ciphertext
         FROM chat_histories
        WHERE user_email = $1
        ORDER BY updated_at DESC
        LIMIT 50`,
      [email],
    );
    return { rows: result.rows, legacySchema: false };
  } catch (error) {
    if (!isMissingHistoryTitleColumns(error)) throw error;
    const result = await query(
      'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 50',
      [email],
    );
    return { rows: result.rows, legacySchema: true };
  }
}

async function updateHistoryRow(email: string, value: HistorySaveValue, withTitleFields: boolean) {
  if (withTitleFields && value.id && value.titleIv && value.titleCiphertext) {
    return query(
      `UPDATE chat_histories
          SET iv = $1, ciphertext = $2, title_iv = $3, title_ciphertext = $4, updated_at = now()
        WHERE id = $5 AND user_email = $6`,
      [value.iv, value.ciphertext, value.titleIv, value.titleCiphertext, value.id, email],
    );
  }
  if (!value.id) throw new Error('history update requires id');
  return query(
    'UPDATE chat_histories SET iv = $1, ciphertext = $2, updated_at = now() WHERE id = $3 AND user_email = $4',
    [value.iv, value.ciphertext, value.id, email],
  );
}

async function insertHistoryRow(email: string, value: HistorySaveValue, withTitleFields: boolean) {
  if (withTitleFields && value.titleIv && value.titleCiphertext) {
    return query(
      `INSERT INTO chat_histories (id, user_email, iv, ciphertext, title_iv, title_ciphertext)
       VALUES (gen_random_uuid()::text, $1, $2, $3, $4, $5)
       RETURNING id`,
      [email, value.iv, value.ciphertext, value.titleIv, value.titleCiphertext],
    );
  }
  return query(
    `INSERT INTO chat_histories (id, user_email, iv, ciphertext)
     VALUES (gen_random_uuid()::text, $1, $2, $3)
     RETURNING id`,
    [email, value.iv, value.ciphertext],
  );
}

async function saveHistoryRow(email: string, value: HistorySaveValue) {
  const withTitleFields = typeof value.titleIv === 'string' && typeof value.titleCiphertext === 'string';

  const attempt = async (allowTitleFields: boolean) => {
    let updateRows = 0;
    if (value.id) {
      const upd = await updateHistoryRow(email, value, allowTitleFields);
      updateRows = upd.rowCount ?? 0;
      if (updateRows > 0) {
        return {
          savedId: value.id,
          resolvedOp: 'update' as const,
          updated: true,
          inserted: false,
          updateRows,
        };
      }
    }

    const result = await insertHistoryRow(email, value, allowTitleFields);
    return {
      savedId: result.rows[0].id as string,
      resolvedOp: 'insert' as const,
      updated: false,
      inserted: true,
      updateRows,
    };
  };

  if (!withTitleFields) return { ...(await attempt(false)), legacySchema: false };
  try {
    return { ...(await attempt(true)), legacySchema: false };
  } catch (error) {
    if (!isMissingHistoryTitleColumns(error)) throw error;
    return { ...(await attempt(false)), legacySchema: true };
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const titleOnly = new URL(req.url).searchParams.get('titles') === '1';
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    titleOnly,
    legacySchema: null,
    rows: null,
    splitTitleRows: null,
    legacyPayloadRows: null,
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

    const { rows, legacySchema } = await listHistoryRows(session.user.email, titleOnly);
    ctx.status = 200;
    ctx.legacySchema = legacySchema;
    ctx.rows = rows.length;
    if (titleOnly) {
      ctx.splitTitleRows = rows.filter(row => typeof row.title_ciphertext === 'string' && row.title_ciphertext.length > 0).length;
      ctx.legacyPayloadRows = rows.filter(row => typeof row.title_ciphertext !== 'string' || row.title_ciphertext.length === 0).length;
    }
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
    hasTitleFields: false,
    ciphertextChars: null,
    ciphertextBytes: null,
    ivChars: null,
    titleIvChars: null,
    titleCiphertextChars: null,
    titleCiphertextBytes: null,
    legacySchema: null,
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
      ctx.hasTitleFields = hasOwn(body, 'titleIv') || hasOwn(body, 'titleCiphertext');
      ctx.titleIvChars = typeof body.titleIv === 'string' ? body.titleIv.length : null;
      ctx.titleCiphertextChars = typeof body.titleCiphertext === 'string' ? body.titleCiphertext.length : null;
      ctx.titleCiphertextBytes = typeof body.titleCiphertext === 'string'
        ? Math.round((body.titleCiphertext.length ?? 0) * 0.75)
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
    ctx.hasTitleFields = typeof parsed.value.titleIv === 'string' && typeof parsed.value.titleCiphertext === 'string';
    ctx.titleIvChars = parsed.value.titleIv?.length ?? null;
    ctx.titleCiphertextChars = parsed.value.titleCiphertext?.length ?? null;
    ctx.titleCiphertextBytes = typeof parsed.value.titleCiphertext === 'string'
      ? Math.round((parsed.value.titleCiphertext.length ?? 0) * 0.75)
      : null;

    const result = await saveHistoryRow(session.user.email, parsed.value);
    ctx.status = 200;
    ctx.savedId = result.savedId;
    ctx.resolvedOp = result.resolvedOp;
    ctx.legacySchema = result.legacySchema;
    ctx.inserted = result.inserted;
    ctx.updated = result.updated;
    ctx.updateRows = result.updateRows;
    return jsonResponse({ id: result.savedId }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('history.save', start, ctx);
  }
}
