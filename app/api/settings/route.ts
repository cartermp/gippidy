import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';

export async function GET() {
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ route: 'settings.get' }, 'unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const result = await query(
    'SELECT system_prompt, save_history, key_jwk FROM user_settings WHERE email = $1',
    [session.user.email],
  );
  return Response.json({
    systemPrompt: result.rows[0]?.system_prompt ?? '',
    saveHistory:  result.rows[0]?.save_history  ?? false,
    keyJwk:       result.rows[0]?.key_jwk       ?? null,
  });
}

export async function PUT(req: Request) {
  const session = await auth();
  if (!session?.user?.email) {
    logger.warn({ route: 'settings.put' }, 'unauthenticated');
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { systemPrompt, saveHistory, keyJwk } = await req.json();
  await query(
    `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO UPDATE SET
       system_prompt = EXCLUDED.system_prompt,
       save_history  = EXCLUDED.save_history,
       key_jwk       = COALESCE(EXCLUDED.key_jwk, user_settings.key_jwk)`,
    [session.user.email, systemPrompt ?? '', saveHistory ?? false, keyJwk ?? null],
  );
  logger.info({ user: session.user.email, saveHistory: saveHistory ?? false }, 'settings.put');
  return new Response(null, { status: 204 });
}
