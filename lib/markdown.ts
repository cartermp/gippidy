import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';

marked.use(
  markedHighlight({
    langPrefix: 'hljs language-',
    highlight(code, lang) {
      const language = hljs.getLanguage(lang) ? lang : 'plaintext';
      return hljs.highlight(code, { language }).value;
    },
  }),
);

export function renderMarkdown(text: string): string {
  const html = marked.parse(text, { async: false }) as string;
  // Wrap each <pre> in a .code-block and inject a [COPY] button
  return html
    .replace(/<pre>/g,
      `<div class="code-block"><button class="copy-btn" onclick="navigator.clipboard.writeText(this.nextElementSibling.querySelector('code').textContent);this.textContent='[COPIED!]';setTimeout(()=>this.textContent='[COPY]',2000)">[COPY]</button><pre>`)
    .replace(/<\/pre>/g, '</pre></div>');
}
