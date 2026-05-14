import { auth } from '@/auth';
import { query } from '@/lib/db';
import { DEFAULT_FONT_ID, isFontId, type FontId } from '@/lib/fonts';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { LIMITS, validateSettingsRequest } from '@/lib/validation';

type SettingsRow = {
  system_prompt: string;
  save_history: boolean;
  key_jwk: string | null;
  girl_mode?: boolean;
  font_family?: string | null;
};

type SettingsPatch = {
  systemPrompt: string | null;
  saveHistory: boolean | null;
  girlMode: boolean | null;
  font: FontId | null;
  keyJwk: string | null;
};

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? String(error);
  return candidate.code === '42703' && message.includes(column);
}

async function getSettingsRow(email: string): Promise<{ row?: SettingsRow; legacySchema: boolean; hasFontColumn: boolean }> {
  try {
    const result = await query(
      'SELECT system_prompt, save_history, key_jwk, girl_mode, font_family FROM user_settings WHERE email = $1',
      [email],
    );
    return { row: result.rows[0] as SettingsRow | undefined, legacySchema: false, hasFontColumn: true };
  } catch (error) {
    if (isMissingColumn(error, 'font_family')) {
      try {
        const result = await query(
          'SELECT system_prompt, save_history, key_jwk, girl_mode FROM user_settings WHERE email = $1',
          [email],
        );
        return { row: result.rows[0] as SettingsRow | undefined, legacySchema: false, hasFontColumn: false };
      } catch (fallbackError) {
        if (!isMissingColumn(fallbackError, 'girl_mode')) throw fallbackError;
        const result = await query(
          'SELECT system_prompt, save_history, key_jwk FROM user_settings WHERE email = $1',
          [email],
        );
        return { row: result.rows[0] as SettingsRow | undefined, legacySchema: true, hasFontColumn: false };
      }
    }
    if (!isMissingColumn(error, 'girl_mode')) throw error;
    const result = await query(
      'SELECT system_prompt, save_history, key_jwk FROM user_settings WHERE email = $1',
      [email],
    );
    return { row: result.rows[0] as SettingsRow | undefined, legacySchema: true, hasFontColumn: false };
  }
}

async function upsertSettingsRow(email: string, patch: SettingsPatch): Promise<{ legacySchema: boolean; hasFontColumn: boolean }> {
  try {
    await query(
      `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk, girl_mode, font_family)
       VALUES ($1, COALESCE($2, ''), COALESCE($3, FALSE), $4, COALESCE($5, FALSE), COALESCE($6, '${DEFAULT_FONT_ID}'))
       ON CONFLICT (email) DO UPDATE SET
          system_prompt = COALESCE($2, user_settings.system_prompt),
          save_history  = COALESCE($3, user_settings.save_history),
          key_jwk       = COALESCE($4, user_settings.key_jwk),
          girl_mode     = COALESCE($5, user_settings.girl_mode),
          font_family   = COALESCE($6, user_settings.font_family)`,
      [email, patch.systemPrompt, patch.saveHistory, patch.keyJwk, patch.girlMode, patch.font],
    );
    return { legacySchema: false, hasFontColumn: true };
  } catch (error) {
    if (isMissingColumn(error, 'font_family')) {
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
        return { legacySchema: false, hasFontColumn: false };
      } catch (fallbackError) {
        if (!isMissingColumn(fallbackError, 'girl_mode')) throw fallbackError;
        await query(
          `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk)
           VALUES ($1, COALESCE($2, ''), COALESCE($3, FALSE), $4)
           ON CONFLICT (email) DO UPDATE SET
              system_prompt = COALESCE($2, user_settings.system_prompt),
              save_history  = COALESCE($3, user_settings.save_history),
              key_jwk       = COALESCE($4, user_settings.key_jwk)`,
          [email, patch.systemPrompt, patch.saveHistory, patch.keyJwk],
        );
        return { legacySchema: true, hasFontColumn: false };
      }
    }
    if (!isMissingColumn(error, 'girl_mode')) throw error;
    await query(
      `INSERT INTO user_settings (email, system_prompt, save_history, key_jwk)
       VALUES ($1, COALESCE($2, ''), COALESCE($3, FALSE), $4)
       ON CONFLICT (email) DO UPDATE SET
          system_prompt = COALESCE($2, user_settings.system_prompt),
          save_history  = COALESCE($3, user_settings.save_history),
          key_jwk       = COALESCE($4, user_settings.key_jwk)`,
      [email, patch.systemPrompt, patch.saveHistory, patch.keyJwk],
    );
    return { legacySchema: true, hasFontColumn: false };
  }
}

