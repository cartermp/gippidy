import { query } from './db';
import { DEFAULT_FONT_ID, parseStoredFontFamily, type FontId } from './fonts';
import { DEFAULT_MODEL_ID, isModelId, type ModelId } from './models';

type SettingsColumn = 'system_prompt' | 'save_history' | 'key_jwk' | 'girl_mode' | 'font_family' | 'model_id';

type SettingsRow = {
  system_prompt?: string;
  save_history?: boolean;
  key_jwk?: string | null;
  girl_mode?: boolean;
  font_family?: string | null;
  model_id?: string | null;
};

export type UserSettings = {
  systemPrompt: string;
  saveHistory: boolean;
  keyJwk: string | null;
  girlMode: boolean;
  font: FontId;
  customFontFamily: string;
  model: ModelId;
  legacySchema: boolean;
  hasFontColumn: boolean;
  hasModelColumn: boolean;
  newUser: boolean;
};

export type UserSettingsPatch = {
  systemPrompt: string | null;
  saveHistory: boolean | null;
  keyJwk: string | null;
  girlMode: boolean | null;
  fontFamily: string | null;
  model: ModelId | null;
};

const ALL_COLUMNS: readonly SettingsColumn[] = [
  'system_prompt',
  'save_history',
  'key_jwk',
  'girl_mode',
  'font_family',
  'model_id',
];

function isMissingColumn(error: unknown, column: string): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: string; message?: string };
  const message = candidate.message ?? String(error);
  return candidate.code === '42703' && message.includes(column);
}

function withoutColumn(columns: readonly SettingsColumn[], column: SettingsColumn): SettingsColumn[] {
  return columns.filter(candidate => candidate !== column);
}

function missingColumnFromError(error: unknown, columns: readonly SettingsColumn[]): SettingsColumn | null {
  return columns.find(column => isMissingColumn(error, column)) ?? null;
}

async function selectSettingsRow(
  email: string,
  columns: readonly SettingsColumn[] = ALL_COLUMNS,
): Promise<{ row?: SettingsRow; columns: Set<SettingsColumn> }> {
  try {
    const result = await query(`SELECT ${columns.join(', ')} FROM user_settings WHERE email = $1`, [email]);
    return { row: result.rows[0] as SettingsRow | undefined, columns: new Set(columns) };
  } catch (error) {
    const missingColumn = missingColumnFromError(error, columns);
    if (!missingColumn) throw error;
    return selectSettingsRow(email, withoutColumn(columns, missingColumn));
  }
}

function buildInsertValue(column: SettingsColumn, param: string): string {
  switch (column) {
    case 'system_prompt':
      return `COALESCE(${param}, '')`;
    case 'save_history':
    case 'girl_mode':
      return `COALESCE(${param}, FALSE)`;
    case 'font_family':
      return `COALESCE(${param}, '${DEFAULT_FONT_ID}')`;
    case 'model_id':
      return `COALESCE(${param}, '${DEFAULT_MODEL_ID}')`;
    case 'key_jwk':
      return param;
  }
}

function buildUpdateValue(column: SettingsColumn, param: string): string {
  return `${column} = COALESCE(${param}, user_settings.${column})`;
}

function getPatchValue(patch: UserSettingsPatch, column: SettingsColumn): unknown {
  switch (column) {
    case 'system_prompt':
      return patch.systemPrompt;
    case 'save_history':
      return patch.saveHistory;
    case 'key_jwk':
      return patch.keyJwk;
    case 'girl_mode':
      return patch.girlMode;
    case 'font_family':
      return patch.fontFamily;
    case 'model_id':
      return patch.model;
  }
}

function buildUpsertQuery(email: string, columns: readonly SettingsColumn[], patch: UserSettingsPatch) {
  const params: unknown[] = [email];
  const insertColumns = ['email', ...columns].join(', ');
  const insertValues = ['$1'];
  const updateValues: string[] = [];

  columns.forEach((column, index) => {
    const placeholder = `$${index + 2}`;
    params.push(getPatchValue(patch, column));
    insertValues.push(buildInsertValue(column, placeholder));
    updateValues.push(buildUpdateValue(column, placeholder));
  });

  return {
    sql: `INSERT INTO user_settings (${insertColumns})
          VALUES (${insertValues.join(', ')})
          ON CONFLICT (email) DO UPDATE SET
          ${updateValues.join(',\n          ')}`,
    params,
  };
}

async function runUpsert(
  email: string,
  patch: UserSettingsPatch,
  columns: readonly SettingsColumn[] = ALL_COLUMNS,
): Promise<{ columns: Set<SettingsColumn> }> {
  try {
  const { sql, params } = buildUpsertQuery(email, columns, patch);
  await query(sql, params);
    return { columns: new Set(columns) };
  } catch (error) {
    const missingColumn = missingColumnFromError(error, columns);
    if (!missingColumn) throw error;
    return runUpsert(email, patch, withoutColumn(columns, missingColumn));
  }
}

export async function getUserSettings(email: string): Promise<UserSettings> {
  const { row, columns } = await selectSettingsRow(email);
  const { font, customFontFamily } = parseStoredFontFamily(row?.font_family ?? null);

  return {
    systemPrompt: row?.system_prompt ?? '',
    saveHistory: row?.save_history ?? false,
    keyJwk: row?.key_jwk ?? null,
    girlMode: columns.has('girl_mode') ? (row?.girl_mode ?? false) : false,
    font,
    customFontFamily,
    model: isModelId(row?.model_id ?? '') ? (row?.model_id as ModelId) : DEFAULT_MODEL_ID,
    legacySchema: !columns.has('girl_mode'),
    hasFontColumn: columns.has('font_family'),
    hasModelColumn: columns.has('model_id'),
    newUser: !row,
  };
}

export async function upsertUserSettings(
  email: string,
  patch: UserSettingsPatch,
): Promise<{ legacySchema: boolean; hasFontColumn: boolean; hasModelColumn: boolean }> {
  const { columns } = await runUpsert(email, patch);
  return {
    legacySchema: !columns.has('girl_mode'),
    hasFontColumn: columns.has('font_family'),
    hasModelColumn: columns.has('model_id'),
  };
}
