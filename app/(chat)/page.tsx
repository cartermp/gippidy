import { Chat } from '@/components/chat';
import { DEFAULT_CHAT_MODEL } from '@/lib/chat/constants';
import { generateUUID } from '@/lib/utils';
import { auth } from '../(auth)/auth';
import { redirect } from 'next/navigation';

export default async function Page() {
  const session = await auth();

  if (!session) {
    redirect('/login');
  }

  const id = generateUUID();

  return (
    <Chat
      key={id}
      id={id}
      initialMessages={[]}
      initialChatModel={DEFAULT_CHAT_MODEL}
      initialVisibilityType="private"
      isReadonly={false}
      session={session}
      autoResume={false}
    />
  );
}
