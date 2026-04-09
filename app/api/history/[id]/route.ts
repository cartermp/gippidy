import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ durationMs: Date.now() - start }, 'history.delete.unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const result = await query(
    'DELETE FROM chat_histories WHERE id = $1 AND user_email = $2',
    [id, session.user.email],
  );
  logger.info({ user: session.user.email, id, durationMs: Date.now() - start, deleted: result.rowCount ?? 0 }, 'history.delete');
  return new Response(null, { status: 204 });
}
