import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getProvider, toOpenAIMessages, toAnthropicMessages, toGeminiContents, parseOpenAIChunk, parseAnthropicChunk, parseGeminiChunk, parseOpenAIResponsesChunk, splitMessageFollowups } from '../lib/chat.ts';
import { renderMarkdown } from '../lib/markdown.ts';
import { getOrCreateKey, encrypt, decrypt } from '../lib/crypto.ts';

// Inline copy of parseStreamError for unit testing (it lives in a client component)
function parseStreamError(status: number, body: string): string {
  if (status === 429) return '[RATE LIMITED] Wait a moment and try again.';
  if (status === 401 || status === 403) return '[AUTH ERROR] API key issue — contact the admin.';
  const b = body.toLowerCase();
  if (status === 408 || status === 504 || b.includes('timeout') || b.includes('timed out')) {
    return '[TIMEOUT] The model took too long to respond. Try again.';
  }
  if (status === 413 || b.includes('request too large') || b.includes('too large')) {
    return '[TOO LARGE] That message or attachment is too large. Try a shorter message or smaller files.';
  }
  if (
    b.includes('context_length_exceeded') ||
    b.includes('maximum context length') ||
    b.includes('prompt is too long') ||
    b.includes('tokens exceed') ||
    b.includes('reduce your prompt')
  ) return "[TOO LONG] Conversation exceeds this model's context limit. Use [CLEAR] to start fresh.";
  if (status === 400) return '[REQUEST ERROR] That request could not be processed. Try shortening it or starting a new chat.';
  if (status === 404 || status === 405) return '[APP ERROR] The chat service is unavailable right now. Refresh and try again.';
  if (status >= 500) return `[SERVER ERROR] The model returned an error (${status}). Try again.`;
  return `[ERROR ${status}] Something went wrong. Try again.`;
}

