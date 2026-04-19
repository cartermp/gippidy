import { auth } from '@/auth';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateClientEventRequest } from '@/lib/validation';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const requestBytes = readContentLength(req);
  let detailFields: Record<string, string | number | boolean | null> = {};
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    requestBytes,
    bodyBytes: null,
    clientEvent: null,
    clientLevel: null,
    detailCount: 0,
    error: null,
  };

  try {
    if (requestBytes !== null && requestBytes > LIMITS.clientEventBodyBytes) {
      ctx.status = 413;
      ctx.error = 'event too large';
      return jsonResponse({ error: 'event too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const session = await auth();
    if (!session?.user?.email) {
      ctx.status = 401;
      ctx.error = 'Unauthorized';
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.user = session.user.email;

    const body = await req.json();
    if (body && typeof body === 'object' && !Array.isArray(body)) {
      ctx.bodyBytes = JSON.stringify(body).length;
    }
    if (typeof ctx.bodyBytes === 'number' && ctx.bodyBytes > LIMITS.clientEventBodyBytes) {
      ctx.status = 413;
      ctx.error = 'event too large';
      return jsonResponse({ error: 'event too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const parsed = validateClientEventRequest(body);
    if (!parsed.ok) {
      ctx.status = parsed.status;
      ctx.error = parsed.error;
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    detailFields = parsed.value.details;
    ctx.status = 204;
    ctx.clientEvent = parsed.value.event;
    ctx.clientLevel = parsed.value.level;
    ctx.detailCount = Object.keys(detailFields).length;

    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('client.event', start, { ...ctx, ...detailFields });
  }
}