export async function GET(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    hasKey: null,
    saveHistory: null,
    girlMode: null,
    font: null,
    hasFontColumn: null,
    legacySchema: null,
    newUser: null,
    error: null,
  };

  try {
    const session = await auth();
    if (!session?.user?.email) {
      ctx.status = 401;
      ctx.error = 'Unauthorized';
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.user = session.user.email;

    const { row, legacySchema, hasFontColumn } = await getSettingsRow(session.user.email);
    const savedFont = row?.font_family ?? null;
    const font = savedFont && isFontId(savedFont) ? savedFont : DEFAULT_FONT_ID;
    ctx.status = 200;
    ctx.hasKey = !!row?.key_jwk;
    ctx.saveHistory = row?.save_history ?? false;
    ctx.girlMode = legacySchema ? null : (row?.girl_mode ?? false);
    ctx.font = font;
    ctx.hasFontColumn = hasFontColumn;
    ctx.legacySchema = legacySchema;
    ctx.newUser = !row;
    return jsonResponse({
      systemPrompt: row?.system_prompt ?? '',
      saveHistory: row?.save_history ?? false,
      font,
      ...(legacySchema ? {} : { girlMode: row?.girl_mode ?? false }),
      keyJwk: row?.key_jwk ?? null,
    }, {}, { requestId, cacheControl: PRIVATE_NO_STORE });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('settings.get', start, ctx);
  }
}

export async function PUT(req: Request) {
  const requestId = getRequestId(req);
  const start = Date.now();
  const requestBytes = readContentLength(req);
  const ctx: LogFields = {
    requestId,
    user: null,
    status: null,
    requestBytes,
    bodyBytes: null,
    hasSystemPromptField: null,
    hasSaveHistoryField: null,
    hasGirlModeField: null,
    hasFontField: null,
    hasKeyJwkField: null,
    systemPromptChars: null,
    keyJwkChars: null,
    saveHistory: null,
    girlMode: null,
    font: null,
    hasKey: null,
    hasFontColumn: null,
    legacySchema: null,
    error: null,
  };

  try {
    const session = await auth();
    if (!session?.user?.email) {
      ctx.status = 401;
      ctx.error = 'Unauthorized';
      return jsonResponse({ error: 'Unauthorized' }, { status: 401 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }
    ctx.user = session.user.email;

    if (requestBytes !== null && requestBytes > LIMITS.settingsBodyBytes) {
      ctx.status = 413;
      ctx.error = 'Request too large';
      return jsonResponse({ error: 'Request too large' }, { status: 413 }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const body = await req.json();
    if (isPlainObject(body)) {
      ctx.bodyBytes = JSON.stringify(body).length;
      ctx.hasSystemPromptField = hasOwn(body, 'systemPrompt');
      ctx.hasSaveHistoryField = hasOwn(body, 'saveHistory');
      ctx.hasGirlModeField = hasOwn(body, 'girlMode');
      ctx.hasFontField = hasOwn(body, 'font');
      ctx.hasKeyJwkField = hasOwn(body, 'keyJwk');
      ctx.systemPromptChars = typeof body.systemPrompt === 'string' ? body.systemPrompt.length : null;
      ctx.keyJwkChars = typeof body.keyJwk === 'string' ? body.keyJwk.length : null;
    }
    const parsed = validateSettingsRequest(body);
    if (!parsed.ok) {
      ctx.status = parsed.status;
      ctx.error = parsed.error;
      return jsonResponse({ error: parsed.error }, { status: parsed.status }, { requestId, cacheControl: PRIVATE_NO_STORE });
    }

    const input = body as Record<string, unknown>;
    const patch: SettingsPatch = {
      systemPrompt: hasOwn(input, 'systemPrompt') ? parsed.value.systemPrompt : null,
      saveHistory: hasOwn(input, 'saveHistory') ? parsed.value.saveHistory : null,
      girlMode: hasOwn(input, 'girlMode') ? parsed.value.girlMode : null,
      font: hasOwn(input, 'font') ? parsed.value.font : null,
      keyJwk: hasOwn(input, 'keyJwk') ? parsed.value.keyJwk : null,
    };

    ctx.systemPromptChars = patch.systemPrompt === null ? ctx.systemPromptChars : patch.systemPrompt.length;
    ctx.keyJwkChars = patch.keyJwk === null ? ctx.keyJwkChars : patch.keyJwk.length;
    ctx.saveHistory = patch.saveHistory;
    ctx.girlMode = patch.girlMode;
    ctx.font = patch.font;
    ctx.hasKey = patch.keyJwk === null ? null : patch.keyJwk.length > 0;

    const { legacySchema, hasFontColumn } = await upsertSettingsRow(session.user.email, patch);
    ctx.status = 204;
    ctx.girlMode = legacySchema ? null : patch.girlMode;
    ctx.font = hasFontColumn ? patch.font : null;
    ctx.hasFontColumn = hasFontColumn;
    ctx.legacySchema = legacySchema;
    return new Response(null, {
      status: 204,
      headers: { 'X-Request-Id': requestId, 'Cache-Control': PRIVATE_NO_STORE },
    });
  } catch (error) {
    ctx.status = 500;
    ctx.error = String(error).slice(0, 200);
    return jsonResponse({ error: 'Internal Server Error' }, { status: 500 }, { requestId, cacheControl: PRIVATE_NO_STORE });
  } finally {
    logRouteOutcome('settings.put', start, ctx);
  }
}
