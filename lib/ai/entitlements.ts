import type { ChatModel } from './models';

interface Entitlements {
  maxMessagesPerDay: number;
  availableChatModelIds: Array<ChatModel['id']>;
}

// All authenticated users get the same entitlements
export const userEntitlements: Entitlements = {
  maxMessagesPerDay: 100_000,
  availableChatModelIds: ['chat-model', 'chat-model-reasoning'],
};
