export type Attachment = {
  url: string;
  name?: string;
  contentType?: string;
  size?: number;
};

export type TextPart = {
  type: 'text';
  text: string;
};

export type ReasoningPart = {
  type: 'reasoning';
  reasoning: string;
};

export type ToolInvocationPart = {
  type: 'tool-invocation';
  toolInvocation: {
    toolName: string;
    toolCallId: string;
    state: 'call' | 'result';
    args?: Record<string, unknown>;
    result?: unknown;
  };
};

export type MessagePart = TextPart | ReasoningPart | ToolInvocationPart;

export type ChatMessageRole = 'user' | 'assistant' | 'system' | 'tool';

export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  parts: MessagePart[];
  createdAt?: Date | string;
  attachments?: Attachment[];
  experimental_attachments?: Attachment[];
};

export type ChatStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export type ChatInput = {
  role: ChatMessageRole;
  content?: string;
  parts?: MessagePart[];
  experimental_attachments?: Attachment[];
  attachments?: Attachment[];
};
