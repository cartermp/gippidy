import { auth } from '@/app/(auth)/auth';
import { saveChat } from '@/lib/db/queries';
import { ChatSDKError } from '@/lib/errors';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';
import { z } from 'zod';

const createChatSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(255).optional().default('New Chat'),
  visibility: z.enum(['public', 'private']).default('private'),
});

export async function POST(request: Request) {
  const session = await auth();

  if (!session?.user) {
    return new ChatSDKError('unauthorized:api').toResponse();
  }

  let requestBody: z.infer<typeof createChatSchema>;
  try {
    const json = await request.json();
    requestBody = createChatSchema.parse(json);
  } catch (error) {
    return new ChatSDKError(
      'bad_request:api',
      'Invalid request body format',
    ).toResponse();
  }

  const { id, title, visibility } = requestBody;

  try {
    await saveChat({
      id,
      userId: session.user.id,
      title,
      visibility,
    });

    return Response.json({ id, title, visibility }, { status: 201 });
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'create_chat',
      'chat.id': id,
      'user.id': session.user.id,
    });
    throw error;
  }
}
