import 'server-only';

import {
  getProjectsByChatId,
  getChatsByProject,
  getFilesByProject,
  getMessagesByChatId,
} from '@/lib/db/queries';
import type { Project, ProjectFile, DBMessage } from '@/lib/db/schema';
import { recordErrorOnCurrentSpan } from '@/lib/telemetry';

export interface ProjectContext {
  projects: Project[];
  files: ProjectFile[];
  relatedChats: {
    id: string;
    title: string;
    messageCount: number;
    lastMessage?: string;
  }[];
  summary: string;
}

interface ProjectContextOptions {
  maxFiles?: number;
  maxRelatedChats?: number;
  maxCharacters?: number;
  maxMessageLength?: number;
}

const DEFAULT_OPTIONS: Required<ProjectContextOptions> = {
  maxFiles: 10,
  maxRelatedChats: 5,
  maxCharacters: 8000,
  maxMessageLength: 500,
};

export async function buildProjectContext(
  chatId: string,
  options: ProjectContextOptions = {},
): Promise<ProjectContext | null> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    // Get projects associated with this chat
    const chatProjects = await getProjectsByChatId({ chatId });

    if (chatProjects.length === 0) {
      return null; // No project context available
    }

    const projects = chatProjects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
      userId: p.userId,
    }));

    // Get files from all associated projects
    const allFiles: ProjectFile[] = [];
    const relatedChats: ProjectContext['relatedChats'] = [];

    for (const project of projects) {
      // Get project files
      const projectFiles = await getFilesByProject({ projectId: project.id });
      allFiles.push(...projectFiles.slice(0, opts.maxFiles));

      // Get related chats from this project (excluding current chat)
      const projectChats = await getChatsByProject({ projectId: project.id });
      const otherChats = projectChats.filter((chat) => chat.id !== chatId);

      for (const chat of otherChats.slice(0, opts.maxRelatedChats)) {
        // Get recent messages to understand chat content
        const messages = await getMessagesByChatId({ id: chat.id });
        const lastUserMessage = messages
          .filter((m) => m.role === 'user')
          .slice(-1)[0];

        const lastMessageText = lastUserMessage
          ? extractTextFromMessage(lastUserMessage).slice(
              0,
              opts.maxMessageLength,
            )
          : '';

        relatedChats.push({
          id: chat.id,
          title: chat.title,
          messageCount: messages.length,
          lastMessage: lastMessageText,
        });
      }
    }

    // Build summary text within character limits
    const summary = buildProjectSummary(
      projects,
      allFiles,
      relatedChats,
      opts.maxCharacters,
    );

    return {
      projects,
      files: allFiles,
      relatedChats,
      summary,
    };
  } catch (error) {
    recordErrorOnCurrentSpan(error as Error, {
      operation: 'build_project_context',
      'chat.id': chatId,
    });
    // Return null instead of throwing to gracefully degrade
    return null;
  }
}

function extractTextFromMessage(message: DBMessage): string {
  try {
    if (typeof message.parts === 'string') {
      return message.parts;
    }

    if (Array.isArray(message.parts)) {
      return message.parts
        .filter((part: any) => part.type === 'text')
        .map((part: any) => part.text || '')
        .join(' ');
    }

    return '';
  } catch {
    return '';
  }
}

function buildProjectSummary(
  projects: Project[],
  files: ProjectFile[],
  relatedChats: ProjectContext['relatedChats'],
  maxCharacters: number,
): string {
  const sections: string[] = [];

  // Project information
  if (projects.length > 0) {
    const projectInfo = projects
      .map((p) => {
        const desc = p.description ? `: ${p.description}` : '';
        return `- ${p.name}${desc}`;
      })
      .join('\n');
    sections.push(`Projects:\n${projectInfo}`);
  }

  // File information
  if (files.length > 0) {
    const fileInfo = files
      .map((f) => {
        const content = f.content ? ` (${f.content.slice(0, 100)}...)` : '';
        return `- ${f.filename}${content}`;
      })
      .join('\n');
    sections.push(`Files:\n${fileInfo}`);
  }

  // Related chats
  if (relatedChats.length > 0) {
    const chatInfo = relatedChats
      .map((c) => {
        const lastMsg = c.lastMessage ? ` - Last: "${c.lastMessage}"` : '';
        return `- ${c.title} (${c.messageCount} messages)${lastMsg}`;
      })
      .join('\n');
    sections.push(`Related Chats:\n${chatInfo}`);
  }

  const fullSummary = sections.join('\n\n');

  // Truncate if too long
  if (fullSummary.length > maxCharacters) {
    return `${fullSummary.slice(0, maxCharacters - 3)}...`;
  }

  return fullSummary;
}

export function formatProjectContextForPrompt(context: ProjectContext): string {
  if (!context || context.projects.length === 0) {
    return '';
  }

  return `\nProject Context:
This conversation is part of the following project(s): ${context.projects.map((p) => p.name).join(', ')}.

${context.summary}

Please use this project context to provide more relevant and informed responses. Reference project files, previous conversations, and project goals when appropriate.`;
}
