'use client';

import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

interface StreamingTextProps {
  children: string;
  isStreaming: boolean;
  className?: string;
}

const keyframes = `
  @keyframes text-reveal {
    from {
      background-size: 0% 100%;
    }
    to {
      background-size: 100% 100%;
    }
  }
`;

const streamingRevealStyle = `
  .streaming-text-reveal.prose {
    /* Use the --prose-body variable from Tailwind Typography for the text color */
    --text-color: var(--prose-body);
    color: transparent !important; /* Override prose color to make it transparent */
    background: linear-gradient(to right, var(--text-color), var(--text-color));
    background-repeat: no-repeat;
    background-clip: text;
    -webkit-background-clip: text;
    background-size: 0% 100%;
    animation: text-reveal linear forwards;
    animation-duration: var(--animation-duration);
  }
`;

export function StreamingText({
  children,
  isStreaming,
  className,
}: StreamingTextProps) {
  // Estimate duration based on a reading speed of ~400 words per minute
  // Average word length is ~5 chars, so ~2000 chars per minute or ~33 chars per second.
  // We'll use a slightly faster rate for a better feel.
  const animationDuration = `${Math.max(0.5, children.length / 40)}s`;

  if (!isStreaming) {
    return <Markdown>{children}</Markdown>;
  }

  return (
    <>
      <style>{keyframes + streamingRevealStyle}</style>
      <Markdown
        className={cn('streaming-text-reveal', className)}
        style={
          {
            '--animation-duration': animationDuration,
          } as React.CSSProperties
        }
      >
        {children}
      </Markdown>
    </>
  );
}
