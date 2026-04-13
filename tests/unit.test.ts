import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, parseOpenAIChunk, parseAnthropicChunk, parseGeminiChunk, parseOpenAIResponsesChunk } from '../lib/chat.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { getOrCreateKey, encrypt, decrypt } from '../lib/crypto.ts';

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

test('toOpenAIMessages: PDF becomes a text note (not supported natively)', () => {
  const msgs = [{ role: 'user', content: 'summarize this', pdfs: [{ name: 'report.pdf', data: 'abc' }] }];
  const out  = toOpenAIMessages(msgs) as Array<{ role: string; content: string }>;
  assert.ok(out[0].content.includes('report.pdf'), `PDF name should appear in text, got: ${out[0].content}`);
  assert.ok(out[0].content.includes('summarize this'));
});

test('toOpenAIMessages: PDF + image together — image_url block and PDF note both present', () => {
  const msgs = [{ role: 'user', content: 'check both', images: [{ data: 'img', mimeType: 'image/png' }], pdfs: [{ name: 'doc.pdf', data: 'pdfdata' }] }];
  const out = toOpenAIMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
  assert.equal(parts[0].type, 'image_url');
  const textPart = parts.find(p => p.type === 'text');
  assert.ok(textPart?.text?.includes('doc.pdf'), `PDF name missing from text, got: ${textPart?.text}`);
  assert.ok(textPart?.text?.includes('check both'));
});

// ── toAnthropicMessages ──────────────────────────────────────────────────────

test('toAnthropicMessages: plain text round-trips', () => {
  const msgs = [{ role: 'user', content: 'hello' }];
  assert.deepEqual(toAnthropicMessages(msgs), [{ role: 'user', content: 'hello' }]);
});

test('toAnthropicMessages: PDF becomes document block', () => {
  const msgs = [{ role: 'user', content: 'summarize', pdfs: [{ name: 'doc.pdf', data: 'pdfdata' }] }];
  const out  = toAnthropicMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; source?: { type: string; media_type: string; data: string } }>;
  assert.equal(parts[0].type, 'document');
  assert.equal(parts[0].source?.type, 'base64');
  assert.equal(parts[0].source?.media_type, 'application/pdf');
  assert.equal(parts[0].source?.data, 'pdfdata');
});

test('toAnthropicMessages: image becomes base64 source block', () => {
  const msgs = [{ role: 'user', content: 'look', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toAnthropicMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; source?: { type: string; media_type: string; data: string }; text?: string }>;
  assert.equal(parts[0].type, 'image');
  assert.equal(parts[0].source?.type, 'base64');
  assert.equal(parts[0].source?.media_type, 'image/png');
  assert.equal(parts[0].source?.data, 'abc');
  const textPart = parts.find(p => p.type === 'text');
  assert.ok(textPart, 'text block should be present');
  assert.equal(textPart?.text, 'look');
});

test('toAnthropicMessages: PDF + image together — PDF first, then image, then text', () => {
  const msgs = [{ role: 'user', content: 'analyze', images: [{ data: 'img', mimeType: 'image/jpeg' }], pdfs: [{ name: 'doc.pdf', data: 'pdfdata' }] }];
  const out = toAnthropicMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string; source?: { media_type: string }; text?: string }>;
  assert.equal(parts[0].type, 'document');
  assert.equal(parts[1].type, 'image');
  assert.equal(parts[2].type, 'text');
  assert.equal(parts[2].text, 'analyze');
});

