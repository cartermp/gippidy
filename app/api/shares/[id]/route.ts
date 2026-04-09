import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = Date.now();
  const { id } = await params;
  const result = await query(
    'SELECT id, model, system_prompt, messages, created_at FROM shared_chats WHERE id = $1',
    [id],
  );
  const found = result.rows.length > 0;
  logger.info({ id, found, durationMs: Date.now() - start }, 'share.get');
  if (!found) return new Response('Not found', { status: 404 });
  return Response.json(result.rows[0]);
}
