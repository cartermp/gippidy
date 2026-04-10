import { auth } from '@/auth';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE } from '@/lib/request';
import { LIMITS, validateClientEventRequest } from '@/lib/validation';

export async function POST(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const contentLength = Number(req.headers.get('content-length') ?? 0);
    if (contentLength > LIMITS.clientEventBodyBytes) {
      return jsonResponse({ error: 'event too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const session = await auth();
    if (!session?.user?.email) {
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const parsed = validateClientEventRequest(await req.json());
    if (!parsed.ok) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, error: parsed.error }, 'client.event.invalid');
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const fields = {
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      ...parsed.value.details,
    };
    if (parsed.value.level === 'info') logger.info(fields, parsed.value.event);
    else if (parsed.value.level === 'warn') logger.warn(fields, parsed.value.event);
    else logger.error(fields, parsed.value.event);

    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'client.event.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}
