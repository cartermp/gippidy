import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ route: 'history.delete' }, 'unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  await query(
    'DELETE FROM chat_histories WHERE id = $1 AND user_email = $2',
    [id, session.user.email],
  );
  logger.info({ user: session.user.email, id }, 'history.delete');
  return new Response(null, { status: 204 });
}
