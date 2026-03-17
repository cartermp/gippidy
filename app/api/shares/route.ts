import { NextRequest } from 'next/server';
import { auth } from '@/auth';
import { query } from '@/lib/db';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.email) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  if (JSON.stringify(body).length > 500_000) {
    return Response.json(
      { error: 'Chat too large to share. Try removing image attachments first.' },
      { status: 413 },
    );
  }
  const { messages, model, systemPrompt } = body;
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 8);

  await query(
    'INSERT INTO shared_chats (id, created_by, model, system_prompt, messages) VALUES ($1, $2, $3, $4, $5)',
    [id, session.user.email, model, systemPrompt || null, JSON.stringify(messages)],
  );

  return Response.json({ id });
}
