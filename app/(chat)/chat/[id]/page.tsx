import { notFound, redirect } from 'next/navigation';

import { auth } from '@/app/(auth)/auth';
import { Chat } from '@/components/chat';
import {
  getChatById,
  getMessagesByChatId,
  getProjectsByChatId,
} from '@/lib/db/queries';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat/constants';
import type { DBMessage } from '@/lib/db/schema';
import type { Attachment, ChatMessage } from '@/lib/chat/types';

export default async function Page(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const { id } = params;
  const chat = await getChatById({ id });

  if (!chat) {
    notFound();
  }

  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  if (chat.visibility === 'private') {
    if (!session.user) {
      return notFound();
    }

    if (session.user.id !== chat.userId) {
      return notFound();
    }
  }

  const messagesFromDb = await getMessagesByChatId({
    id,
  });

  // Get project associations for this chat
  const projectAssociations = await getProjectsByChatId({ chatId: id });
  const project =
    projectAssociations.length > 0 ? projectAssociations[0] : null;

  function convertToUIMessages(
    messages: Array<DBMessage>,
  ): Array<ChatMessage> {
    return messages.map((message) => ({
      id: message.id,
      parts: message.parts as ChatMessage['parts'],
      role: message.role as ChatMessage['role'],
      createdAt: message.createdAt,
      attachments: (message.attachments as Array<Attachment>) ?? [],
    }));
  }

  return (
    <Chat
      id={chat.id}
      initialMessages={convertToUIMessages(messagesFromDb)}
      initialChatModel={DEFAULT_CHAT_MODEL}
      initialVisibilityType={chat.visibility}
      isReadonly={session?.user?.id !== chat.userId}
      session={session}
      autoResume={true}
      project={project}
    />
  );
}
