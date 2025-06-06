'use client';

import { useEffect, useRef, useState } from 'react';
import { Markdown } from './markdown';

interface StreamingTextProps {
  children: string;
  isStreaming: boolean;
}

export function StreamingText({ children, isStreaming }: StreamingTextProps) {
  const [displayedText, setDisplayedText] = useState('');
  const animationRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (!isStreaming) {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
        animationRef.current = undefined;
      }
      setDisplayedText(children);
      return;
    }

    // Simple test: just add one character every 100ms
    if (displayedText.length < children.length && !animationRef.current) {
      const animate = () => {
        setDisplayedText((current) => {
          if (current.length < children.length) {
            const newText = children.slice(0, current.length + 1);
            return newText;
          }
          return current;
        });

        // Schedule next frame
        setDisplayedText((current) => {
          if (current.length < children.length) {
            animationRef.current = setTimeout(() => {
              animationRef.current = undefined;
              animate();
            }, 100);
          } else {
            animationRef.current = undefined;
          }
          return current;
        });
      };

      animate();
    }
  }, [children, isStreaming, displayedText.length]);

  useEffect(() => {
    return () => {
      if (animationRef.current) {
        clearTimeout(animationRef.current);
      }
    };
  }, []);

  return (
    <div className="relative">
      <Markdown>{displayedText}</Markdown>
    </div>
  );
}
