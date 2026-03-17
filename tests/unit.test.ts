import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents } from '../lib/chat.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { encrypt, decrypt } from '../lib/crypto.ts';

// Inline copy of parseStreamError for unit testing (it lives in a client component)
function parseStreamError(status: number, body: string): string {
  if (status === 429) return '[RATE LIMITED] Wait a moment and try again.';
  if (status === 401 || status === 403) return '[AUTH ERROR] API key issue — contact the admin.';
  const b = body.toLowerCase();
  if (
    b.includes('context_length_exceeded') ||
    b.includes('maximum context length') ||
    b.includes('prompt is too long') ||
    b.includes('tokens exceed') ||
    b.includes('reduce your prompt')
  ) return "[TOO LONG] Conversation exceeds this model's context limit. Use [CLEAR] to start fresh.";
  if (status >= 500) return `[SERVER ERROR] The model returned an error (${status}). Try again.`;
  return `[ERROR ${status}] ${body.slice(0, 120)}`;
}

// ── getProvider ──────────────────────────────────────────────────────────────

test('getProvider: claude models → anthropic', () => {
  assert.equal(getProvider('claude-opus-4-6'), 'anthropic');
  assert.equal(getProvider('claude-sonnet-4-6'), 'anthropic');
});

test('getProvider: gemini models → google', () => {
  assert.equal(getProvider('gemini-3.1-pro-preview'), 'google');
  assert.equal(getProvider('gemini-3-flash-preview'), 'google');
});

test('getProvider: gpt models → openai', () => {
  assert.equal(getProvider('gpt-5.4'), 'openai');
  assert.equal(getProvider('gpt-4o'), 'openai');
});

// ── toOpenAIMessages ─────────────────────────────────────────────────────────

test('toOpenAIMessages: plain text round-trips', () => {
  const msgs = [{ role: 'user', content: 'hello' }];
  const out = toOpenAIMessages(msgs);
  assert.deepEqual(out, [{ role: 'user', content: 'hello' }]);
});

test('toOpenAIMessages: prepends system prompt', () => {
  const msgs = [{ role: 'user', content: 'hi' }];
  const out = toOpenAIMessages(msgs, 'be concise');
  assert.equal(out[0].role, 'system');
  assert.equal((out[0] as { role: string; content: string }).content, 'be concise');
  assert.equal(out.length, 2);
});

test('toOpenAIMessages: image becomes image_url block', () => {
  const msgs = [{ role: 'user', content: 'look', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toOpenAIMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
  assert.equal(parts[0].type, 'image_url');
  assert.equal(parts[0].image_url?.url, 'data:image/png;base64,abc');
  assert.equal(parts[1].type, 'text');
  assert.equal(parts[1].text, 'look');
});

test('toOpenAIMessages: image-only message (no text) omits text block', () => {
  const msgs = [{ role: 'user', content: '', images: [{ data: 'abc', mimeType: 'image/jpeg' }] }];
  const out = toOpenAIMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string }>;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'image_url');
});

// ── toAnthropicMessages ──────────────────────────────────────────────────────

test('toAnthropicMessages: plain text round-trips', () => {
  const msgs = [{ role: 'user', content: 'hello' }];
  assert.deepEqual(toAnthropicMessages(msgs), [{ role: 'user', content: 'hello' }]);
});

