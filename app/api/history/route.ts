import { auth } from '@/auth';
import { query } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC',
    [session.user.email],
  );
  return Response.json(result.rows);
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id, iv, ciphertext } = await req.json();

  if (id) {
    await query(
      'UPDATE chat_histories SET iv = $1, ciphertext = $2, updated_at = now() WHERE id = $3 AND user_email = $4',
      [iv, ciphertext, id, session.user.email],
    );
    return Response.json({ id });
  }

  const result = await query(
    `INSERT INTO chat_histories (id, user_email, iv, ciphertext)
     VALUES (gen_random_uuid()::text, $1, $2, $3)
     RETURNING id`,
    [session.user.email, iv, ciphertext],
  );
  return Response.json({ id: result.rows[0].id });
}
