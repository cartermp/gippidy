'use client';

import { useRouter } from 'next/navigation';
import { useWindowSize } from 'usehooks-ts';

import { ModelSelector } from '@/components/model-selector';
import { SidebarToggle } from '@/components/sidebar-toggle';
import { Button } from '@/components/ui/button';
import { PlusIcon, FolderIcon } from './icons';
import { useSidebar } from './ui/sidebar';
import { memo } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip';
import { type VisibilityType, VisibilitySelector } from './visibility-selector';
import type { Session } from 'next-auth';
import type { Project } from '@/lib/db/schema';
import Link from 'next/link';

function PureChatHeader({
  chatId,
  selectedModelId,
  selectedVisibilityType,
  isReadonly,
  session,
  project,
}: {
  chatId: string;
  selectedModelId: string;
  selectedVisibilityType: VisibilityType;
  isReadonly: boolean;
  session: Session;
  project?: Project | null;
}) {
  const router = useRouter();
  const { open } = useSidebar();

  const { width: windowWidth } = useWindowSize();

  return (
    <header className="sticky top-0 z-10 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-background/80 via-background/60 to-background/40 px-2 py-2 shadow-sm ring-1 ring-border/60 backdrop-blur-md md:px-3">
      <SidebarToggle />

      {project && (
        <Link
          href={`/projects/${project.id}`}
          className="flex items-center gap-2 px-2 py-1 bg-muted rounded-md hover:bg-muted/80 transition-colors"
        >
          <FolderIcon size={16} />
          <span className="text-sm font-medium">{project.name}</span>
        </Link>
      )}

      {(!open || windowWidth < 768) && (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              className="order-2 md:order-1 md:px-2 px-2 md:h-fit ml-auto md:ml-0"
              onClick={() => {
                router.push('/');
                router.refresh();
              }}
            >
              <PlusIcon />
              <span className="md:sr-only">New Chat</span>
            </Button>
          </TooltipTrigger>
          <TooltipContent>New Chat</TooltipContent>
        </Tooltip>
      )}

      {!isReadonly && (
        <ModelSelector
          session={session}
          selectedModelId={selectedModelId}
          className="order-1 md:order-2"
        />
      )}

      {!isReadonly && (
        <VisibilitySelector
          chatId={chatId}
          selectedVisibilityType={selectedVisibilityType}
          className="order-1 md:order-3"
        />
      )}
    </header>
  );
}

export const ChatHeader = memo(PureChatHeader, (prevProps, nextProps) => {
  return (
    prevProps.selectedModelId === nextProps.selectedModelId &&
    prevProps.project?.id === nextProps.project?.id
  );
});
