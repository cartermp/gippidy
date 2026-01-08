import type { ChatMessage, MessagePart } from './types';

export function createTextParts(text: string): MessagePart[] {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }

  return [{ type: 'text', text: trimmed }];
}

export function getPartsText(parts: MessagePart[] | undefined): string {
  if (!parts || parts.length === 0) {
    return '';
  }

  return parts
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join(' ')
    .trim();
}

export function getMessageText(message: ChatMessage): string {
  return getPartsText(message.parts);
}
