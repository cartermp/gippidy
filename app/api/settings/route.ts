import { auth } from '@/auth';
import { getStoredFontFamily } from '@/lib/fonts';
import { logRouteOutcome, type LogFields } from '@/lib/log';
import type { ModelId } from '@/lib/models';
import { getRequestId, jsonResponse, PRIVATE_NO_STORE, readContentLength } from '@/lib/request';
import { getUserSettings, upsertUserSettings } from '@/lib/user-settings';
import { LIMITS, validateSettingsRequest } from '@/lib/validation';

type SettingsPatch = {
  systemPrompt: string | null;
  saveHistory: boolean | null;
  girlMode: boolean | null;
  fontFamily: string | null;
  model: ModelId | null;
  keyJwk: string | null;
};

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
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
    model: null,
    hasFontColumn: null,
    hasModelColumn: null,
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

    const settings = await getUserSettings(session.user.email);
    ctx.status = 200;
    ctx.hasKey = !!settings.keyJwk;
    ctx.saveHistory = settings.saveHistory;
    ctx.girlMode = settings.legacySchema ? null : settings.girlMode;
    ctx.font = settings.font;
    ctx.model = settings.model;
    ctx.hasFontColumn = settings.hasFontColumn;
    ctx.hasModelColumn = settings.hasModelColumn;
    ctx.legacySchema = settings.legacySchema;
    ctx.newUser = settings.newUser;
    return jsonResponse({
      systemPrompt: settings.systemPrompt,
      saveHistory: settings.saveHistory,
      font: settings.font,
      customFontFamily: settings.customFontFamily,
      model: settings.model,
      ...(settings.legacySchema ? {} : { girlMode: settings.girlMode }),
      keyJwk: settings.keyJwk,
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
    hasModelField: null,
    hasKeyJwkField: null,
    systemPromptChars: null,
    keyJwkChars: null,
    saveHistory: null,
    girlMode: null,
    font: null,
    model: null,
    hasKey: null,
    hasFontColumn: null,
    hasModelColumn: null,
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
      ctx.hasModelField = hasOwn(body, 'model');
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
      fontFamily: hasOwn(input, 'font') || hasOwn(input, 'customFontFamily')
        ? getStoredFontFamily(parsed.value.font, parsed.value.customFontFamily)
        : null,
      model: hasOwn(input, 'model') ? parsed.value.model : null,
      keyJwk: hasOwn(input, 'keyJwk') ? parsed.value.keyJwk : null,
    };

    ctx.systemPromptChars = patch.systemPrompt === null ? ctx.systemPromptChars : patch.systemPrompt.length;
    ctx.keyJwkChars = patch.keyJwk === null ? ctx.keyJwkChars : patch.keyJwk.length;
    ctx.saveHistory = patch.saveHistory;
    ctx.girlMode = patch.girlMode;
    ctx.font = patch.fontFamily;
    ctx.model = patch.model;
    ctx.hasKey = patch.keyJwk === null ? null : patch.keyJwk.length > 0;

    const { legacySchema, hasFontColumn, hasModelColumn } = await upsertUserSettings(session.user.email, patch);
    ctx.status = 204;
    ctx.girlMode = legacySchema ? null : patch.girlMode;
    ctx.font = hasFontColumn ? patch.fontFamily : null;
    ctx.hasFontColumn = hasFontColumn;
    ctx.model = hasModelColumn ? patch.model : null;
    ctx.hasModelColumn = hasModelColumn;
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
