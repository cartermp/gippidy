import {
  appendClientMessage,
  appendResponseMessages,
  createDataStream,
  smoothStream,
  streamText,
} from 'ai';
import { auth } from '@/app/(auth)/auth';
import { type RequestHints, systemPrompt } from '@/lib/ai/prompts';
import {
  createStreamId,
  deleteChatById,
  getChatById,
  getMessageCountByUserId,
  getMessagesByChatId,
  getStreamIdsByChatId,
  saveChat,
  saveMessages,
} from '@/lib/db/queries';
import { generateUUID, getTrailingMessageId } from '@/lib/utils';
import { generateTitleFromUserMessage } from '../../actions';
import { createDocument } from '@/lib/ai/tools/create-document';
import { updateDocument } from '@/lib/ai/tools/update-document';
import { requestSuggestions } from '@/lib/ai/tools/request-suggestions';
import { getWeather } from '@/lib/ai/tools/get-weather';
import { isProductionEnvironment } from '@/lib/constants';
import { myProvider } from '@/lib/ai/providers';
import { userEntitlements } from '@/lib/ai/entitlements';
import { postRequestBodySchema, type PostRequestBody } from './schema';
import { geolocation } from '@vercel/functions';
import {
  createResumableStreamContext,
  type ResumableStreamContext,
} from 'resumable-stream';
import { after } from 'next/server';
import type { Chat } from '@/lib/db/schema';
import { differenceInSeconds } from 'date-fns';
import { ChatSDKError } from '@/lib/errors';
import { createChatSpan, recordError } from '@/lib/telemetry';

export const maxDuration = 60;

let globalStreamContext: ResumableStreamContext | null = null;

function getStreamContext() {
  if (!globalStreamContext) {
    try {
      globalStreamContext = createResumableStreamContext({
        waitUntil: after,
      });
    } catch (error: any) {
      if (error.message.includes('REDIS_URL')) {
        console.log(
          ' > Resumable streams are disabled due to missing REDIS_URL',
        );
      } else {
        console.error(error);
      }
    }
  }

  return globalStreamContext;
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
    const { id, message, selectedChatModel, selectedVisibilityType } =
      requestBody;

    // Set initial span attributes
    chatSpan.setAttributes({
      'app.chat.id': id,
      'app.chat.model': selectedChatModel,
      'app.chat.visibility': selectedVisibilityType,
    });

    const session = await auth();

    if (!session?.user) {
      chatSpan.setAttribute('app.auth.unauthorized', true);
      const err = new ChatSDKError('unauthorized:chat');
      recordError(chatSpan, err)
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
      'app.user.entitlement_limit': userEntitlements.maxMessagesPerDay,
    });

    if (messageCount > userEntitlements.maxMessagesPerDay) {
      chatSpan.setAttributes({
        'app.user.is_rate_limited': true,
        'app.user.message_count_24h': messageCount,
        'app.user.entitlement_limit': userEntitlements.maxMessagesPerDay,
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
    } else {
      if (chat.userId !== session.user.id) {
        chatSpan.setAttributes({
          'app.auth.forbidden': true
        })
        chatSpan.end();
        return new ChatSDKError('forbidden:chat').toResponse();
      }
    }

    const previousMessages = await getMessagesByChatId({ id });

    const messages = appendClientMessage({
      // @ts-expect-error: todo add type conversion from DBMessage[] to UIMessage[]
      messages: previousMessages,
      message,
    });

    const { longitude, latitude, city, country } = geolocation(request);

    const requestHints: RequestHints = {
      longitude,
      latitude,
      city,
      country,
    };

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

    const streamId = generateUUID();
    await createStreamId({ streamId, chatId: id });

    // Extract user message text from parts
    const userContent = message.parts || [];
    const userText = userContent
        .filter(part => part.type === 'text')
        .map(part => part.text)
        .join(' ');

    chatSpan.setAttributes({
      'app.ai.tools.active': [
        'getWeather',
        'createDocument',
        'updateDocument',
        'requestSuggestions',
      ],
      'app.ai.response.streaming': true,
      'app.stream.id': streamId,
      'app.ai.model.input.messages_count': messages.length,
      'app.ai.model.input.system_prompt': systemPrompt({ selectedChatModel, requestHints }),
      'app.ai.model.input.user_message': userText,
    });

    const stream = createDataStream({
      execute: (dataStream) => {
        const result = streamText({
            experimental_activeTools: [
                'getWeather',
                'createDocument',
                'updateDocument',
                'requestSuggestions',
            ],
            experimental_generateMessageId: generateUUID,
            experimental_telemetry: {
                isEnabled: isProductionEnvironment,
                functionId: 'stream-text',
            },
            experimental_transform: smoothStream({chunking: 'word'}),
            maxSteps: 5,
            messages,
            model: myProvider.languageModel(selectedChatModel),
            onFinish: async ({response, usage, finishReason, toolCalls}) => {
                // Record AI completion metrics and full I/O
                const assistantMessages = response.messages.filter(m => m.role === 'assistant');
                const lastAssistantMessage = assistantMessages[assistantMessages.length - 1];

                // Extract text content from parts
                const responseContent = lastAssistantMessage?.content;
                const responseText = typeof responseContent === 'string'
                    ? responseContent
                    : Array.isArray(responseContent)
                        ? responseContent
                            .filter(part => part.type === 'text')
                            .map(part => part.text)
                            .join(' ')
                        : '';

                chatSpan.setAttributes({
                    'app.ai.response.finish_reason': finishReason || 'unknown',
                    'app.ai.response.tokens.total': usage?.totalTokens || 0,
                    'app.ai.response.tokens.prompt': usage?.promptTokens || 0,
                    'app.ai.response.tokens.completion': usage?.completionTokens || 0,
                    'app.ai.tools.called': toolCalls?.map(tc => tc.toolName) || [],
                    'app.ai.tools.called_count': toolCalls?.length || 0,
                    'app.ai.response.messages_count': assistantMessages.length,
                    'app.ai.response.content': responseText,
                });

                // End the span here after completion
                chatSpan.end();

                if (session.user?.id) {
                    try {
                        const assistantId = getTrailingMessageId({
                            messages: response.messages.filter(
                                (message) => message.role === 'assistant',
                            ),
                        });

                        if (!assistantId) {
                            throw new Error('No assistant message found!');
                        }

                        const [, assistantMessage] = appendResponseMessages({
                            messages: [message],
                            responseMessages: response.messages,
                        });

                        await saveMessages({
                            messages: [
                                {
                                    id: assistantId,
                                    chatId: id,
                                    role: assistantMessage.role,
                                    parts: assistantMessage.parts,
                                    attachments:
                                        assistantMessage.experimental_attachments ?? [],
                                    createdAt: new Date(),
                                },
                            ],
                        });

                        chatSpan.setAttributes({
                            'app.message.id': assistantId,
                            'app.message.role': 'assistant',
                        })
                    } catch (error) {
                        recordError(chatSpan, error as Error, {
                            'error.context': 'save_assistant_message',
                        });
                        console.error('Failed to save chat');
                    }
                }
            },
            system: systemPrompt({selectedChatModel, requestHints}),
            tools: {
                getWeather,
                createDocument: createDocument({session, dataStream}),
                updateDocument: updateDocument({session, dataStream}),
                requestSuggestions: requestSuggestions({
                    session,
                    dataStream,
                }),
            },
        });

        result.consumeStream();

        result.mergeIntoDataStream(dataStream, {
          sendReasoning: true,
        });
      },
      onError: (error) => {
        recordError(chatSpan, error as Error, {
          'app.error.context': 'ai_streaming',
        });
        chatSpan.end();
        return 'Oops, an error occurred!';
      },
    });

    const streamContext = getStreamContext();

    chatSpan.setAttributes({
      'stream.resumable': !!streamContext,
    });

    if (streamContext) {
      return new Response(
        await streamContext.resumableStream(streamId, () => stream),
      );
    } else {
      return new Response(stream);
    }
  } catch (error) {
    recordError(chatSpan, error as Error, {
      'app.error.context': 'chat_request',
      'app.chat.id': requestBody?.id || 'unknown',
    });
    chatSpan.end();

    if (error instanceof ChatSDKError) {
      return error.toResponse();
    }

    return new ChatSDKError('internal_server_error:chat').toResponse();
  }
}

