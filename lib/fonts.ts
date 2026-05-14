export const FONTS = [
  { id: 'courier-new', label: 'Courier New', family: "'Courier New', Courier, monospace" },
  { id: 'menlo', label: 'Menlo', family: "Menlo, Monaco, 'Courier New', monospace" },
  { id: 'consolas', label: 'Consolas', family: "Consolas, 'Liberation Mono', 'Courier New', monospace" },
  { id: 'monaco', label: 'Monaco', family: "Monaco, Menlo, 'Courier New', monospace" },
] as const;

export type FontId = (typeof FONTS)[number]['id'];

export const DEFAULT_FONT_ID: FontId = FONTS[0].id;
export const DEFAULT_FONT_FAMILY = FONTS[0].family;
export const ALLOWED_FONTS = new Set<string>(FONTS.map(font => font.id));

export function isFontId(value: string): value is FontId {
  return ALLOWED_FONTS.has(value);
}

export function getFontFamily(fontId: string | null | undefined): string {
  const font = FONTS.find(candidate => candidate.id === fontId);
  return font?.family ?? DEFAULT_FONT_FAMILY;
}