function parseClientError(error: unknown): string {
  const name = error instanceof Error ? error.name : '';
  const message = error instanceof Error ? error.message : String(error);
  const detail = `${name} ${message}`.toLowerCase();

  if (
    detail.includes('network') ||
    detail.includes('failed to fetch') ||
    detail.includes('load failed') ||
    detail.includes('network request failed')
  ) return '[NETWORK ERROR] Could not reach the server. Check your connection and try again.';

  if (detail.includes('timeout') || detail.includes('timed out')) {
    return '[TIMEOUT] The request took too long. Try again.';
  }

  return '[ERROR] Something went wrong while sending that message. Try again.';
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

test('splitMessageFollowups: strips the trailing followups block and returns followup buttons', () => {
  const parsed = splitMessageFollowups(
    'Main answer.\n\n<followups><followup>First follow-up.</followup><followup>Second follow-up.</followup></followups>',
  );
  assert.equal(parsed.content, 'Main answer.');
  assert.deepEqual(parsed.followups, ['First follow-up.', 'Second follow-up.']);
});

test('splitMessageFollowups: ignores followups tags that are not at the end of the message', () => {
  const content = '<followups><followup>Example</followup></followups>\nStill part of the visible message.';
  const parsed = splitMessageFollowups(content);
  assert.equal(parsed.content, content);
  assert.deepEqual(parsed.followups, []);
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

test('parseStreamError: 413 → too large message', () => {
  assert.ok(parseStreamError(413, 'Request too large').includes('TOO LARGE'));
});

test('parseStreamError: generic 400 → request error message', () => {
  assert.ok(parseStreamError(400, 'bad request').includes('REQUEST ERROR'));
});

test('parseClientError: network failures become friendly network errors', () => {
  assert.ok(parseClientError(new TypeError('network error')).includes('NETWORK ERROR'));
  assert.ok(parseClientError(new TypeError('Failed to fetch')).includes('NETWORK ERROR'));
});

test('parseClientError: timeout failures become timeout errors', () => {
  assert.ok(parseClientError(new Error('request timed out')).includes('TIMEOUT'));
});

test('parseStreamError: unknown error includes status code', () => {
  assert.ok(parseStreamError(418, 'teapot').includes('418'));
});

test('page source uses friendly client error formatting instead of raw String(err)', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  assert.ok(
    source.includes('const errMsg = parseClientError(err);'),
    'chat stream failures should use the friendly client error formatter',
  );
  assert.ok(
    !source.includes('const errMsg = `[ERROR] ${String(err)}`;'),
    'chat stream failures should not show raw browser error strings to the user',
  );
});

test('followup UI wiring hides XML in assistant messages and submits the selected followup', () => {
  const pageSource = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  const renderedMarkdownSource = readFileSync(join(import.meta.dirname, '../app/rendered-markdown.tsx'), 'utf8');
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');

  assert.ok(
    pageSource.includes('const requestMessages = toConversationMessages(msgs);'),
    'assistant followup XML should be stripped before sending prior assistant messages back to the model',
  );
  assert.ok(
    pageSource.includes('const handleFollowupClick = async (followup: string) => {'),
    'the page should expose a click handler that submits a selected followup',
  );
  assert.ok(
    pageSource.includes('await submitTurn(followup);'),
    'clicking a followup should immediately submit that followup as the next turn',
  );
  assert.ok(
    pageSource.includes('setMessages(withRenderedMessages(item.messages));'),
    'history-loaded chats should still rebuild assistant message rendering on the client',
  );
  assert.ok(
    renderedMarkdownSource.includes('className="followup-button"'),
    'RenderedMarkdown should render followups as dedicated themed buttons',
  );
  assert.ok(
    renderedMarkdownSource.includes('followupsEnabled'),
    'RenderedMarkdown should explicitly opt into followup parsing for assistant messages',
  );
  assert.ok(
    renderedMarkdownSource.includes('const preferClientRender = followupsEnabled && text !== undefined;'),
    'followup rendering should prefer client-side markdown from raw text when followups are enabled',
  );
  assert.ok(
    css.includes('.followup-button'),
    'globals.css should include styling for the followup buttons',
  );
});

test('history-loaded chats persist across refreshes and clear correctly', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  const historyItemRouteSource = readFileSync(join(import.meta.dirname, '../app/api/history/[id]/route.ts'), 'utf8');
  assert.ok(
    source.includes("const ACTIVE_HISTORY_CHAT_KEY = 'gippidy-active-history-chat';"),
    'page should define a dedicated localStorage key for the active saved chat',
  );
  assert.ok(
    source.includes('const activeHistoryChatId = localStorage.getItem(ACTIVE_HISTORY_CHAT_KEY);'),
    'page should read the active saved chat id during startup',
  );
  assert.ok(
    source.includes("const pendingStartupHistoryRestoreRef = useRef<string | null>(null);"),
    'page should track whether the startup history restore is still allowed to apply',
  );
  assert.ok(
    source.includes('pendingStartupHistoryRestoreRef.current = restoredFork ? null : activeHistoryChatId;'),
    'page should remember which saved chat is eligible for startup restore',
  );
  assert.ok(
    source.includes('if (!restoredFork && restoreId) {'),
    'history restore should only run when a forked chat is not taking over startup',
  );
  assert.ok(
    source.includes('const restored = await fetchHistoryItem(restoreId);'),
    'page should restore the active saved chat by directly fetching that history row',
  );
  assert.ok(
    source.includes(`if (pendingStartupHistoryRestoreRef.current !== restoreId) {
            prewarmHistoryItems();
            return;
          }`),
    'page should skip applying a delayed restore after the user has already moved on',
  );
  assert.ok(
    source.includes('if (restored.kind === \'ok\') applyLoadedChat(restored.item);'),
    'page should rehydrate the previously active saved chat after refresh',
  );
  assert.ok(
    source.includes('setHistoryOpeningId(item.id);') &&
      source.includes('const restored = await fetchHistoryItem(item.id);'),
    'history drawer selection should fetch and decrypt the selected chat on demand instead of relying on the list payload',
  );
  assert.ok(
    source.includes('rememberActiveHistoryChat(id);'),
    'saving or loading a chat should persist the active saved chat id',
  );
  assert.ok(
    source.includes('rememberActiveHistoryChat(null);'),
    'clearing, deleting, or forking away from a saved chat should clear the persisted selection',
  );
  assert.ok(
    source.includes('cancelPendingStartupHistoryRestore(true);'),
    'starting a new chat should cancel the pending startup restore and clear the stale saved-chat selection',
  );
  assert.ok(
    source.includes('const startFreshChat = () => {') &&
      source.includes('chatStateVersionRef.current += 1;') &&
      source.includes('abortControllerRef.current?.abort();') &&
      source.includes('<a className="logo" href="/" onClick={e => { e.preventDefault(); startFreshChat(); }}>GIPPIDY</a>') &&
      source.includes('<button onClick={startFreshChat}>[CLEAR]</button>'),
    'the logo and [CLEAR] should use the same fresh-chat path so explicit new-chat actions clear persisted selection and invalidate stale in-flight work',
  );
  assert.ok(
    source.includes("logClientEvent('history.restore_fetch_failed'"),
    'page should log a specific restore failure instead of only a generic settings load failure',
  );
  assert.ok(
    historyItemRouteSource.includes('SELECT id, iv, ciphertext, updated_at FROM chat_histories WHERE id = $1 AND user_email = $2 LIMIT 1'),
    'history item route should support fetching one saved chat by id for refresh restore',
  );
  assert.ok(
    historyItemRouteSource.includes("logRouteOutcome('history.get', start, ctx);"),
    'history item route should emit the canonical history.get log for direct history fetches',
  );
});

test('history drawer still loads the latest 50 saved chats', () => {
  const pageSource = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  const historyRouteSource = readFileSync(join(import.meta.dirname, '../app/api/history/route.ts'), 'utf8');
  const migrateSource = readFileSync(join(import.meta.dirname, '../scripts/migrate.mjs'), 'utf8');
  assert.ok(
    pageSource.includes("const HISTORY_PREVIEW_CACHE_KEY = 'gippidy-history-preview-cache';"),
    'history drawer should keep decrypted preview titles only in session-scoped storage for faster refreshes',
  );
  assert.ok(
    pageSource.includes("const res = await fetch('/api/history?titles=1');"),
    'history drawer should request the lightweight title-preview history endpoint',
  );
  assert.ok(
    pageSource.includes('const title = await decryptHistoryTitle(key, row);'),
    'history drawer loading should decrypt only the saved title for each preview row',
  );
  assert.ok(
    pageSource.includes('const raw = sessionStorage.getItem(HISTORY_PREVIEW_CACHE_KEY);') &&
      pageSource.includes('sessionStorage.setItem(HISTORY_PREVIEW_CACHE_KEY, JSON.stringify(cache));'),
    'history preview loading should reuse a sessionStorage cache instead of re-decrypting unchanged titles on every refresh',
  );
  assert.ok(
    pageSource.includes('const cached = historyPreviewCacheRef.current[row.id];') &&
      pageSource.includes('cached.updatedAt === row.updated_at'),
    'history preview loading should skip title decryption when the cached preview still matches the row updated_at timestamp',
  );
  assert.ok(
    pageSource.includes('const historyPreviewItemsRef = useRef<HistoryPreview[] | null>(null);') &&
      pageSource.includes('if (historyPreviewItemsRef.current) setHistoryItems(historyPreviewItemsRef.current);'),
    'history drawer should reuse warmed preview items immediately when they are already in memory',
  );
  assert.ok(
    pageSource.includes('historyWarmTimerRef.current = setTimeout(() => {') &&
      pageSource.includes('void getHistoryItems();'),
    'history previews should prewarm in the background after startup key hydration so opening history is usually instant',
  );
  assert.ok(
    pageSource.includes('const historyPreviewVersionRef = useRef(0);') &&
      pageSource.includes('historyPreviewVersionRef.current += 1;') &&
      pageSource.includes('if (items && historyPreviewVersionRef.current === version) {'),
    'history preview warming should ignore stale in-flight loads after saves or deletes change the visible history list',
  );
  assert.ok(
    pageSource.includes('await loadHistory();'),
    'opening the history drawer should refresh the saved chat list',
  );
  assert.ok(
    historyRouteSource.includes('ORDER BY updated_at DESC LIMIT 50'),
    'history list endpoint should return the latest 50 saved chats first',
  );
  assert.ok(
    historyRouteSource.includes("const titleOnly = new URL(req.url).searchParams.get('titles') === '1';"),
    'history list endpoint should support a title-only preview mode for faster drawer loads',
  );
  assert.ok(
    historyRouteSource.includes('CASE WHEN title_ciphertext IS NULL THEN iv ELSE NULL END AS iv') &&
      historyRouteSource.includes('CASE WHEN title_ciphertext IS NULL THEN ciphertext ELSE NULL END AS ciphertext'),
    'history list preview mode should fall back to the legacy full ciphertext only for rows that do not have split title payloads yet',
  );
  assert.ok(
    historyRouteSource.includes('ctx.topUpdatedAt = rows[0]?.updated_at ?? null;'),
    'history list logs should include the updated_at timestamp of the top visible row',
  );
  assert.ok(
    historyRouteSource.includes("logRouteOutcome('history.list', start, ctx);"),
    'history list endpoint should continue emitting the canonical history.list log for the visible latest-history window',
  );
  assert.ok(
    migrateSource.includes('ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS title_iv TEXT') &&
      migrateSource.includes('ALTER TABLE chat_histories ADD COLUMN IF NOT EXISTS title_ciphertext TEXT'),
    'history migration should add split encrypted title columns for lightweight preview loading',
  );
});

test('history save logs meaningful failure details before and after the network request', () => {
  const pageSource = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  assert.ok(
    pageSource.includes('const waitForHistorySaveReady = async (): Promise<CryptoKey | null> => {'),
    'history saves should have a dedicated readiness helper so completed responses can wait for startup hydration',
  );
  assert.ok(
    pageSource.includes('if (!initialSettingsLoadedRef.current || !cryptoKeyRef.current) await keyReadyRef.current;'),
    'history saves should wait for settings/key hydration when startup is still in flight',
  );
  assert.ok(
    pageSource.includes('const key = await waitForHistorySaveReady();'),
    'history saves should resolve readiness after the assistant response finishes, before persisting history',
  );
  assert.ok(
    pageSource.includes('if (!key) return;'),
    'history saves should skip only after the readiness helper decides saving is not possible',
  );
  assert.ok(
    pageSource.includes('const currentHistoryId = chatIdRef.current;'),
    'history saves should snapshot the current saved-chat id before building the request body',
  );
  assert.ok(
    pageSource.includes('const chatStateVersion = chatStateVersionRef.current;') &&
      pageSource.includes('if (chatStateVersionRef.current !== chatStateVersion || chatIdRef.current !== currentHistoryId) return;'),
    'history saves should ignore stale save completions after the user has started a different chat',
  );
  assert.ok(
    pageSource.includes(`currentHistoryId
              ? { id: currentHistoryId, iv, ciphertext, titleIv, titleCiphertext }
              : { iv, ciphertext, titleIv, titleCiphertext }`),
    'history saves should persist a separate encrypted title alongside the full encrypted chat payload',
  );
  assert.ok(
    pageSource.includes('const { iv: titleIv, ciphertext: titleCiphertext } = await encrypt(key, title);'),
    'history saves should encrypt the title separately so the drawer can decrypt previews without loading full chats',
  );
  assert.ok(
    pageSource.includes('historyPreviewItemsRef.current = null;') &&
      pageSource.includes('prewarmHistoryItems();'),
    'history saves should invalidate and refresh warmed previews so the drawer picks up the latest saved chat state',
  );
  assert.ok(
    pageSource.includes('const bodyBytes = new TextEncoder().encode(body).length;'),
    'history saves should measure request size before posting so oversized chats are diagnosable',
  );
  assert.ok(
    pageSource.includes('titleCiphertextBytes > LIMITS.maxCiphertextBytes'),
    'history saves should log when the encrypted payload is too large to persist',
  );
  assert.ok(
    pageSource.includes("logClientEvent('history.save_too_large', 'warn', {"),
    'history saves should emit a dedicated too-large log event with size details',
  );
  assert.ok(
    pageSource.includes("const error = (await res.text()).slice(0, LIMITS.maxClientEventValueChars);"),
    'history save failures should capture the server error text for debugging',
  );
  assert.ok(
    pageSource.includes('bodyBytes,'),
    'history save failure logs should include the request body size',
  );
  assert.ok(
    pageSource.includes('ciphertextBytes,'),
    'history save failure logs should include the ciphertext size',
  );
  assert.ok(
    pageSource.includes('titleCiphertextBytes,'),
    'history save logs should include the split title ciphertext size for debugging preview writes',
  );
  assert.ok(
    pageSource.includes('if (chatStateVersionRef.current !== chatStateVersion) return;') &&
      pageSource.includes('if (chatStateVersionRef.current !== chatStateVersion) {\n        cancelTicker();\n        return;\n      }'),
    'stream finalization should stop when the user has already switched to a different chat',
  );
});

test('history save route emits one wide canonical history.save log per POST attempt', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/api/history/route.ts'), 'utf8');
  const logSource = readFileSync(join(import.meta.dirname, '../lib/log.ts'), 'utf8');
  assert.ok(
    source.includes('const ctx: Record<string, string | number | boolean | null> = {'),
    'history save route should collect request/save metadata in one canonical logging context',
  );
  assert.ok(
    source.includes('const requestBytes = readContentLength(req);') &&
      source.includes('requestBytes,'),
    'history save route should log request size metadata',
  );
  assert.ok(
    source.includes('hasIdField: false,'),
    'history save route should log whether the request included an id field at all',
  );
  assert.ok(
    source.includes('hasTitleFields: false,'),
    'history save route should log whether the request included split encrypted title fields',
  );
  assert.ok(
    source.includes('ctx.idFieldType = getFieldType(body.id);'),
    'history save route should log the type of the incoming id field for debugging invalid payloads',
  );
  assert.ok(
    source.includes('ctx.requestedId = typeof body.id === \'string\' ? body.id : null;'),
    'history save route should capture the requested id before validation',
  );
  assert.ok(
    source.includes('const result = await saveHistoryRow(session.user.email, parsed.value);') &&
      source.includes('ctx.savedId = result.savedId;'),
    'history save route should log the final saved history id',
  );
  assert.ok(
    source.includes('title_ciphertext = $4') &&
      source.includes('INSERT INTO chat_histories (id, user_email, iv, ciphertext, title_iv, title_ciphertext)'),
    'history save route should write split title ciphertext fields when the schema supports them',
  );
  assert.ok(
    source.includes('return { ...(await attempt(false)), legacySchema: true };'),
    'history save route should fall back to the legacy history schema when split title columns are not available yet',
  );
  assert.ok(
    logSource.includes('export function logByStatus(') &&
      logSource.includes('if (status >= 500) logger.error(fields, event);'),
    'route logging should centralize 5xx/error log-level routing in the shared logger helper',
  );
  assert.ok(
    logSource.includes("else if (status >= 400) logger.warn(fields, event);"),
    'route logging should centralize 4xx/warn log-level routing in the shared logger helper',
  );
  assert.ok(
    logSource.includes('export function logRouteOutcome(') &&
      source.includes("logRouteOutcome('history.save', start, ctx);"),
    'history save route should emit its canonical history.save log through the shared route helper',
  );
  assert.ok(
    !source.includes("'history.save.invalid'") &&
      !source.includes("'history.save.failed'") &&
      !source.includes("'history.save.too_large'"),
    'history save POST logging should use the canonical history.save event name instead of fragmented sub-events',
  );
});

