import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse } from '@/lib/request';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    await query('SELECT 1');
    logger.info({ requestId, durationMs: Date.now() - start, ok: true }, 'health.check');
    return jsonResponse({ ok: true }, {}, { requestId, cacheControl: 'no-store' });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, ok: false, error: String(error).slice(0, 200) }, 'health.check');
    return jsonResponse({ ok: false, error: 'database unavailable' }, { status: 503 }, { requestId, cacheControl: 'no-store' });
  }
}
