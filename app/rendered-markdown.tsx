'use client';

import { memo, useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';

function RenderedMarkdown({
  text,
  html,
  className,
}: {
  text?: string;
  html?: string;
  className?: string;
}) {
  const rendered = useMemo(() => html ?? renderMarkdown(text ?? ''), [html, text]);

  const handleClick = async (event: React.MouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-copy-code]');
    if (!button) return;
    const code = button.nextElementSibling?.querySelector('code')?.textContent ?? '';
    if (!code) return;
    await navigator.clipboard.writeText(code);
    button.textContent = '[COPIED!]';
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = '[COPY]';
    }, 2000);
  };

  return <div className={className} onClick={handleClick} dangerouslySetInnerHTML={{ __html: rendered }} />;
}

export default memo(RenderedMarkdown);