export async function GET(request: Request) {
  const streamContext = getStreamContext();
  const resumeRequestedAt = new Date();

  if (!streamContext) {
    return new Response(null, { status: 204 });
  }

  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError('bad_request:api').toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:chat').toResponse();
  }

  let chat: Chat;

  try {
    chat = await getChatById({ id: chatId });
  } catch {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.visibility === 'private' && chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:chat').toResponse();
  }

  const streamIds = await getStreamIdsByChatId({ chatId });

  if (!streamIds.length) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const recentStreamId = streamIds.at(-1);

  if (!recentStreamId) {
    return new ChatSDKError('not_found:stream').toResponse();
  }

  const emptyDataStream = createDataStream({
    execute: () => {},
  });

  const stream = await streamContext.resumableStream(
    recentStreamId,
    () => emptyDataStream,
  );

  /*
   * For when the generation is streaming during SSR
   * but the resumable stream has concluded at this point.
   */
  if (!stream) {
    const messages = await getMessagesByChatId({ id: chatId });
    const mostRecentMessage = messages.at(-1);

    if (!mostRecentMessage) {
      return new Response(emptyDataStream, { status: 200 });
    }

    if (mostRecentMessage.role !== 'assistant') {
      return new Response(emptyDataStream, { status: 200 });
    }

    const messageCreatedAt = new Date(mostRecentMessage.createdAt);

    if (differenceInSeconds(resumeRequestedAt, messageCreatedAt) > 15) {
      return new Response(emptyDataStream, { status: 200 });
    }

    const restoredStream = createDataStream({
      execute: (buffer) => {
        buffer.writeData({
          type: 'append-message',
          message: JSON.stringify(mostRecentMessage),
        });
      },
    });

    return new Response(restoredStream, { status: 200 });
  }

  return new Response(stream, { status: 200 });
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
