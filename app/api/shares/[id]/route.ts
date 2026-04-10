import logger from '@/lib/log';
import { textResponse, getRequestId } from '@/lib/request';
import { getSharedChat } from '@/lib/share';
import { isShareId } from '@/lib/validation';

const SHARE_CACHE = 'public, max-age=300, stale-while-revalidate=3600';

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const { id } = await params;
    if (!isShareId(id)) {
      logger.warn({ requestId, id, durationMs: Date.now() - start }, 'share.get.invalid');
      return textResponse('Not found', { status: 404 }, { requestId, cacheControl: SHARE_CACHE });
    }

    const share = await getSharedChat(id);
    logger.info({ requestId, id, found: !!share, durationMs: Date.now() - start }, 'share.get');
    if (!share) return textResponse('Not found', { status: 404 }, { requestId, cacheControl: SHARE_CACHE });
    return textResponse(JSON.stringify(share), {
      status: 200,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    }, {
      requestId,
      cacheControl: SHARE_CACHE,
    });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'share.get.failed');
    return textResponse('Internal Server Error', { status: 500 }, { requestId, cacheControl: SHARE_CACHE });
  }
}
