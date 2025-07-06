'use client';

import { useState, useEffect } from 'react';
import { FolderIcon } from './icons';
import type { Project } from '@/lib/db/schema';

interface ChatProjectIndicatorProps {
  chatId: string;
}

export function ChatProjectIndicator({ chatId }: ChatProjectIndicatorProps) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProject = async () => {
      try {
        const response = await fetch(`/api/chats/${chatId}/project`);
        if (response.ok) {
          const data = await response.json();
          setProject(data.project);
        }
      } catch (error) {
        console.error('Error fetching chat project:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProject();
  }, [chatId]);

  if (loading || !project) {
    return null;
  }

  return (
    <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
      <FolderIcon size={12} />
      <span className="truncate">{project.name}</span>
    </div>
  );
}
