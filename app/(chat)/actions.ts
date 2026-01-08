'use server';

import type { ChatMessage } from '@/lib/chat/types';
import { getMessageText } from '@/lib/chat/messages';
import {
  deleteMessagesByChatIdAfterTimestamp,
  getMessageById,
  updateChatVisiblityById,
} from '@/lib/db/queries';
import type { VisibilityType } from '@/components/visibility-selector';

export async function generateTitleFromUserMessage({
  message,
}: {
  message: ChatMessage;
}) {
  const text = getMessageText(message);
  if (!text) {
    return 'New chat';
  }

  return text.length > 80 ? `${text.slice(0, 77)}...` : text;
}

export async function deleteTrailingMessages({ id }: { id: string }) {
  const [message] = await getMessageById({ id });

  await deleteMessagesByChatIdAfterTimestamp({
    chatId: message.chatId,
    timestamp: message.createdAt,
  });
}

export async function updateChatVisibility({
  chatId,
  visibility,
}: {
  chatId: string;
  visibility: VisibilityType;
}) {
  await updateChatVisiblityById({ chatId, visibility });
}
