import { cache } from 'react';
import type { Message } from './chat';
import { query } from './db';

export type SharedChat = {
  id: string;
  model: string;
  system_prompt: string | null;
  girl_mode: boolean;
  messages: Message[];
  created_at: string;
};

export const getSharedChat = cache(async (id: string): Promise<SharedChat | null> => {
  const result = await query(
    'SELECT id, model, system_prompt, girl_mode, messages, created_at FROM shared_chats WHERE id = $1',
    [id],
  );
  return (result.rows[0] as SharedChat | undefined) ?? null;
});
