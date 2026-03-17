import { auth } from '@/auth';
import { query } from '@/lib/db';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const result = await query(
    'SELECT system_prompt, save_history FROM user_settings WHERE email = $1',
    [session.user.email],
  );
  return Response.json({
    systemPrompt: result.rows[0]?.system_prompt ?? '',
    saveHistory:  result.rows[0]?.save_history  ?? false,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { systemPrompt, saveHistory } = await req.json();
  await query(
    `INSERT INTO user_settings (email, system_prompt, save_history) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO UPDATE SET
       system_prompt = EXCLUDED.system_prompt,
       save_history  = EXCLUDED.save_history`,
    [session.user.email, systemPrompt ?? '', saveHistory ?? false],
  );
  return new Response(null, { status: 204 });
}
