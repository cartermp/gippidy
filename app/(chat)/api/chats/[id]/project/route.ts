import { auth } from '@/app/(auth)/auth';
import { getProjectsByChatId, getChatById } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: chatId } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if chat exists and user has permission
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const projectAssociations = await getProjectsByChatId({ chatId });
    const project =
      projectAssociations.length > 0 ? projectAssociations[0] : null;

    return Response.json({ project }, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'get_chat_project',
      'chat.id': chatId,
      'user.id': session.user.id,
    });
    // Return null project instead of error for better UX
    return Response.json({ project: null }, { status: 200 });
  }
}
