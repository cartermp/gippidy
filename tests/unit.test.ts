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

// Regression: btoa(String.fromCharCode(...large array)) throws "Maximum call stack
// size exceeded" for payloads above ~65 KB. encrypt() must use a loop, not spread.
test('encrypt/decrypt: large payload (>65 KB) round-trips without stack overflow', async () => {
  const key = await makeKey();
  // A realistic multi-turn chat: 50 messages, each ~1.5 KB of text ≈ 75 KB plaintext
  const longMessage = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(25);
  const messages = Array.from({ length: 50 }, (_, i) => ({
    role: i % 2 === 0 ? 'user' : 'assistant',
    content: `Message ${i}: ${longMessage}`,
  }));
  const data = { messages, model: 'gpt-4o', systemPrompt: '', title: 'Long chat' };
  const { iv, ciphertext } = await encrypt(key, data);
  const out = await decrypt<typeof data>(key, iv, ciphertext);
  assert.equal(out.messages.length, 50);
  assert.equal(out.messages[0].content, data.messages[0].content);
});

// Regression: ensure the shape saved by finalize() can be decoded by loadHistory().
// If these keys diverge, history silently shows nothing.
test('encrypt/decrypt: history payload shape is stable', async () => {
  const key = await makeKey();
  // Mirrors exactly what finalize() encrypts and loadHistory() decrypts
  const payload = {
    messages: [
      { role: 'user',      content: 'hello' },
      { role: 'assistant', content: 'hi there' },
    ],
    model:        'claude-sonnet-4-6',
    systemPrompt: 'be helpful',
    title:        'hello',
  };
  const { iv, ciphertext } = await encrypt(key, payload);
  const out = await decrypt<typeof payload>(key, iv, ciphertext);
  assert.equal(out.title, payload.title);
  assert.equal(out.model, payload.model);
  assert.equal(out.systemPrompt, payload.systemPrompt);
  assert.equal(out.messages.length, 2);
  assert.equal(out.messages[1].content, 'hi there');
});

// Regression: a single bad row must not wipe the entire history list.
// Promise.allSettled must be used, not Promise.all.
test('decrypt: one bad row does not prevent other rows from loading', async () => {
  const key = await makeKey();
  const good = [
    { id: '1', ...(await encrypt(key, { messages: [{ role: 'user', content: 'a' }], model: 'm', systemPrompt: '', title: 'a' })), updated_at: '2026-01-01' },
    { id: '2', ...(await encrypt(key, { messages: [{ role: 'user', content: 'b' }], model: 'm', systemPrompt: '', title: 'b' })), updated_at: '2026-01-02' },
  ];
  const corrupt = { id: '3', iv: 'AAAA', ciphertext: 'AAAA', updated_at: '2026-01-03' };
  const rows = [good[0], corrupt, good[1]];

  const wrongKey = await makeKey();
  const results = await Promise.allSettled(rows.map(row =>
    decrypt<{ messages: unknown[]; model: string; systemPrompt: string; title: string }>(
      // use wrong key for corrupt row to simulate key mismatch / bad data
      row.id === '3' ? wrongKey : key,
      row.iv,
      row.ciphertext,
    )
  ));
  const items = results.flatMap(r => r.status === 'fulfilled' ? [r.value] : []);
  assert.equal(items.length, 2, 'good rows should still load despite one bad row');
  assert.equal(items[0].title, 'a');
  assert.equal(items[1].title, 'b');
});
