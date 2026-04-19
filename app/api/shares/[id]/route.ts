import { logRouteOutcome, type LogFields } from '@/lib/log';
import { textResponse, getRequestId } from '@/lib/request';
import { getSharedChat } from '@/lib/share';
import { isShareId } from '@/lib/validation';

const SHARE_CACHE = 'public, max-age=300, stale-while-revalidate=3600';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    status: null,
    id: null,
    idValid: null,
    found: null,
    model: null,
    msgs: null,
    error: null,
  };

  try {
    const { id } = await params;
    ctx.id = id;
    if (!isShareId(id)) {
      ctx.status = 404;
      ctx.idValid = false;
      ctx.error = 'Not found';
      return textResponse('Not found', { status: 404 }, { requestId, cacheControl: SHARE_CACHE });
    }
    ctx.idValid = true;

    const share = await getSharedChat(id);
    ctx.found = !!share;
    if (!share) {
      ctx.status = 404;
      ctx.error = 'Not found';
      return textResponse('Not found', { status: 404 }, { requestId, cacheControl: SHARE_CACHE });
    }
    ctx.status = 200;
    ctx.model = share.model;
    ctx.msgs = share.messages.length;
    return textResponse(JSON.stringify(share), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }, {
      requestId,
      cacheControl: SHARE_CACHE,
    });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return textResponse('Internal Server Error', { status: 500 }, { requestId, cacheControl: SHARE_CACHE });
  } finally {
    logRouteOutcome('share.get', start, ctx);
  }
}
