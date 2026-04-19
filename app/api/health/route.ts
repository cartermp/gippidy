import { query } from '@/lib/db';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse } from '@/lib/request';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    status: null,
    ok: null,
    error: null,
  };

  try {
    await query('SELECT 1');
    ctx.status = 200;
    ctx.ok = true;
    return jsonResponse({ ok: true }, {}, { requestId, cacheControl: 'no-store' });
  } catch (error) {
    ctx.status = 503;
    ctx.ok = false;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ ok: false, error: 'database unavailable' }, { status: 503 }, { requestId, cacheControl: 'no-store' });
  } finally {
    logRouteOutcome('health.check', start, ctx);
  }
}
