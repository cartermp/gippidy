import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateSettingsRequest } from '@/lib/validation';

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, route: 'settings.get', durationMs: Date.now() - start }, 'unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const result = await query(
      'SELECT system_prompt, save_history, key_jwk, girl_mode FROM user_settings WHERE email = $1',
      [session.user.email],
    );
    const row = result.rows[0];
    logger.info({
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      hasKey: !!row?.key_jwk,
      saveHistory: row?.save_history ?? false,
      girlMode: row?.girl_mode ?? false,
      newUser: !row,
    }, 'settings.get');
    return jsonResponse({
      systemPrompt: row?.system_prompt ?? '',
      saveHistory: row?.save_history ?? false,
      girlMode: row?.girl_mode ?? false,
      keyJwk: row?.key_jwk ?? null,
    }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'settings.get.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}

export async function PUT(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, route: 'settings.put', durationMs: Date.now() - start }, 'unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const contentLength = readContentLength(req);
    if (contentLength !== null && contentLength > LIMITS.settingsBodyBytes) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, contentLength }, 'settings.put.too_large');
      return jsonResponse({ error: 'Request too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const parsed = validateSettingsRequest(await req.json());
    if (!parsed.ok) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, error: parsed.error }, 'settings.put.invalid');
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    await query(
      `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk, girl_mode) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (email) DO UPDATE SET
          system_prompt = EXCLUDED.system_prompt,
          save_history  = EXCLUDED.save_history,
          key_jwk       = COALESCE(EXCLUDED.key_jwk, user_settings.key_jwk),
          girl_mode     = EXCLUDED.girl_mode`,
      [session.user.email, parsed.value.systemPrompt, parsed.value.saveHistory, parsed.value.keyJwk, parsed.value.girlMode],
    );
    logger.info({
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      saveHistory: parsed.value.saveHistory,
      girlMode: parsed.value.girlMode,
      hasKey: !!parsed.value.keyJwk,
    }, 'settings.put');
    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    logger.error({ requestId, durationMs: Date.now() - start, error: String(error).slice(0, 200) }, 'settings.put.failed');
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  }
}
