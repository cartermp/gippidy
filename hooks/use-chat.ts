'use client';

import { useCallback, useRef, useState, type FormEvent } from 'react';
import type { ChatInput, ChatMessage, ChatStatus } from '@/lib/chat/types';
import { createTextParts } from '@/lib/chat/messages';
import { fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import type { VisibilityType } from '@/components/visibility-selector';

export type UseChatHelpers = {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: React.Dispatch<React.SetStateAction<string>>;
  status: ChatStatus;
  append: (message: ChatInput) => Promise<void>;
  handleSubmit: (
    event?: FormEvent,
    options?: { experimental_attachments?: ChatInput['experimental_attachments'] },
  ) => Promise<void>;
  stop: () => void;
  reload: () => Promise<void>;
};

export function useChat({
  id,
  initialMessages,
  selectedVisibilityType,
  onFinish,
  onError,
}: {
  id: string;
  initialMessages: ChatMessage[];
  selectedVisibilityType: VisibilityType;
  onFinish?: () => void;
  onError?: (error: unknown) => void;
}): UseChatHelpers {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState('');
  const [status, setStatus] = useState<ChatStatus>('ready');
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async ({ message, addToHistory }: { message: ChatMessage; addToHistory: boolean }) => {
      if (addToHistory) {
        setMessages((prev) => [...prev, message]);
      }

      setStatus('submitted');
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetchWithErrorHandlers('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id,
            message,
            selectedVisibilityType,
          }),
          signal: controller.signal,
        });

        const data = await response.json();

        if (data?.assistantMessage) {
          setMessages((prev) => [...prev, data.assistantMessage]);
        }

        setStatus('ready');
        onFinish?.();
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          setStatus('ready');
          return;
        }

        setStatus('ready');
        onError?.(error);
      } finally {
        abortControllerRef.current = null;
      }
    },
    [id, onError, onFinish, selectedVisibilityType],
  );

  const append = useCallback(
    async (messageInput: ChatInput) => {
      const parts = messageInput.parts ?? createTextParts(messageInput.content ?? '');
      const attachments =
        messageInput.experimental_attachments ?? messageInput.attachments ?? [];

      const message: ChatMessage = {
        id: generateUUID(),
        role: messageInput.role,
        parts,
        createdAt: new Date(),
        experimental_attachments: attachments,
        attachments,
      };

      if (messageInput.role === 'user') {
        await sendMessage({ message, addToHistory: true });
        return;
      }

      setMessages((prev) => [...prev, message]);
    },
    [sendMessage],
  );

  const handleSubmit = useCallback(
    async (
      event?: FormEvent,
      options?: { experimental_attachments?: ChatInput['experimental_attachments'] },
    ) => {
      event?.preventDefault();

      if (!input.trim()) {
        return;
      }

      const message: ChatMessage = {
        id: generateUUID(),
        role: 'user',
        parts: createTextParts(input),
        createdAt: new Date(),
        experimental_attachments: options?.experimental_attachments ?? [],
        attachments: options?.experimental_attachments ?? [],
      };

      setInput('');
      await sendMessage({ message, addToHistory: true });
    },
    [input, sendMessage],
  );

  const stop = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
  }, []);

  const reload = useCallback(async () => {
    const lastUserMessage = [...messages].reverse().find((message) => message.role === 'user');

    if (!lastUserMessage) {
      return;
    }

    await sendMessage({ message: lastUserMessage, addToHistory: false });
  }, [messages, sendMessage]);

  return {
    messages,
    setMessages,
    input,
    setInput,
    status,
    append,
    handleSubmit,
    stop,
    reload,
  };
}
