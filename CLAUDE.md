# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

```bash
# Development
pnpm dev              # Start development server with Turbo
pnpm build            # Run migrations + build for production
pnpm start            # Start production server

# Code Quality (ALWAYS run after changes)
pnpm lint             # Run Next.js + Biome linting
pnpm lint:fix         # Auto-fix linting issues
pnpm format           # Format code with Biome

# Database
pnpm db:generate      # Generate Drizzle migrations after schema changes
pnpm db:migrate       # Run database migrations
pnpm db:studio        # Open Drizzle Studio for DB inspection

# Testing
pnpm test             # Run all Playwright tests (E2E + integration)
pnpm exec playwright test --project=e2e         # Run E2E tests only
pnpm exec playwright test --project=routes      # Run API route tests only
pnpm exec playwright test --project=integration # Run database integration tests only
```

## Architecture Overview

**Chat Gippidy** is a Next.js 15 chatbot application using App Router with experimental PPR. The app features an artifacts system for interactive content, NextAuth.js authentication, and Drizzle ORM with PostgreSQL.

### Key Directories

- **`app/(chat)/`** - Main chat interface with sidebar layout
- **`app/(auth)/`** - Authentication routes (login/register)
- **`artifacts/`** - Pluggable artifact system (code, text, image, sheet)
- **`lib/ai/`** - AI models, prompts, and tool definitions
- **`lib/db/`** - Drizzle schema, queries, and migrations
- **`components/`** - React components (UI components in `ui/` subdirectory)

### Database Schema (Drizzle)

Core tables: `users`, `chats`, `messages`, `documents`, `votes`, `suggestions`. Schema uses versioned messages (v2) with parts and attachments. Always run `pnpm db:generate` after schema changes, then `pnpm db:migrate`.

### AI Integration

Uses Vercel AI SDK with OpenAI models. Development/test environments use mock models for consistent testing. Reasoning support with `<think>` tag extraction. Tool system includes weather, document creation, and suggestion tools.

### Artifacts System

Interactive content creation with client-server architecture:
- **Code artifacts**: Support Python execution via Pyodide
- **Text/Image/Sheet artifacts**: Editable content with versioning
- Each artifact type has separate client and server components

### Authentication

NextAuth.js 5.0 beta with Google OAuth provider only. All users must authenticate via Google account. Email restriction enforced via ALLOWED_EMAIL environment variable.

## Development Guidelines

### Code Quality
- Use **Biome** for linting/formatting (not ESLint/Prettier)
- TypeScript strict mode enabled - maintain full type safety
- Follow existing component patterns in `components/` directory

### Testing Strategy
- **E2E tests**: End-to-end user flows with Page Object Model in `tests/e2e/`
- **Integration tests**: Database operations and API endpoints in `tests/integration/`
- **Route tests**: API contract validation in `tests/routes/`
- Mock AI responses for consistent test behavior
- Run tests before major changes: `pnpm test`
- Focus on critical paths that catch refactor breaks

### Database Changes
1. Update schema in `lib/db/schema.ts`
2. Generate migration: `pnpm db:generate`
3. Apply migration: `pnpm db:migrate`
4. Never edit migration files directly

### Artifact Development
When adding new artifact types:
1. Create client component in `artifacts/{type}/client.tsx`
2. Create server logic in `artifacts/{type}/server.ts`
3. Update artifact routing in main artifact components
4. Follow existing patterns for streaming updates

### AI Model Configuration
- Development uses mock models for predictable testing
- Production uses OpenAI GPT-4o/4.1 with reasoning support
- Model configuration in `lib/ai/models.ts` and `lib/ai/providers.ts`

## Current Architecture Notes

- Uses experimental Next.js PPR (Partial Prerendering)
- React 19 RC for latest features
- pnpm for package management with Turbo for faster builds
- Font optimization with Geist variable fonts
- Theme system prevents hydration flashes