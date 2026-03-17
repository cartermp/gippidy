import { auth } from '@/auth';
import { query } from '@/lib/db';

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await query(
    'DELETE FROM chat_histories WHERE id = $1 AND user_email = $2',
    [id, session.user.email],
  );
  return new Response(null, { status: 204 });
}
