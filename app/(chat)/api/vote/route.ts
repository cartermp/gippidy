import { auth } from '@/app/(auth)/auth';
import { getChatById, getVotesByChatId, voteMessage } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter chatId is required.',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:vote').toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError('not_found:chat').toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:vote').toResponse();
  }

  try {
    const votes = await getVotesByChatId({ id: chatId });

    return Response.json(votes, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      'operation': 'get_votes',
      'chat.id': chatId,
    });
    throw error;
  }
}

export async function PATCH(request: Request) {
  const {
    chatId,
    messageId,
    type,
  }: { chatId: string; messageId: string; type: 'up' | 'down' } =
    await request.json();

  if (!chatId || !messageId || !type) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameters chatId, messageId, and type are required.',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:vote').toResponse();
  }

  const chat = await getChatById({ id: chatId });

  if (!chat) {
    return new ChatSDKError('not_found:vote').toResponse();
  }

  if (chat.userId !== session.user.id) {
    return new ChatSDKError('forbidden:vote').toResponse();
  }

  try {
    await voteMessage({
      chatId,
      messageId,
      type: type,
    });

    return new Response('Message voted', { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      'operation': 'vote_message',
      'chat.id': chatId,
      'message.id': messageId,
      'vote.type': type,
    });
    throw error;
  }
}
