'use client';

import { useRouter } from 'next/navigation';

type Message = { role: string; content: string; images?: unknown[] };

export default function ForkButton({ messages, model, systemPrompt }: {
  messages: Message[];
  model: string;
  systemPrompt?: string;
}) {
  const router = useRouter();

  const handleFork = () => {
    localStorage.setItem('gippidy-fork', JSON.stringify({ messages, model, systemPrompt }));
    router.push('/');
  };

  return <button onClick={handleFork}>[FORK — CONTINUE]</button>;
}
