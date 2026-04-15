'use client';

import { memo, useMemo } from 'react';
import { renderMarkdown } from '@/lib/markdown';
import { splitMessageFollowups } from '@/lib/chat';

function RenderedMarkdown({
  text,
  html,
  className,
  followupsEnabled = false,
  onFollowup,
}: {
  text?: string;
  html?: string;
  className?: string;
  followupsEnabled?: boolean;
  onFollowup?: (followup: string) => void;
}) {
  const { content, followups } = useMemo(
    () => followupsEnabled ? splitMessageFollowups(text ?? '') : { content: text ?? '', followups: [] },
    [followupsEnabled, text],
  );
  const rendered = useMemo(() => html ?? renderMarkdown(content), [html, content]);

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

  return (
    <div className={className}>
      <div onClick={handleClick} dangerouslySetInnerHTML={{ __html: rendered }} />
      {onFollowup && followups.length > 0 && (
        <div className="followup-list">
          <div className="followup-heading">[FOLLOW-UPS]</div>
          <div className="followup-buttons">
            {followups.map((followup, index) => (
              <button
                key={`${index}-${followup}`}
                type="button"
                className="followup-button"
                data-followup-index={index}
                onClick={() => onFollowup(followup)}
              >
                {followup}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default memo(RenderedMarkdown);