test('route verbs use canonical thick logging across settings, history, shares, and health', () => {
  const historySource = readFileSync(join(import.meta.dirname, '../app/api/history/route.ts'), 'utf8');
  const historyItemSource = readFileSync(join(import.meta.dirname, '../app/api/history/[id]/route.ts'), 'utf8');
  const settingsSource = readFileSync(join(import.meta.dirname, '../app/api/settings/route.ts'), 'utf8');
  const sharesSource = readFileSync(join(import.meta.dirname, '../app/api/shares/route.ts'), 'utf8');
  const shareGetSource = readFileSync(join(import.meta.dirname, '../app/api/shares/[id]/route.ts'), 'utf8');
  const clientEventsSource = readFileSync(join(import.meta.dirname, '../app/api/client-events/route.ts'), 'utf8');
  const healthSource = readFileSync(join(import.meta.dirname, '../app/api/health/route.ts'), 'utf8');

  assert.ok(
    historySource.includes("logRouteOutcome('history.list', start, ctx);"),
    'history GET should emit one canonical history.list log line per request',
  );
  assert.ok(
    !historySource.includes("'history.list.failed'") &&
      !historySource.includes("'history.list.unauthenticated'"),
    'history list logging should use the canonical history.list event instead of fragmented sub-events',
  );
  assert.ok(
    historyItemSource.includes("logRouteOutcome('history.get', start, ctx);") &&
      historyItemSource.includes("logRouteOutcome('history.delete', start, ctx);"),
    'history item GET/DELETE should emit canonical history.get and history.delete logs',
  );
  assert.ok(
    !historyItemSource.includes("'history.get.failed'") &&
      !historyItemSource.includes("'history.get.invalid'") &&
      !historyItemSource.includes("'history.get.missing'") &&
      !historyItemSource.includes("'history.get.unauthenticated'") &&
      !historyItemSource.includes("'history.delete.failed'") &&
      !historyItemSource.includes("'history.delete.invalid'") &&
      !historyItemSource.includes("'history.delete.unauthenticated'"),
    'history item routes should collapse invalid, missing, auth, and failure outcomes into the canonical verb logs',
  );
  assert.ok(
    settingsSource.includes("logRouteOutcome('settings.get', start, ctx);") &&
      settingsSource.includes("logRouteOutcome('settings.put', start, ctx);"),
    'settings GET/PUT should emit canonical settings.get and settings.put logs',
  );
  assert.ok(
    !settingsSource.includes("'settings.get.failed'") &&
      !settingsSource.includes("'settings.put.failed'") &&
      !settingsSource.includes("'settings.put.invalid'") &&
      !settingsSource.includes("'settings.put.too_large'") &&
      !settingsSource.includes("'settings.get.legacy_schema'") &&
      !settingsSource.includes("'settings.put.legacy_schema'"),
    'settings route logging should keep schema fallback and validation details inside the canonical verb logs',
  );
  assert.ok(
    sharesSource.includes("logRouteOutcome('share.create', start, ctx);"),
    'share creation should emit one canonical share.create log line per request',
  );
  assert.ok(
    !sharesSource.includes("'share.create.failed'") &&
      !sharesSource.includes("'share.create.invalid'") &&
      !sharesSource.includes("'share.create.too_large'") &&
      !sharesSource.includes("'share.create.unauthenticated'") &&
      !sharesSource.includes("'share.create.collision'"),
    'share creation logging should fold auth, validation, size, and collision outcomes into the canonical share.create event',
  );
  assert.ok(
    shareGetSource.includes("logRouteOutcome('share.get', start, ctx);"),
    'shared chat fetches should emit one canonical share.get log line per request',
  );
  assert.ok(
    !shareGetSource.includes("'share.get.failed'") &&
      !shareGetSource.includes("'share.get.invalid'"),
    'share fetch logging should keep invalid and failed outcomes on the canonical share.get event',
  );
  assert.ok(
    clientEventsSource.includes("logRouteOutcome('client.event', start, { ...ctx, ...detailFields });"),
    'client event ingestion should emit one canonical client.event log line per POST',
  );
  assert.ok(
    !clientEventsSource.includes("'client.event.failed'") &&
      !clientEventsSource.includes("'client.event.invalid'"),
    'client event ingestion should keep validation and failure outcomes on the canonical client.event event',
  );
  assert.ok(
    healthSource.includes("logRouteOutcome('health.check', start, ctx);"),
    'health checks should emit one canonical health.check log line per request',
  );
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

test('settings persistence preserves untouched fields and tolerates older schemas', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/api/settings/route.ts'), 'utf8');
  assert.ok(
    source.includes('system_prompt = COALESCE($2, user_settings.system_prompt)'),
    'settings PUT should preserve the existing system prompt when that field was not sent',
  );
  assert.ok(
    source.includes('save_history  = COALESCE($3, user_settings.save_history)'),
    'settings PUT should preserve the existing save_history value when that field was not sent',
  );
  assert.ok(
    source.includes('girl_mode     = COALESCE($5, user_settings.girl_mode)'),
    'settings PUT should preserve the existing girl_mode value when that field was not sent',
  );
  assert.ok(
    source.includes('SELECT system_prompt, save_history, key_jwk FROM user_settings WHERE email = $1'),
    'settings GET should fall back when girl_mode has not been migrated yet',
  );
});

test('page source merges local settings changes before initial settings hydrate completes', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  assert.ok(
    source.includes('const pendingSettingsRef = useRef<PendingSettings>({});'),
    'page should track local settings changes made before the initial fetch finishes',
  );
  assert.ok(
    source.includes('const nextSaveHistory = pending.saveHistory ?? Boolean(sh);'),
    'page should keep a local saveHistory toggle instead of overwriting it with stale server data',
  );
  assert.ok(
    source.includes("const nextGirlMode = pending.girlMode ?? (typeof gm === 'boolean' ? gm : girlModeRef.current);"),
    'page should keep a local girlMode toggle instead of overwriting it with stale server data',
  );
  assert.ok(
    source.includes('pendingPersistRef.current = { ...pendingPersistRef.current, ...overrides };'),
    'page should merge back-to-back settings changes before sending them',
  );
  assert.ok(
    source.includes('const body = JSON.stringify(patch);'),
    'page should send only the accumulated settings fields that actually changed',
  );
});

