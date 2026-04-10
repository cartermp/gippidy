import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function POST(req: NextRequest) {
  const start = Date.now();
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ durationMs: Date.now() - start }, 'share.create.unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const bodyBytes = JSON.stringify(body).length;
  if (bodyBytes > 500_000) {
    logger.warn({ user: session.user.email, bodyBytes, durationMs: Date.now() - start }, 'share.create.too_large');
    return Response.json(
      { error: 'Chat too large to share. Try removing image attachments first.' },
      { status: 413 },
    );
  }
  const { messages, model, systemPrompt } = body;
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: 'messages must be a non-empty array' }, { status: 400 });
  }
  if (typeof model !== 'string' || !model) {
    return Response.json({ error: 'model is required' }, { status: 400 });
  }
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);

  await query(
    'INSERT INTO shared_chats (id, created_by, model, system_prompt, messages) VALUES ($1, $2, $3, $4, $5)',
    [id, session.user.email, model, typeof systemPrompt === 'string' ? systemPrompt || null : null, JSON.stringify(messages)],
  );

  logger.info({ user: session.user.email, id, model, msgs: messages.length, bodyBytes, durationMs: Date.now() - start }, 'share.create');
  return Response.json({ id });
}
