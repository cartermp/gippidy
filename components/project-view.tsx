'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'next-auth';
import { toast } from 'sonner';
import useSWR from 'swr';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  PlusIcon,
  MessageIcon,
  FileIcon,
  FolderIcon,
  LoaderIcon,
  TrashIcon,
} from '@/components/icons';
import type { Project, ProjectFile } from '@/lib/db/schema';
import { fetcher } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

interface ProjectViewProps {
  project: Project;
  user: User;
}

interface ProjectChat {
  id: string;
  title: string;
  createdAt: Date;
  addedAt: Date;
}

export function ProjectView({ project, user }: ProjectViewProps) {
  const router = useRouter();
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Fetch project chats
  const {
    data: projectChats,
    error: chatsError,
    mutate: mutateChats,
  } = useSWR<ProjectChat[]>(`/api/projects/${project.id}/chats`, fetcher);

  // Fetch project files
  const {
    data: projectFiles,
    error: filesError,
    mutate: mutateFiles,
  } = useSWR<ProjectFile[]>(`/api/projects/${project.id}/files`, fetcher);

  const handleCreateChat = async () => {
    setIsCreatingChat(true);
    try {
      // First create a new chat
      const chatResponse = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: crypto.randomUUID(),
          messages: [],
          visibility: 'private',
        }),
      });

      if (!chatResponse.ok) {
        throw new Error('Failed to create chat');
      }

      const { id: chatId } = await chatResponse.json();

      // Then associate it with the project
      const associateResponse = await fetch(
        `/api/projects/${project.id}/chats`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chatId }),
        },
      );

      if (!associateResponse.ok) {
        throw new Error('Failed to associate chat with project');
      }

      mutateChats();
      toast.success('New chat created');
      router.push(`/chat/${chatId}`);
    } catch (error) {
      console.error('Error creating chat:', error);
      toast.error('Failed to create chat');
    } finally {
      setIsCreatingChat(false);
    }
  };

  const handleChatClick = (chatId: string) => {
    router.push(`/chat/${chatId}`);
  };

  const handleDeleteProject = async () => {
    setIsDeleting(true);
    try {
      const response = await fetch(`/api/projects?id=${project.id}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        throw new Error('Failed to delete project');
      }

      toast.success('Project deleted successfully');
      router.push('/'); // Navigate back to main chat page
    } catch (error) {
      console.error('Error deleting project:', error);
      toast.error('Failed to delete project');
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (date: Date) => {
    return formatDistanceToNow(new Date(date), { addSuffix: true });
  };

  return (
    <div className="flex flex-col h-full max-w-6xl mx-auto p-4 space-y-6">
      {/* Project Header */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FolderIcon size={24} />
            <h1 className="text-3xl font-bold">{project.name}</h1>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={isDeleting}>
                {isDeleting ? (
                  <>
                    <LoaderIcon size={16} />
                    Deleting...
                  </>
                ) : (
                  <>
                    <TrashIcon size={16} />
                    Delete Project
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Project</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete &quot;{project.name}&quot;?
                  This will permanently remove the project and all associated
                  chats and files. This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleDeleteProject}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  Delete Project
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
        {project.description && (
          <p className="text-muted-foreground text-lg">{project.description}</p>
        )}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span>Created {formatDate(project.createdAt)}</span>
          <span>•</span>
          <span>Updated {formatDate(project.updatedAt)}</span>
        </div>
      </div>

      <Separator />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 flex-1">
        {/* Chats Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <MessageIcon size={20} />
                  Chats
                </CardTitle>
                <CardDescription>
                  Conversations within this project
                </CardDescription>
              </div>
              <Button
                onClick={handleCreateChat}
                disabled={isCreatingChat}
                size="sm"
              >
                {isCreatingChat ? (
                  <>
                    <LoaderIcon size={16} />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon size={16} />
                    New Chat
                  </>
                )}
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {chatsError ? (
              <div className="text-center py-8 text-muted-foreground">
                Failed to load chats
              </div>
            ) : !projectChats ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <LoaderIcon size={16} />
                <span className="text-muted-foreground">Loading chats...</span>
              </div>
            ) : projectChats.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="mx-auto mb-4 opacity-50">
                  <MessageIcon size={48} />
                </div>
                <p>No chats yet</p>
                <p className="text-sm">Create your first chat to get started</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectChats.map((chat) => (
                  <button
                    key={chat.id}
                    type="button"
                    onClick={() => handleChatClick(chat.id)}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted cursor-pointer transition-colors w-full text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{chat.title}</p>
                      <p className="text-sm text-muted-foreground">
                        Added {formatDate(chat.addedAt)}
                      </p>
                    </div>
                    <Badge variant="secondary" className="ml-2">
                      {formatDate(chat.createdAt)}
                    </Badge>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Files Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileIcon size={20} />
                  Files
                </CardTitle>
                <CardDescription>
                  Documents and resources for this project
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" disabled>
                <PlusIcon size={16} />
                Upload File
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {filesError ? (
              <div className="text-center py-8 text-muted-foreground">
                Failed to load files
              </div>
            ) : !projectFiles ? (
              <div className="flex items-center justify-center py-8 gap-2">
                <LoaderIcon size={16} />
                <span className="text-muted-foreground">Loading files...</span>
              </div>
            ) : projectFiles.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <div className="mx-auto mb-4 opacity-50">
                  <FileIcon size={48} />
                </div>
                <p>No files yet</p>
                <p className="text-sm">
                  Upload files to provide context for AI responses
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectFiles.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center justify-between p-3 rounded-lg border"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <FileIcon size={16} />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{file.filename}</p>
                        {file.fileType && (
                          <p className="text-sm text-muted-foreground">
                            {file.fileType}
                          </p>
                        )}
                      </div>
                    </div>
                    <Badge variant="outline" className="ml-2">
                      {formatDate(file.uploadedAt)}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