test('Girl Mode defaults the system prompt to the chatty bestie preset', () => {
  const source = readFileSync(join(import.meta.dirname, '../app/page.tsx'), 'utf8');
  assert.ok(
    source.includes('const FOLLOWUPS_XML_SYSTEM_PROMPT ='),
    'default system prompts should define the shared followup XML instruction',
  );
  assert.ok(
    source.includes('const NORMAL_DEFAULT_SYSTEM_PROMPT = FOLLOWUPS_XML_SYSTEM_PROMPT;'),
    'normal mode should have a built-in default system prompt',
  );
  assert.ok(
    source.includes('const LEGACY_GIRL_MODE_DEFAULT_SYSTEM_PROMPT = ['),
    'Girl Mode should preserve the legacy prompt so existing saved defaults can migrate cleanly',
  );
  assert.ok(
    source.includes('const GIRL_MODE_DEFAULT_SYSTEM_PROMPT = ['),
    'Girl Mode should define a dedicated default system prompt preset',
  );
  assert.ok(
    source.includes("return girlModeEnabled ? GIRL_MODE_DEFAULT_SYSTEM_PROMPT : NORMAL_DEFAULT_SYSTEM_PROMPT;"),
    'the default system prompt helper should swap between the Girl Mode preset and the normal default',
  );
  assert.ok(
    source.includes('prompt === LEGACY_GIRL_MODE_DEFAULT_SYSTEM_PROMPT'),
    'the default system prompt helper should recognize the old Girl Mode default prompt',
  );
  assert.ok(
    source.includes('const nextPrompt = resolveDefaultSystemPrompt(previousPrompt, val);'),
    'toggling Girl Mode should recalculate the default system prompt',
  );
  assert.ok(
    source.includes('IF AND ONLY IF you suggest follow-up topics for conversation'),
    'the default system prompts should instruct the model to emit followups XML only when suggesting follow-up topics',
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

test('encrypt/decrypt: string titles round-trip for history previews', async () => {
  const key = await makeKey();
  const title = 'coffee chat';
  const { iv, ciphertext } = await encrypt(key, title);
  const out = await decrypt<string>(key, iv, ciphertext);
  assert.equal(out, title);
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

test('settings toggle checkboxes are excluded from generic settings input styling', () => {
  const css = readFileSync(join(import.meta.dirname, '../app/globals.css'), 'utf8');
  assert.ok(
    css.includes(".settings-row > input:not([type='checkbox'])"),
    'generic settings row input styling should exclude checkbox toggles',
  );
  assert.ok(
    css.includes('flex: 0 0 auto;'),
    'settings toggle checkboxes should keep their natural width',
  );
});
