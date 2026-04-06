import { query } from '@/lib/db';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await query(
    'SELECT id, model, system_prompt, messages, created_at FROM shared_chats WHERE id = $1',
    [id],
  );
  if (result.rows.length === 0) return new Response('Not found', { status: 404 });
  return Response.json(result.rows[0]);
}
