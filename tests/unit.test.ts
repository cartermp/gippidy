import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents } from '../lib/chat.ts';
import { renderMarkdown } from '../lib/markdown.ts';

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
