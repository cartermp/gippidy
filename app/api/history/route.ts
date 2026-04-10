import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function GET() {
  const start = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ durationMs: Date.now() - start }, 'history.list.unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await query(
    'SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE user_email = $1 ORDER BY updated_at DESC LIMIT 50',
    [session.user.email],
  );
  const rows = result.rows;
  const newestAt = rows[0]?.updated_at ?? null;
  const oldestAt = rows[rows.length - 1]?.updated_at ?? null;
  logger.info({
    user: session.user.email,
    durationMs: Date.now() - start,
    rows: rows.length,
    newestAt,
    oldestAt,
  }, 'history.list');
  return Response.json(rows);
}

export async function POST(req: Request) {
  const start = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ durationMs: Date.now() - start }, 'history.save.unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id, iv, ciphertext } = await req.json();
  const ciphertextBytes = Math.round((ciphertext?.length ?? 0) * 0.75);

  if (id) {
    const upd = await query(
      'UPDATE chat_histories SET iv = $1, ciphertext = $2, updated_at = now() WHERE id = $3 AND user_email = $4',
      [iv, ciphertext, id, session.user.email],
    );
    if ((upd.rowCount ?? 0) > 0) {
      logger.info({ user: session.user.email, id, op: 'update', durationMs: Date.now() - start, ciphertextBytes }, 'history.save');
      return Response.json({ id });
    }
    // Row was deleted externally — fall through to INSERT so the save is not lost
  }

  const result = await query(
    `INSERT INTO chat_histories (id, user_email, iv, ciphertext)
     VALUES (gen_random_uuid()::text, $1, $2, $3)
     RETURNING id`,
    [session.user.email, iv, ciphertext],
  );
  logger.info({ user: session.user.email, id: result.rows[0].id, op: 'insert', durationMs: Date.now() - start, ciphertextBytes }, 'history.save');
  return Response.json({ id: result.rows[0].id });
}
