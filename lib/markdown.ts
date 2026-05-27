import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js/lib/common';

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        return hljs.highlight(code, { language: lang }).value;
      }
      return hljs.highlightAuto(code).value;
    },
  }),
);

marked.use({
  renderer: {
    // Escape raw HTML from model output instead of rendering it.
    // This blocks <script>, <img onerror=...>, and similar injection vectors.
    // Markdown-generated tags (e.g. <strong>, <code>) are unaffected.
    html({ text }) {
      return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    },
  },

  // Neutralize unsafe URLs in links and images before rendering.
  walkTokens(token) {
    if ((token.type === 'link' || token.type === 'image') && token.href) {
      const href = token.href.trim();
      if (!/^(?:https?:|mailto:|\/|#|\?|\.\.?\/)/i.test(href)) token.href = '#';
    }
  },
});

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function renderMarkdown(text: string, copyLabel = '[COPY]'): string {
  const html = marked.parse(text, { async: false }) as string;
  // Wrap each <pre> in a .code-block and inject a [COPY] button
  const safeCopyLabel = escapeHtml(copyLabel);
  return html
    .replace(/<pre>/g,
      `<div class="code-block"><button class="copy-btn" type="button" data-copy-code>${safeCopyLabel}</button><pre>`)
    .replace(/<\/pre>/g, '</pre></div>');
}
