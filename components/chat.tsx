'use client';

import type { Attachment, UIMessage } from 'ai';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { ChatHeader } from '@/components/chat-header';
import type { Vote, Project } from '@/lib/db/schema';
import { fetcher, fetchWithErrorHandlers, generateUUID } from '@/lib/utils';
import { Artifact } from './artifact';
import { MultimodalInput } from './multimodal-input';
import { Messages } from './messages';
import type { VisibilityType } from './visibility-selector';
import { useArtifactSelector } from '@/hooks/use-artifact';
import { unstable_serialize } from 'swr/infinite';
import { getChatHistoryPaginationKey } from './sidebar-history';
import { toast } from './toast';
import type { Session } from 'next-auth';
import { useSearchParams } from 'next/navigation';
import { useChatVisibility } from '@/hooks/use-chat-visibility';
import { useAutoResume } from '@/hooks/use-auto-resume';
import { ChatSDKError } from '@/lib/errors';

export function Chat({
  id,
  initialMessages,
  initialChatModel,
  initialVisibilityType,
  isReadonly,
  session,
  autoResume,
  project,
}: {
  id: string;
  initialMessages: Array<UIMessage>;
  initialChatModel: string;
  initialVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  autoResume: boolean;
  project?: Project | null;
}) {
  const { mutate } = useSWRConfig();

  const { visibilityType } = useChatVisibility({
    chatId: id,
    initialVisibilityType,
  });

  const {
    messages,
    setMessages,
    handleSubmit,
    input,
    setInput,
    append,
    status,
    stop,
    reload,
    experimental_resume,
    data,
  } = useChat({
    id,
    initialMessages,
    experimental_throttle: 100,
    sendExtraMessageFields: true,
    generateId: generateUUID,
    fetch: fetchWithErrorHandlers,
    experimental_prepareRequestBody: (body) => ({
      id,
      message: body.messages.at(-1),
      selectedChatModel: initialChatModel,
      selectedVisibilityType: visibilityType,
    }),
    onFinish: () => {
      mutate(unstable_serialize(getChatHistoryPaginationKey));
    },
    onError: (error) => {
      if (error instanceof ChatSDKError) {
        toast({
          type: 'error',
          description: error.message,
        });
      }
    },
  });

  const searchParams = useSearchParams();
  const query = searchParams.get('query');

  const [hasAppendedQuery, setHasAppendedQuery] = useState(false);

  useEffect(() => {
    if (query && !hasAppendedQuery) {
      append({
        role: 'user',
        content: query,
      });

      setHasAppendedQuery(true);
      window.history.replaceState({}, '', `/chat/${id}`);
    }
  }, [query, append, hasAppendedQuery, id]);

  const { data: votes } = useSWR<Array<Vote>>(
    messages.length >= 2 ? `/api/vote?chatId=${id}` : null,
    fetcher,
  );

  const [attachments, setAttachments] = useState<Array<Attachment>>([]);
  const isArtifactVisible = useArtifactSelector((state) => state.isVisible);

  useAutoResume({
    autoResume,
    initialMessages,
    experimental_resume,
    data,
    setMessages,
  });

  return (
    <>
      <div className="relative flex min-w-0 h-dvh flex-col overflow-hidden px-4 pb-8 md:px-10">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="absolute -left-20 top-[-6rem] size-72 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--primary)/0.16),transparent_55%)] blur-3xl opacity-70" />
          <div className="absolute bottom-[-8rem] right-[-4rem] size-80 rounded-full bg-[radial-gradient(circle_at_center,hsl(var(--accent)/0.12),transparent_50%)] blur-3xl opacity-70" />
          <div className="absolute inset-x-6 top-0 h-28 rounded-b-[3rem] bg-gradient-to-b from-primary/10 via-primary/5 to-transparent dark:from-primary/15 dark:via-primary/10" />
        </div>

        <div className="relative z-10 mx-auto flex h-full w-full max-w-6xl flex-col gap-4">
          <div className="rounded-3xl border border-border/60 bg-card/70 px-3 py-2 shadow-[0_10px_40px_-30px_hsl(var(--foreground)/0.5)] ring-1 ring-primary/5 backdrop-blur-md">
            <ChatHeader
              chatId={id}
              selectedModelId={initialChatModel}
              selectedVisibilityType={initialVisibilityType}
              isReadonly={isReadonly}
              session={session}
              project={project}
            />
          </div>

          <div className="flex min-h-0 flex-1 flex-col gap-4 rounded-3xl border border-border/70 bg-card/80 p-3 shadow-[0_25px_80px_-45px_hsl(var(--foreground)/0.4)] ring-1 ring-border/60 backdrop-blur-xl md:p-6">
            <div className="flex min-h-0 flex-1 rounded-2xl bg-gradient-to-b from-background/40 to-background/70 p-2 md:p-3">
              <Messages
                chatId={id}
                status={status}
                votes={votes}
                messages={messages}
                setMessages={setMessages}
                reload={reload}
                isReadonly={isReadonly}
                isArtifactVisible={isArtifactVisible}
                selectedChatModel={initialChatModel}
              />
            </div>

            <form className="flex flex-col gap-3 rounded-2xl border border-border/60 bg-background/80 p-3 shadow-inner ring-1 ring-primary/5 transition focus-within:ring-primary/25 md:flex-row md:p-4">
              {!isReadonly && (
                <MultimodalInput
                  chatId={id}
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleSubmit}
                  status={status}
                  stop={stop}
                  attachments={attachments}
                  setAttachments={setAttachments}
                  messages={messages}
                  setMessages={setMessages}
                  append={append}
                  selectedVisibilityType={visibilityType}
                />
              )}
            </form>
          </div>
        </div>
      </div>

      <Artifact
        chatId={id}
        input={input}
        setInput={setInput}
        handleSubmit={handleSubmit}
        status={status}
        stop={stop}
        attachments={attachments}
        setAttachments={setAttachments}
        append={append}
        messages={messages}
        setMessages={setMessages}
        reload={reload}
        votes={votes}
        isReadonly={isReadonly}
        selectedVisibilityType={visibilityType}
        selectedChatModel={initialChatModel}
      />
    </>
  );
}
