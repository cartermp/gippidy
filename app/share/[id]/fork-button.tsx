'use client';

import { useRouter } from 'next/navigation';
import { formatUiButtonLabel } from '@/lib/ui-labels';

type Message = { role: string; content: string; images?: unknown[] };

export default function ForkButton({ messages, model, systemPrompt, girlMode }: {
  messages: Message[];
  model: string;
  systemPrompt?: string;
  girlMode: boolean;
}) {
  const router = useRouter();

  const handleFork = () => {
    localStorage.setItem('gippidy-fork', JSON.stringify({ messages, model, systemPrompt, girlMode }));
    router.push('/');
  };

  return <button onClick={handleFork}>{formatUiButtonLabel('FORK — CONTINUE', girlMode)}</button>;
}
