import type { Image, Message, Pdf, Role } from './chat';
import { ALLOWED_MODELS } from './models';

type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: string; status: number };

type CleanMessage = Omit<Message, 'html'>;
type ClientEventLevel = 'info' | 'warn' | 'error';

export const LIMITS = {
  chatBodyBytes: 6_000_000,
  shareBodyBytes: 500_000,
  settingsBodyBytes: 20_000,
  historyBodyBytes: 6_000_000,
  clientEventBodyBytes: 8_000,
  maxMessages: 200,
  maxMessageChars: 120_000,
  maxImagesPerMessage: 8,
  maxPdfsPerMessage: 4,
  maxImageBytes: 5_000_000,
  maxPdfBytes: 15_000_000,
  maxTextFileBytes: 500_000,
  maxPdfNameChars: 200,
  maxSystemPromptChars: 20_000,
  maxJwkChars: 8_000,
  maxIvChars: 256,
  maxCiphertextBytes: 6_000_000,
  maxClientEventNameChars: 80,
  maxClientEventDetails: 20,
  maxClientEventValueChars: 160,
} as const;

function fail<T>(error: string, status = 400): ValidationResult<T> {
  return { ok: false, error, status };
}

function ok<T>(value: T): ValidationResult<T> {
  return { ok: true, value };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function bytesFromBase64(data: string): number {
  return Math.floor((data.length * 3) / 4);
}

function isRole(value: unknown): value is Role {
  return value === 'user' || value === 'assistant';
}

function validateImage(input: unknown): ValidationResult<Image> {
  if (!isPlainObject(input)) return fail('invalid image');
  if (typeof input.data !== 'string' || !input.data) return fail('invalid image data');
  if (typeof input.mimeType !== 'string' || !/^image\/[a-z0-9.+-]+$/i.test(input.mimeType)) {
    return fail('invalid image mime type');
  }
  if (bytesFromBase64(input.data) > LIMITS.maxImageBytes) return fail('image too large', 413);
  return ok({ data: input.data, mimeType: input.mimeType });
}

function validatePdf(input: unknown): ValidationResult<Pdf> {
  if (!isPlainObject(input)) return fail('invalid pdf');
  if (typeof input.name !== 'string' || input.name.length === 0 || input.name.length > LIMITS.maxPdfNameChars) {
    return fail('invalid pdf name');
  }
  if (typeof input.data !== 'string' || !input.data) return fail('invalid pdf data');
  if (bytesFromBase64(input.data) > LIMITS.maxPdfBytes) return fail('pdf too large', 413);
  return ok({ name: input.name, data: input.data });
}

export function validateMessages(input: unknown): ValidationResult<CleanMessage[]> {
  if (!Array.isArray(input) || input.length === 0) return fail('messages must be a non-empty array');
  if (input.length > LIMITS.maxMessages) return fail(`too many messages (max ${LIMITS.maxMessages})`);

  const messages: CleanMessage[] = [];
  for (const raw of input) {
    if (!isPlainObject(raw)) return fail('invalid message');
    if (!isRole(raw.role)) return fail('invalid message role');
    if (typeof raw.content !== 'string') return fail('invalid message content');
    if (raw.content.length > LIMITS.maxMessageChars) return fail('message too large', 413);

    const msg: CleanMessage = { role: raw.role, content: raw.content };

    if (raw.images !== undefined) {
      if (!Array.isArray(raw.images)) return fail('invalid images');
      if (raw.images.length > LIMITS.maxImagesPerMessage) return fail('too many images', 413);
      const images: Image[] = [];
      for (const image of raw.images) {
        const result = validateImage(image);
        if (!result.ok) return result;
        images.push(result.value);
      }
      if (images.length) msg.images = images;
    }

    if (raw.pdfs !== undefined) {
      if (!Array.isArray(raw.pdfs)) return fail('invalid pdfs');
      if (raw.pdfs.length > LIMITS.maxPdfsPerMessage) return fail('too many pdfs', 413);
      const pdfs: Pdf[] = [];
      for (const pdf of raw.pdfs) {
        const result = validatePdf(pdf);
        if (!result.ok) return result;
        pdfs.push(result.value);
      }
      if (pdfs.length) msg.pdfs = pdfs;
    }

    messages.push(msg);
  }

  return ok(messages);
}

export function validateChatRequest(input: unknown): ValidationResult<{
  messages: CleanMessage[];
  model: string;
  systemPrompt?: string;
  webSearch: boolean;
}> {
  if (!isPlainObject(input)) return fail('invalid request body');
  const messages = validateMessages(input.messages);
  if (!messages.ok) return messages;
  if (typeof input.model !== 'string' || !ALLOWED_MODELS.has(input.model)) return fail('unknown model');
  if (input.systemPrompt !== undefined && typeof input.systemPrompt !== 'string') return fail('invalid systemPrompt');
  if (typeof input.systemPrompt === 'string' && input.systemPrompt.length > LIMITS.maxSystemPromptChars) {
    return fail('systemPrompt too large', 413);
  }
  if (input.webSearch !== undefined && typeof input.webSearch !== 'boolean') return fail('invalid webSearch');
  return ok({
    messages: messages.value,
    model: input.model,
    ...(typeof input.systemPrompt === 'string' ? { systemPrompt: input.systemPrompt } : {}),
    webSearch: input.webSearch ?? false,
  });
}

export function validateShareRequest(input: unknown): ValidationResult<{
  messages: CleanMessage[];
  model: string;
  systemPrompt: string;
}> {
  if (!isPlainObject(input)) return fail('invalid request body');
  const messages = validateMessages(input.messages);
  if (!messages.ok) return messages;
  if (typeof input.model !== 'string' || !ALLOWED_MODELS.has(input.model)) return fail('unknown model');
  if (input.systemPrompt !== undefined && typeof input.systemPrompt !== 'string') return fail('invalid systemPrompt');
  if (typeof input.systemPrompt === 'string' && input.systemPrompt.length > LIMITS.maxSystemPromptChars) {
    return fail('systemPrompt too large', 413);
  }
  return ok({
    messages: messages.value,
    model: input.model,
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : '',
  });
}

export function validateSettingsRequest(input: unknown): ValidationResult<{
  systemPrompt: string;
  saveHistory: boolean;
  girlMode: boolean;
  keyJwk: string | null;
}> {
  if (!isPlainObject(input)) return fail('invalid request body');
  if (input.systemPrompt !== undefined && typeof input.systemPrompt !== 'string') return fail('invalid systemPrompt');
  if (typeof input.systemPrompt === 'string' && input.systemPrompt.length > LIMITS.maxSystemPromptChars) {
    return fail('systemPrompt too large', 413);
  }
  if (input.saveHistory !== undefined && typeof input.saveHistory !== 'boolean') return fail('invalid saveHistory');
  if (input.girlMode !== undefined && typeof input.girlMode !== 'boolean') return fail('invalid girlMode');
  if (input.keyJwk !== undefined && input.keyJwk !== null && typeof input.keyJwk !== 'string') return fail('invalid keyJwk');
  if (typeof input.keyJwk === 'string') {
    if (input.keyJwk.length > LIMITS.maxJwkChars) return fail('keyJwk too large', 413);
    try {
      const parsed = JSON.parse(input.keyJwk) as Record<string, unknown>;
      if (!parsed || typeof parsed.kty !== 'string') return fail('invalid keyJwk');
    } catch {
      return fail('invalid keyJwk');
    }
  }

  return ok({
    systemPrompt: typeof input.systemPrompt === 'string' ? input.systemPrompt : '',
    saveHistory: input.saveHistory ?? false,
    girlMode: input.girlMode ?? false,
    keyJwk: typeof input.keyJwk === 'string' ? input.keyJwk : null,
  });
}

export function validateHistorySaveRequest(input: unknown): ValidationResult<{
  id?: string;
  iv: string;
  ciphertext: string;
  titleIv?: string;
  titleCiphertext?: string;
}> {
  if (!isPlainObject(input)) return fail('invalid request body');
  if (input.id !== undefined && typeof input.id !== 'string') return fail('invalid id');
  if (typeof input.id === 'string' && !/^[a-z0-9-]{8,80}$/i.test(input.id)) return fail('invalid id');
  if (typeof input.iv !== 'string' || input.iv.length === 0 || input.iv.length > LIMITS.maxIvChars) {
    return fail('invalid iv');
  }
  if (typeof input.ciphertext !== 'string' || input.ciphertext.length === 0) return fail('invalid ciphertext');
  if (bytesFromBase64(input.ciphertext) > LIMITS.maxCiphertextBytes) return fail('ciphertext too large', 413);
  const hasTitleFields = input.titleIv !== undefined || input.titleCiphertext !== undefined;
  if (hasTitleFields) {
    if (typeof input.titleIv !== 'string' || input.titleIv.length === 0 || input.titleIv.length > LIMITS.maxIvChars) {
      return fail('invalid titleIv');
    }
    if (typeof input.titleCiphertext !== 'string' || input.titleCiphertext.length === 0) return fail('invalid titleCiphertext');
    if (bytesFromBase64(input.titleCiphertext) > LIMITS.maxCiphertextBytes) return fail('titleCiphertext too large', 413);
  }
  return ok({
    ...(typeof input.id === 'string' ? { id: input.id } : {}),
    iv: input.iv,
    ciphertext: input.ciphertext,
    ...(typeof input.titleIv === 'string' && typeof input.titleCiphertext === 'string'
      ? { titleIv: input.titleIv, titleCiphertext: input.titleCiphertext }
      : {}),
  });
}

function sanitizeClientDetail(value: unknown): string | number | boolean | null {
  if (value === null) return null;
  if (typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.slice(0, LIMITS.maxClientEventValueChars);
  return String(value).slice(0, LIMITS.maxClientEventValueChars);
}

export function validateClientEventRequest(input: unknown): ValidationResult<{
  event: string;
  level: ClientEventLevel;
  details: Record<string, string | number | boolean | null>;
}> {
  if (!isPlainObject(input)) return fail('invalid request body');
  if (typeof input.event !== 'string' || !input.event || input.event.length > LIMITS.maxClientEventNameChars) {
    return fail('invalid event');
  }
  if (input.level !== undefined && input.level !== 'info' && input.level !== 'warn' && input.level !== 'error') {
    return fail('invalid level');
  }
  if (input.details !== undefined && !isPlainObject(input.details)) return fail('invalid details');

  const details: Record<string, string | number | boolean | null> = {};
  if (isPlainObject(input.details)) {
    for (const [key, value] of Object.entries(input.details).slice(0, LIMITS.maxClientEventDetails)) {
      details[key.slice(0, 40)] = sanitizeClientDetail(value);
    }
  }

  return ok({
    event: input.event,
    level: (input.level ?? 'error') as ClientEventLevel,
    details,
  });
}

export function isShareId(id: string): boolean {
  return /^[0-9a-f]{16,32}$/i.test(id);
}
