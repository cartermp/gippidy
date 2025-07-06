# Project Support Implementation Plan

## Overview
Add project support to Chat Gippidy - a system for grouping related files and chat threads that provides contextual AI responses based on project scope.

## Key Features
- **Project Management**: Create, list, and manage projects from sidebar
- **File Association**: Upload and manage files within project scope
- **Chat Grouping**: Associate chats with projects
- **AI Context**: AI responses informed by project's chats and files
- **Project Scoping**: All interactions within a project maintain context

## Phase 1: Database Foundation (High Priority)

### Database Schema Design
- **projects table**: id, name, description, created_at, updated_at, user_id
- **project_chats junction table**: project_id, chat_id, added_at
- **project_files table**: id, project_id, filename, file_path, file_type, content, uploaded_at

### Database Queries
- **Project CRUD**: createProject, getProjectsByUser, updateProject, deleteProject
- **Chat Associations**: addChatToProject, removeChatFromProject, getChatsByProject
- **File Operations**: addFileToProject, removeFileFromProject, getFilesByProject

### Database Migrations
- Generate and apply migrations for new project tables

## Phase 2: API Layer (High Priority)

### Core API Routes
- `/api/projects` - CRUD operations for projects
- `/api/projects/[id]/chats` - Chat association management
- `/api/projects/[id]/files` - File operations within projects

## Phase 3: AI Context System (High Priority)

### Context Integration
- **Prompt Modification**: Inject project context into AI prompts
- **Context Builder**: Aggregate project chats and files for context
- **Context Management**: Handle context size limits and truncation strategies

## Phase 4: UI Components (Medium Priority)

### Sidebar Enhancement
- Add Projects section to sidebar navigation
- Create ProjectList component for displaying user's projects
- Create project button and modal/form component
- Add project selection state management

### Chat Window States
- Empty project state with create chat/upload file options
- Project overview showing related chats and files
- Remove chat/file functionality with confirmation dialogs
- Project-scoped chat creation

### File Management
- Project file upload component and handling
- File content extraction and storage for context

## Phase 5: Navigation & Routing (Medium Priority)

### Route Structure
- Add project-specific routes (`/projects/[id]`)
- Update existing chat routes to be project-aware
- Implement project-scoped chat creation

## Phase 6: State Management (Medium Priority)

### Global State
- Add project state to app-wide state management
- Create project context provider for active project

## Phase 7: Testing & Polish (Low Priority)

### Independent Tests
- Database operations testing
- API endpoint testing
- Context building testing

### User Experience
- Remove chats/files from projects with confirmations
- Error handling and edge cases

## Implementation Notes

### Key Technical Decisions
- Use Drizzle ORM for database operations following existing patterns
- Leverage existing NextAuth user system for project ownership
- Build on existing sidebar and chat window components
- Maintain backwards compatibility with existing chats

### Context Strategy
- Aggregate project chats and files into AI context
- Implement intelligent truncation for context size limits
- Prioritize recent chats and relevant files in context

### Testing Approach
- Write independent tests that don't require test server
- Focus on database operations and API contracts
- Ignore Playwright tests as specified

## Success Criteria
- Users can create and manage projects from sidebar
- Files can be uploaded and associated with projects
- Chats can be grouped within projects
- AI responses are contextually aware of project scope
- Smooth UX for project navigation and management