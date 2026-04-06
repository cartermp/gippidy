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

  // Neutralize javascript: and data: URLs in links and images before rendering.
  walkTokens(token) {
    if ((token.type === 'link' || token.type === 'image') && token.href) {
      if (/^(?:javascript:|data:text\/html)/i.test(token.href.trim())) token.href = '#';
    }
  },
});

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  // Wrap each <pre> in a .code-block and inject a [COPY] button
  return html
    .replace(/<pre>/g,
      `<div class="code-block"><button class="copy-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.querySelector('code').textContent);this.textContent='[COPIED!]';setTimeout(()=>this.textContent='[COPY]',2000)">[COPY]</button><pre>`)
    .replace(/<\/pre>/g, '</pre></div>');
}
