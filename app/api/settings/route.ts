import { auth } from '@/auth';
import { query } from '@/lib/db';
import logger from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateSettingsRequest } from '@/lib/validation';

type SettingsRow = {
  system_prompt: string;
  save_history: boolean;
  key_jwk: string | null;
  girl_mode?: boolean;
};

type SettingsPatch = {
  systemPrompt: string | null;
  saveHistory: boolean | null;
  girlMode: boolean | null;
  keyJwk: string | null;
};

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isMissingGirlModeColumn(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? String(error);
  return candidate.code === '42703' && message.includes('girl_mode');
}

async function getSettingsRow(email: string, requestId: string): Promise<{ row?: SettingsRow; legacySchema: boolean }> {
  try {
    const result = await query(
      'SELECT system_prompt, save_history, key_jwk, girl_mode FROM user_settings WHERE email = $1',
      [email],
    );
    return { row: result.rows[0] as SettingsRow | undefined, legacySchema: false };
  } catch (error) {
    if (!isMissingGirlModeColumn(error)) throw error;
    logger.warn({ requestId, user: email }, 'settings.get.legacy_schema');
    const result = await query(
      'SELECT system_prompt, save_history, key_jwk FROM user_settings WHERE email = $1',
      [email],
    );
    return { row: result.rows[0] as SettingsRow | undefined, legacySchema: true };
  }
}

async function upsertSettingsRow(email: string, patch: SettingsPatch, requestId: string): Promise<{ legacySchema: boolean }> {
  try {
    await query(
      `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk, girl_mode)
       VALUES ($1, COALESCE($2, ''), COALESCE($3, FALSE), $4, COALESCE($5, FALSE))
       ON CONFLICT (email) DO UPDATE SET
          system_prompt = COALESCE($2, user_settings.system_prompt),
          save_history  = COALESCE($3, user_settings.save_history),
          key_jwk       = COALESCE($4, user_settings.key_jwk),
          girl_mode     = COALESCE($5, user_settings.girl_mode)`,
      [email, patch.systemPrompt, patch.saveHistory, patch.keyJwk, patch.girlMode],
    );
    return { legacySchema: false };
  } catch (error) {
    if (!isMissingGirlModeColumn(error)) throw error;
    logger.warn({ requestId, user: email }, 'settings.put.legacy_schema');
    await query(
      `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk)
       VALUES ($1, COALESCE($2, ''), COALESCE($3, FALSE), $4)
       ON CONFLICT (email) DO UPDATE SET
          system_prompt = COALESCE($2, user_settings.system_prompt),
          save_history  = COALESCE($3, user_settings.save_history),
          key_jwk       = COALESCE($4, user_settings.key_jwk)`,
      [email, patch.systemPrompt, patch.saveHistory, patch.keyJwk],
    );
    return { legacySchema: true };
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();

  try {
    const session = await auth();
    if (!session?.user?.email) {
      logger.warn({ requestId, route: 'settings.get', durationMs: Date.now() - start }, 'unauthenticated');
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const { row, legacySchema } = await getSettingsRow(session.user.email, requestId);
    logger.info({
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      hasKey: !!row?.key_jwk,
      saveHistory: row?.save_history ?? false,
      girlMode: legacySchema ? null : (row?.girl_mode ?? false),
      legacySchema,
      newUser: !row,
    }, 'settings.get');
    return jsonResponse({
      systemPrompt: row?.system_prompt ?? '',
      saveHistory: row?.save_history ?? false,
      ...(legacySchema ? {} : { girlMode: row?.girl_mode ?? false }),
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

    const body = await req.json();
    const parsed = validateSettingsRequest(body);
    if (!parsed.ok) {
      logger.warn({ requestId, user: session.user.email, durationMs: Date.now() - start, error: parsed.error }, 'settings.put.invalid');
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const input = body as Record<string, unknown>;
    const patch: SettingsPatch = {
      systemPrompt: hasOwn(input, 'systemPrompt') ? parsed.value.systemPrompt : null,
      saveHistory: hasOwn(input, 'saveHistory') ? parsed.value.saveHistory : null,
      girlMode: hasOwn(input, 'girlMode') ? parsed.value.girlMode : null,
      keyJwk: hasOwn(input, 'keyJwk') ? parsed.value.keyJwk : null,
    };

    const { legacySchema } = await upsertSettingsRow(session.user.email, patch, requestId);
    logger.info({
      requestId,
      user: session.user.email,
      durationMs: Date.now() - start,
      saveHistory: patch.saveHistory,
      girlMode: legacySchema ? null : patch.girlMode,
      hasKey: !!patch.keyJwk,
      legacySchema,
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