test('toAnthropicMessages: image becomes base64 source block', () => {
  const msgs = [{ role: 'user', content: 'look', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toAnthropicMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
  assert.equal(parts[0].type, 'image');
  assert.equal(parts[0].source?.type, 'base64');
  assert.equal(parts[0].source?.media_type, 'image/png');
  assert.equal(parts[0].source?.data, 'abc');
});

// ── toGeminiContents ─────────────────────────────────────────────────────────

test('toGeminiContents: user role preserved', () => {
  const out = toGeminiContents([{ role: 'user', content: 'hi' }]);
  assert.equal(out[0].role, 'user');
  assert.deepEqual(out[0].parts, [{ text: 'hi' }]);
});

test('toGeminiContents: assistant → model', () => {
  const out = toGeminiContents([{ role: 'assistant', content: 'hello' }]);
  assert.equal(out[0].role, 'model');
});

test('toGeminiContents: image becomes inlineData part', () => {
  const msgs = [{ role: 'user', content: '', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toGeminiContents(msgs);
  assert.deepEqual(out[0].parts[0], { inlineData: { mimeType: 'image/png', data: 'abc' } });
  assert.equal(out[0].parts.length, 1); // no text part since content is empty
});

// ── renderMarkdown ───────────────────────────────────────────────────────────

test('renderMarkdown: bold', () => {
  const html = renderMarkdown('**bold**');
  assert.ok(html.includes('<strong>bold</strong>'), `got: ${html}`);
});

test('renderMarkdown: code block gets hljs class', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.ok(html.includes('hljs'), `got: ${html}`);
});

test('renderMarkdown: plain text wrapped in paragraph', () => {
  const html = renderMarkdown('hello world');
  assert.ok(html.includes('<p>'), `got: ${html}`);
});

test('renderMarkdown: escapes raw HTML from model output', () => {
  const html = renderMarkdown('<script>alert(1)</script>');
  assert.ok(!html.includes('<script>'), `script tag should be escaped, got: ${html}`);
});

test('renderMarkdown: neutralizes javascript: links', () => {
  const html = renderMarkdown('[click](javascript:alert(1))');
  assert.ok(!html.includes('javascript:'), `javascript: URL should be removed, got: ${html}`);
});

// ── parseStreamError ─────────────────────────────────────────────────────────

test('parseStreamError: 429 → rate limit message', () => {
  assert.ok(parseStreamError(429, '').includes('RATE LIMITED'));
});

test('parseStreamError: 401 → auth message', () => {
  assert.ok(parseStreamError(401, '').includes('AUTH ERROR'));
});

test('parseStreamError: context length error body → too long message', () => {
  assert.ok(parseStreamError(400, 'context_length_exceeded').includes('TOO LONG'));
  assert.ok(parseStreamError(400, 'This model\'s maximum context length is 128k').includes('TOO LONG'));
  assert.ok(parseStreamError(400, 'prompt is too long').includes('TOO LONG'));
});

test('parseStreamError: 500 → server error message', () => {
  assert.ok(parseStreamError(500, 'internal error').includes('SERVER ERROR'));
});

test('parseStreamError: unknown error includes status code', () => {
  assert.ok(parseStreamError(400, 'bad request').includes('400'));
});

// ── crypto ────────────────────────────────────────────────────────────────────

async function makeKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

test('encrypt/decrypt: round-trips arbitrary data', async () => {
  const key  = await makeKey();
  const data = { messages: [{ role: 'user', content: 'hello' }], title: 'test chat' };
  const { iv, ciphertext } = await encrypt(key, data);
  const out  = await decrypt<typeof data>(key, iv, ciphertext);
  assert.deepEqual(out, data);
});

test('encrypt: produces different ciphertext on each call (random IV)', async () => {
  const key = await makeKey();
  const { iv: iv1, ciphertext: ct1 } = await encrypt(key, { x: 1 });
  const { iv: iv2, ciphertext: ct2 } = await encrypt(key, { x: 1 });
  assert.notEqual(iv1, iv2);
  assert.notEqual(ct1, ct2);
});

test('decrypt: rejects with wrong key', async () => {
  const key1 = await makeKey();
  const key2 = await makeKey();
  const { iv, ciphertext } = await encrypt(key1, { secret: 'data' });
  await assert.rejects(() => decrypt(key2, iv, ciphertext));
});

test('decrypt: rejects with tampered ciphertext', async () => {
  const key = await makeKey();
  const { iv, ciphertext } = await encrypt(key, { x: 1 });
  const tampered = ciphertext.slice(0, -4) + 'AAAA';
  await assert.rejects(() => decrypt(key, iv, tampered));
});

test('encrypt/decrypt: handles unicode and nested objects', async () => {
  const key  = await makeKey();
  const data = { title: '日本語テスト 🎉', nested: { a: [1, 2, 3] } };
  const { iv, ciphertext } = await encrypt(key, data);
  const out  = await decrypt<typeof data>(key, iv, ciphertext);
  assert.deepEqual(out, data);
});