test('toAnthropicMessages: image-only (no text) omits text block', () => {
  const msgs = [{ role: 'user', content: '', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toAnthropicMessages(msgs) as Array<{ role: string; content: unknown }>;
  const parts = out[0].content as Array<{ type: string }>;
  assert.equal(parts.length, 1);
  assert.equal(parts[0].type, 'image');
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

test('toGeminiContents: PDF becomes inlineData part with application/pdf', () => {
  const msgs = [{ role: 'user', content: 'read this', pdfs: [{ name: 'doc.pdf', data: 'pdfdata' }] }];
  const out  = toGeminiContents(msgs);
  assert.deepEqual(out[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'pdfdata' } });
});

test('toGeminiContents: image becomes inlineData part', () => {
  const msgs = [{ role: 'user', content: '', images: [{ data: 'abc', mimeType: 'image/png' }] }];
  const out = toGeminiContents(msgs);
  assert.deepEqual(out[0].parts[0], { inlineData: { mimeType: 'image/png', data: 'abc' } });
  assert.equal(out[0].parts.length, 1); // no text part since content is empty
});

test('toGeminiContents: image + text — text part appended after inlineData', () => {
  const msgs = [{ role: 'user', content: 'describe this', images: [{ data: 'abc', mimeType: 'image/jpeg' }] }];
  const out = toGeminiContents(msgs);
  assert.equal(out[0].parts.length, 2);
  assert.deepEqual(out[0].parts[1], { text: 'describe this' });
});

test('toGeminiContents: PDF + image together — PDF first, then image, then text', () => {
  const msgs = [{ role: 'user', content: 'read both', images: [{ data: 'img', mimeType: 'image/png' }], pdfs: [{ name: 'doc.pdf', data: 'pdfdata' }] }];
  const out = toGeminiContents(msgs);
  assert.deepEqual(out[0].parts[0], { inlineData: { mimeType: 'application/pdf', data: 'pdfdata' } });
  assert.deepEqual(out[0].parts[1], { inlineData: { mimeType: 'image/png', data: 'img' } });
  assert.deepEqual(out[0].parts[2], { text: 'read both' });
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

test('renderMarkdown: known language uses explicit highlight', () => {
  const html = renderMarkdown('```python\ndef foo(): pass\n```');
  assert.ok(html.includes('language-python'), `expected language-python class, got: ${html}`);
  assert.ok(html.includes('hljs'), `expected hljs class, got: ${html}`);
});

test('renderMarkdown: unlabeled code block is auto-detected (not left as plaintext)', () => {
  // A clearly identifiable snippet — auto-detect should recognise it
  const html = renderMarkdown('```\nconst x: number = 42;\n```');
  assert.ok(html.includes('hljs'), `expected hljs highlighting, got: ${html}`);
  // Must NOT fall back to plaintext — auto-detection should fire
  assert.ok(!html.includes('language-plaintext'), `should not fall back to plaintext, got: ${html}`);
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

test('renderMarkdown: neutralizes data:text/html links', () => {
  const html = renderMarkdown('[click](data:text/html,<script>alert(1)</script>)');
  assert.ok(!html.includes('data:text/html'), `data:text/html URL should be removed, got: ${html}`);
});

test('renderMarkdown: user message with mixed text and fenced code block renders both', () => {
  // Simulates a user typing prose followed by a code snippet
  const html = renderMarkdown('here is some code:\n\n```typescript\nconst x: number = 1;\n```');
  assert.ok(html.includes('<p>'), `prose should be in a paragraph, got: ${html}`);
  assert.ok(html.includes('language-typescript'), `code fence should be highlighted as typescript, got: ${html}`);
  assert.ok(html.includes('hljs'), `hljs class should be present, got: ${html}`);
  assert.ok(html.includes('code-block'), `copy button wrapper should be present, got: ${html}`);
});

test('renderMarkdown: copy button uses data attribute instead of inline handler', () => {
  const html = renderMarkdown('```js\nconst x = 1;\n```');
  assert.ok(html.includes('data-copy-code'), `copy button data attribute should be present, got: ${html}`);
  assert.ok(!html.includes('onclick='), `inline handler should be absent, got: ${html}`);
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

// ── settings validation ────────────────────────────────────────────────────────

test('validateSettingsRequest: validates and defaults girlMode', () => {
  const source = readFileSync(join(import.meta.dirname, '../lib/validation.ts'), 'utf8');
  assert.ok(
    source.includes("if (input.girlMode !== undefined && typeof input.girlMode !== 'boolean') return fail('invalid girlMode');"),
    'validateSettingsRequest should reject non-boolean girlMode values',
  );
  assert.ok(
    source.includes('girlMode: input.girlMode ?? false,'),
    'validateSettingsRequest should persist girlMode and default it to false',
  );
});

// ── SSE chunk parsers ─────────────────────────────────────────────────────────

test('parseOpenAIChunk: extracts delta content', () => {
  const chunk = JSON.stringify({ choices: [{ delta: { content: 'hello' } }] });
  assert.equal(parseOpenAIChunk(chunk), 'hello');
});

test('parseOpenAIChunk: returns empty string for non-content delta', () => {
  const chunk = JSON.stringify({ choices: [{ delta: {} }] });
  assert.equal(parseOpenAIChunk(chunk), '');
});

test('parseOpenAIChunk: returns empty string for malformed JSON', () => {
  assert.equal(parseOpenAIChunk('not json'), '');
});

test('parseAnthropicChunk: extracts text_delta', () => {
  const chunk = JSON.stringify({ type: 'content_block_delta', delta: { type: 'text_delta', text: 'world' } });
  assert.equal(parseAnthropicChunk(chunk), 'world');
});

test('parseAnthropicChunk: returns empty for non-text_delta types', () => {
  const chunk = JSON.stringify({ type: 'content_block_start', index: 0 });
  assert.equal(parseAnthropicChunk(chunk), '');
});

test('parseAnthropicChunk: returns empty for malformed JSON', () => {
  assert.equal(parseAnthropicChunk('bad'), '');
});

test('parseGeminiChunk: extracts text from candidates', () => {
  const chunk = JSON.stringify({ candidates: [{ content: { parts: [{ text: 'hi' }] } }] });
  assert.equal(parseGeminiChunk(chunk), 'hi');
});

test('parseGeminiChunk: returns empty for missing candidates', () => {
  assert.equal(parseGeminiChunk(JSON.stringify({})), '');
});

test('parseGeminiChunk: returns empty for malformed JSON', () => {
  assert.equal(parseGeminiChunk('bad'), '');
});

test('parseOpenAIResponsesChunk: web_search_call.completed → null byte signal', () => {
  assert.equal(parseOpenAIResponsesChunk('response.web_search_call.completed', ''), '\0');
});

test('parseOpenAIResponsesChunk: output_text.delta → extracted delta', () => {
  const data = JSON.stringify({ delta: 'some text' });
  assert.equal(parseOpenAIResponsesChunk('response.output_text.delta', data), 'some text');
});

test('parseOpenAIResponsesChunk: unrelated event → empty string', () => {
  assert.equal(parseOpenAIResponsesChunk('response.created', '{}'), '');
});

test('parseOpenAIResponsesChunk: output_text.delta with malformed JSON → empty string', () => {
  assert.equal(parseOpenAIResponsesChunk('response.output_text.delta', 'bad json'), '');
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

// ── getOrCreateKey ────────────────────────────────────────────────────────────

// Helper: export a CryptoKey to the JWK string format used by the server
async function exportJwk(key: CryptoKey): Promise<string> {
  return JSON.stringify(await crypto.subtle.exportKey('jwk', key));
}

test('getOrCreateKey: imports server-stored JWK and returns no new JWK to save', async () => {
  const original = await makeKey();
  const jwkStr   = await exportJwk(original);

  const { key, jwk } = await getOrCreateKey(jwkStr);
  assert.equal(jwk, null, 'should not return a new JWK when one already exists');
  // The imported key must decrypt data encrypted with the original
  const { iv, ciphertext } = await encrypt(original, { x: 42 });
  const out = await decrypt<{ x: number }>(key, iv, ciphertext);
  assert.equal(out.x, 42);
});

test('getOrCreateKey: generates a new key when server has none, returns JWK to save', async () => {
  const { key, jwk } = await getOrCreateKey(null);
  assert.ok(jwk !== null, 'should return a JWK string to persist when no key exists');
  // Round-trip with the generated key
  const { iv, ciphertext } = await encrypt(key, { hello: 'world' });
  const out = await decrypt<{ hello: string }>(key, iv, ciphertext);
  assert.equal(out.hello, 'world');
});

// Regression: all deployments sharing the same server JWK must produce the same key.
// Before this fix, each deployment had its own localStorage key, so Railway could not
// decrypt rows saved by Vercel and vice versa.
test('getOrCreateKey: same server JWK produces same key across two calls (cross-deployment)', async () => {
  const original = await makeKey();
  const jwkStr   = await exportJwk(original);

  const { key: key1 } = await getOrCreateKey(jwkStr);
  const { key: key2 } = await getOrCreateKey(jwkStr);

  // Encrypt with key1, decrypt with key2 — must succeed
  const { iv, ciphertext } = await encrypt(key1, { deployment: 'railway' });
  const out = await decrypt<{ deployment: string }>(key2, iv, ciphertext);
  assert.equal(out.deployment, 'railway');
});

// ── CSS layout regression ────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

test('input-row uses align-items: flex-start so the > prompt icon stays at the top', () => {
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');

  // Extract the .input-row rule block
  const match = css.match(/\.input-row\s*\{([^}]*)\}/);
  assert.ok(match, '.input-row rule not found in globals.css');
  const rule = match[1];

  assert.ok(
    rule.includes('align-items: flex-start'),
    '.input-row must use align-items: flex-start (not flex-end) so > stays at top of multi-line input',
  );
});

test('input-prompt uses padding-top (not padding-bottom) to align with top of textarea', () => {
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');

  const match = css.match(/\.input-prompt\s*\{([^}]*)\}/);
  assert.ok(match, '.input-prompt rule not found in globals.css');
  const rule = match[1];

  assert.ok(!rule.includes('padding-bottom'), '.input-prompt must not use padding-bottom');
});

test('globals.css defines a girl mode theme with sparkles', () => {
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');
  assert.ok(css.includes(":root[data-girl-mode='true']"), 'girl mode theme selector missing');
  assert.ok(css.includes('--sparkle-opacity'), 'girl mode sparkle variables missing');
});
