import { auth } from '@/app/(auth)/auth';
import { generateTitleFromUserMessage } from '../../actions';
import {
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID } from '@/lib/utils';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { ChatSDKError } from '@/lib/errors';
import {
  createChatSpan,
  recordError,
  recordErrorOnCurrentSpan,
} from '@/lib/telemetry';
import { createTextParts, getMessageText } from '@/lib/chat/messages';
import { chatEntitlements } from '@/lib/chat/entitlements';

export const maxDuration = 60;

function buildAssistantReply({
  message,
}: {
  message: PostRequestBody['message'];
}): string {
  const userText = getMessageText(message);
  const attachmentCount = message.experimental_attachments?.length ?? 0;

  const acknowledgements = [
    'Message saved.',
    userText ? `You said: "${userText}"` : 'You sent a new message.',
  ];

  if (attachmentCount > 0) {
    acknowledgements.push(
      `Attachments received: ${attachmentCount} file${
        attachmentCount === 1 ? '' : 's'
      }.`,
    );
  }

  return acknowledgements.join(' ');
}

export async function POST(request: Request) {
  const chatSpan = createChatSpan('app.ChatRequest');

  let requestBody: PostRequestBody;

  try {
    const json = await request.json();
    requestBody = postRequestBodySchema.parse(json);
  } catch (error) {
    recordError(chatSpan, new Error('Invalid request body'));
    chatSpan.end();
    return new ChatSDKError('bad_request:api').toResponse();
  }

  try {
    const { id, message, selectedVisibilityType } = requestBody;

    chatSpan.setAttributes({
      'app.chat.id': id,
      'app.chat.visibility': selectedVisibilityType,
    });

    const session = await auth();

    if (!session?.user) {
      chatSpan.setAttribute('app.auth.unauthorized', true);
      const err = new ChatSDKError('unauthorized:chat');
      recordError(chatSpan, err);
      chatSpan.end();
      return err.toResponse();
    }

    const messageCount = await getMessageCountByUserId({
      id: session.user.id,
      differenceInHours: 24,
    });

    chatSpan.setAttributes({
      'app.user.id': session.user.id,
      'app.user.message_count_24h': messageCount,
      'app.user.entitlement_limit': chatEntitlements.maxMessagesPerDay,
    });

    if (messageCount > chatEntitlements.maxMessagesPerDay) {
      chatSpan.setAttributes({
        'app.user.is_rate_limited': true,
        'app.user.message_count_24h': messageCount,
        'app.user.entitlement_limit': chatEntitlements.maxMessagesPerDay,
      });
      chatSpan.end();
      return new ChatSDKError('rate_limit:chat').toResponse();
    }

    const chat = await getChatById({ id });
    const isNewChat = !chat;

    chatSpan.setAttributes({
      'app.chat.is_new_chat': isNewChat,
    });

    if (!chat) {
      const title = await generateTitleFromUserMessage({
        message,
      });

      await saveChat({
        id,
        userId: session.user.id,
        title,
        visibility: selectedVisibilityType,
      });
    } else if (chat.userId !== session.user.id) {
      chatSpan.setAttributes({
        'app.auth.forbidden': true,
      });
      chatSpan.end();
      return new ChatSDKError('forbidden:chat').toResponse();
    }

    await saveMessages({
      messages: [
        {
          chatId: id,
          id: message.id,
          role: 'user',
          parts: message.parts,
          attachments: message.experimental_attachments ?? [],
          createdAt: new Date(),
        },
      ],
    });

    const assistantMessageId = generateUUID();
    const assistantText = buildAssistantReply({ message });

    const assistantMessage = {
      id: assistantMessageId,
      role: 'assistant',
      parts: createTextParts(assistantText),
      createdAt: new Date(),
      attachments: [],
    };

    await saveMessages({
      messages: [
        {
          id: assistantMessageId,
          chatId: id,
          role: 'assistant',
          parts: assistantMessage.parts,
          attachments: [],
          createdAt: assistantMessage.createdAt,
        },
      ],
    });

    chatSpan.setAttributes({
      'app.message.id': assistantMessageId,
      'app.message.role': 'assistant',
      'app.ai.response.content': assistantText,
    });

    chatSpan.end();

    return Response.json({ assistantMessage }, { status: 200 });
  } catch (error) {
    recordError(chatSpan, error as Error, {
      'app.error.context': 'chat_request',
      'app.chat.id': requestBody?.id || 'unknown',
    });
    chatSpan.end();

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    recordErrorOnCurrentSpan(error as Error, {
      operation: 'chat_request',
    });

    return new ChatSDKError('internal_server_error:chat').toResponse();
  }
}

export async function GET() {
  return new Response(null, { status: 204 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  const chat = await getChatById({ id });

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const deletedChat = await deleteChatById({ id });

  return Response.json(deletedChat, { status: 200 });
}
