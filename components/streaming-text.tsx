'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';

import { cn } from '@/lib/utils';
import { Markdown } from './markdown';

interface StreamingTextProps {
  children: string;
  isStreaming: boolean;
  className?: string;
}

export function enqueueIfChanged(queue: string[], nextValue: string) {
  if (queue[queue.length - 1] !== nextValue) {
    queue.push(nextValue);
  }

  return queue;
}

export function resolveFlushValue({
  queue,
  forcedValue,
  lastRendered,
}: {
  queue: string[];
  forcedValue?: string;
  lastRendered: string;
}) {
  const nextValue = forcedValue ?? queue[queue.length - 1];

  if (nextValue === undefined || nextValue === lastRendered) {
    return { nextValue: undefined as string | undefined, remainingQueue: [] };
  }

  return { nextValue, remainingQueue: [] as string[] };
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

const streamingTransitionStyle = `
  .streaming-text-reveal {
    transition: opacity 180ms ease-out;
  }

  .streaming-text-reveal[data-updating='true'] {
    opacity: 0.92;
  }

  @media (prefers-reduced-motion: reduce) {
    .streaming-text-reveal {
      transition: none;
      animation-duration: 0s !important;
    }
  }
`;

const FLUSH_INTERVAL_MS = 48;
const TRANSITION_TIMEOUT_MS = 200;

export function StreamingText({
  children,
  isStreaming,
  className,
}: StreamingTextProps) {
  const [renderedText, setRenderedText] = useState(children);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const queueRef = useRef<string[]>([]);
  const intervalRef = useRef<number | null>(null);
  const transitionTimeoutRef = useRef<number | null>(null);
  const latestRenderedTextRef = useRef(children);
  const wasStreamingRef = useRef(isStreaming);

  const flushQueue = useCallback(
    (forcedValue?: string) => {
      const { nextValue, remainingQueue } = resolveFlushValue({
        forcedValue,
        lastRendered: latestRenderedTextRef.current,
        queue: queueRef.current,
      });

      queueRef.current = remainingQueue;

      if (nextValue === undefined) {
        return;
      }

      latestRenderedTextRef.current = nextValue;
      setRenderedText(nextValue);
      setIsTransitioning(true);

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }

      transitionTimeoutRef.current = window.setTimeout(() => {
        setIsTransitioning(false);
        transitionTimeoutRef.current = null;
      }, TRANSITION_TIMEOUT_MS);
    },
    [],
  );

  useEffect(() => {
    if (wasStreamingRef.current !== isStreaming) {
      wasStreamingRef.current = isStreaming;

      if (isStreaming) {
        queueRef.current = [];
        latestRenderedTextRef.current = '';
        setRenderedText('');
        setIsTransitioning(false);
      }
    }
  }, [isStreaming]);

  useEffect(() => {
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
        transitionTimeoutRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (!isStreaming) {
      flushQueue(children);

      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }

      queueRef.current = [];
      return;
    }

    queueRef.current = enqueueIfChanged(queueRef.current, children);

    if (intervalRef.current === null) {
      intervalRef.current = window.setInterval(() => {
        flushQueue();
      }, FLUSH_INTERVAL_MS);
    }
  }, [children, flushQueue, isStreaming]);

  const animationDuration = useMemo(
    () => `${Math.max(0.5, renderedText.length / 40)}s`,
    [renderedText],
  );

  if (!isStreaming) {
    return (
      <Markdown data-streaming="false" data-testid="streaming-text" className={className}>
        {children}
      </Markdown>
    );
  }

  return (
    <>
      <style>{keyframes + streamingRevealStyle + streamingTransitionStyle}</style>
      <Markdown
        data-streaming="true"
        data-testid="streaming-text"
        data-updating={isTransitioning ? 'true' : 'false'}
        className={cn('streaming-text-reveal', className)}
        style={{
          '--animation-duration': animationDuration,
        } as CSSProperties}
      >
        {renderedText}
      </Markdown>
    </>
  );
}
