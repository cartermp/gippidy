'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { User } from 'next-auth';
import { toast } from 'sonner';
import useSWR from 'swr';
import { motion } from 'framer-motion';

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { PlusIcon, LoaderIcon, FolderIcon } from '@/components/icons';
import type { Project } from '@/lib/db/schema';

interface ProjectsProps {
  user: User | undefined;
}

export function SidebarProjects({ user }: ProjectsProps) {
  const router = useRouter();
  const { setOpenMobile } = useSidebar();

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // Fetch user's projects
  const {
    data: projects,
    error,
    mutate,
  } = useSWR<Project[]>(
    user ? '/api/projects' : null,
    async (url: string) => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          // Log the response details for debugging
          const errorText = await response.text();
          console.error(`Projects API error ${response.status}:`, errorText);

          // For any error, return empty array to show proper empty state
          // This is better UX than showing error for zero projects
          return [];
        }
        const data = await response.json();
        return Array.isArray(data) ? data : [];
      } catch (error) {
        console.error('Error fetching projects:', error);
        // Return empty array to show proper empty state
        return [];
      }
    },
    {
      // Disable retry on error to prevent spam
      errorRetryCount: 0,
      revalidateOnFocus: false,
    },
  );

  const handleCreateProject = async () => {
    if (!projectName.trim()) {
      toast.error('Project name is required');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: projectName.trim(),
          description: projectDescription.trim() || undefined,
        }),
      });

      if (!response.ok) {
        // Get detailed error information from the response
        let errorMessage = 'Failed to create project';
        let errorDetails = '';

        try {
          const errorData = await response.json();
          console.error('Project creation API error:', {
            status: response.status,
            statusText: response.statusText,
            errorData,
          });

          if (errorData.message) {
            errorMessage = errorData.message;
          }
          if (errorData.cause) {
            errorDetails = errorData.cause;
          }
        } catch (jsonError) {
          // If response is not JSON, try to get text
          try {
            const errorText = await response.text();
            console.error('Project creation API error (non-JSON):', {
              status: response.status,
              statusText: response.statusText,
              errorText,
            });
            errorDetails = errorText;
          } catch (textError) {
            console.error('Project creation API error (no body):', {
              status: response.status,
              statusText: response.statusText,
            });
          }
        }

        throw new Error(
          `${errorMessage}${errorDetails ? `: ${errorDetails}` : ''}`,
        );
      }

      const newProject = await response.json();

      // Optimistically update the projects list
      mutate();

      // Reset form
      setProjectName('');
      setProjectDescription('');
      setCreateDialogOpen(false);

      toast.success('Project created successfully');

      // Navigate to the new project
      setOpenMobile(false);
      router.push(`/projects/${newProject.id}`);
    } catch (error) {
      console.error('Error creating project:', error);
      toast.error(
        error instanceof Error ? error.message : 'Failed to create project',
      );
    } finally {
      setIsCreating(false);
    }
  };

  const handleProjectClick = (project: Project) => {
    setOpenMobile(false);
    router.push(`/projects/${project.id}`);
  };

  if (!user) {
    return null;
  }

  return (
    <SidebarGroup>
      <div className="flex items-center justify-between">
        <SidebarGroupLabel>Projects</SidebarGroupLabel>
        <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-6 text-muted-foreground hover:text-foreground"
            >
              <PlusIcon size={16} />
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Project</DialogTitle>
              <DialogDescription>
                Create a new project to organize related chats and files.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="project-name">Project Name</Label>
                <Input
                  id="project-name"
                  placeholder="e.g., Health Tracking, Work Project"
                  value={projectName}
                  onChange={(e) => setProjectName(e.target.value)}
                  disabled={isCreating}
                />
              </div>
              <div>
                <Label htmlFor="project-description">
                  Description (optional)
                </Label>
                <Textarea
                  id="project-description"
                  placeholder="Describe what this project is about..."
                  value={projectDescription}
                  onChange={(e) => setProjectDescription(e.target.value)}
                  disabled={isCreating}
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setCreateDialogOpen(false)}
                disabled={isCreating}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateProject} disabled={isCreating}>
                {isCreating ? (
                  <>
                    <LoaderIcon size={16} />
                    Creating...
                  </>
                ) : (
                  'Create Project'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <SidebarGroupContent>
        <SidebarMenu>
          {error && !projects ? (
            <SidebarMenuItem>
              <div className="text-sm text-muted-foreground px-2 py-1">
                Failed to load projects
              </div>
            </SidebarMenuItem>
          ) : !projects ? (
            <SidebarMenuItem>
              <div className="flex items-center gap-2 px-2 py-1">
                <LoaderIcon size={16} />
                <span className="text-sm text-muted-foreground">
                  Loading...
                </span>
              </div>
            </SidebarMenuItem>
          ) : projects.length === 0 ? (
            <SidebarMenuItem>
              <div className="text-sm text-muted-foreground px-2 py-1">
                No projects yet. Create your first project!
              </div>
            </SidebarMenuItem>
          ) : (
            projects.map((project) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2 }}
              >
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={() => handleProjectClick(project)}
                    className="w-full justify-start"
                  >
                    <FolderIcon size={16} />
                    <span className="truncate">{project.name}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </motion.div>
            ))
          )}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
