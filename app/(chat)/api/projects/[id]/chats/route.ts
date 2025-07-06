import { auth } from '@/app/(auth)/auth';
import {
  addChatToProject,
  removeChatFromProject,
  getChatsByProject,
  getProjectById,
  getChatById,
} from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { z } from 'zod';

const addChatSchema = z.object({
  chatId: z.string().uuid(),
});

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const chats = await getChatsByProject({ projectId });
    return Response.json(chats, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'get_chats_by_project',
      'project.id': projectId,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof addChatSchema>;
  try {
    const json = await request.json();
    requestBody = addChatSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { chatId } = requestBody;

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    // Check if chat exists and user owns it
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [projectChatAssociation] = await addChatToProject({
      projectId,
      chatId,
    });

    return Response.json(projectChatAssociation, { status: 201 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'add_chat_to_project',
      'project.id': projectId,
      'chat.id': chatId,
      'user.id': session.user.id,
    });
    throw error;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const { searchParams } = new URL(request.url);
  const chatId = searchParams.get('chatId');

  if (!chatId) {
    return new ChatSDKError(
      'bad_request:api',
      'Parameter chatId is required',
    ).toResponse();
  }

  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  try {
    // Check if project exists and user has permission
    const project = await getProjectById({ id: projectId });

    if (!project) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (project.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    // Check if chat exists and user owns it
    const chat = await getChatById({ id: chatId });

    if (!chat) {
      return new ChatSDKError('not_found:api').toResponse();
    }

    if (chat.userId !== session.user.id) {
      return new ChatSDKError('forbidden:api').toResponse();
    }

    const [removedAssociation] = await removeChatFromProject({
      projectId,
      chatId,
    });

    return Response.json(removedAssociation, { status: 200 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'remove_chat_from_project',
      'project.id': projectId,
      'chat.id': chatId,
      'user.id': session.user.id,
    });
    throw error;
  }
}
