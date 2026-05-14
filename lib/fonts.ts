export const CUSTOM_FONT_ID = 'custom' as const;

export const FONTS = [
  { id: 'courier-new', label: 'Courier New', family: "'Courier New', Courier, monospace" },
  { id: 'menlo', label: 'Menlo', family: "Menlo, Monaco, 'Courier New', monospace" },
  { id: 'consolas', label: 'Consolas', family: "Consolas, 'Liberation Mono', 'Courier New', monospace" },
  { id: 'monaco', label: 'Monaco', family: "Monaco, Menlo, 'Courier New', monospace" },
  { id: 'jetbrains-mono', label: 'JetBrains Mono', family: "var(--font-jetbrains-mono), 'Courier New', monospace" },
  { id: 'ibm-plex-mono', label: 'IBM Plex Mono', family: "var(--font-ibm-plex-mono), 'Courier New', monospace" },
] as const;

export type BuiltInFontId = (typeof FONTS)[number]['id'];
export type FontId = BuiltInFontId | typeof CUSTOM_FONT_ID;

export const DEFAULT_FONT_ID: BuiltInFontId = FONTS[0].id;
export const DEFAULT_FONT_FAMILY = FONTS[0].family;
export const ALLOWED_FONTS = new Set<FontId>([...FONTS.map(font => font.id), CUSTOM_FONT_ID]);

export function isFontId(value: string): value is FontId {
  return ALLOWED_FONTS.has(value as FontId);
}

export function isBuiltInFontId(value: string): value is BuiltInFontId {
  return FONTS.some(candidate => candidate.id === value);
}

export function normalizeCustomFontFamily(value: string | null | undefined): string {
  return (value ?? '')
    .replace(/[{};]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export function getFontFamily(fontId: string | null | undefined, customFontFamily?: string | null): string {
  if (fontId === CUSTOM_FONT_ID) {
    const custom = normalizeCustomFontFamily(customFontFamily);
    return custom ? `${custom}, monospace` : DEFAULT_FONT_FAMILY;
  }
  const font = FONTS.find(candidate => candidate.id === fontId);
  return font?.family ?? DEFAULT_FONT_FAMILY;
}

export function parseStoredFontFamily(value: string | null | undefined): { font: FontId; customFontFamily: string } {
  const normalized = normalizeCustomFontFamily(value);
  if (!normalized) return { font: DEFAULT_FONT_ID, customFontFamily: '' };
  if (isBuiltInFontId(normalized)) return { font: normalized, customFontFamily: '' };
  return { font: CUSTOM_FONT_ID, customFontFamily: normalized };
}

export function getStoredFontFamily(font: FontId, customFontFamily?: string | null): string {
  if (font === CUSTOM_FONT_ID) {
    return normalizeCustomFontFamily(customFontFamily) || DEFAULT_FONT_ID;
  }
  return isBuiltInFontId(font) ? font : DEFAULT_FONT_ID;
}
