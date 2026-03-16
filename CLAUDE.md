# CLAUDE.md

## What this is

A minimal LLM chat app built with Next.js 15, deployed on Vercel. The guiding constraints are: as few files as possible, as few dependencies as possible, no over-engineering.

## Key commands

```bash
pnpm dev          # local dev server
pnpm build        # production build (run to verify before committing)
pnpm test         # unit tests — run after any change to lib/chat.ts or lib/markdown.ts
pnpm db:migrate   # create DB tables (run once)
```

**Run `pnpm test` as you work** — after any change to `lib/chat.ts`, `lib/markdown.ts`, or `app/api/chat/route.ts`, run the tests to catch regressions.

## Architecture

```
app/
  page.tsx                        # entire chat UI — one client component
  layout.tsx                      # HTML shell, imports CSS + highlight.js theme
  globals.css                     # all styles
  login/page.tsx                  # Google sign-in page (server component)
  share/[id]/
    page.tsx                      # read-only shared chat view (server component)
    fork-button.tsx               # "continue this chat" button (client component)
  api/
    auth/[...nextauth]/route.ts   # NextAuth handler
    chat/route.ts                 # streaming LLM proxy (OpenAI, Anthropic, Gemini)
    shares/route.ts               # POST — create a share
    shares/[id]/route.ts          # GET — fetch a share

lib/
  chat.ts                         # pure message-conversion functions (tested)
  db.ts                           # pg Pool singleton + query helper
  markdown.ts                     # marked + marked-highlight + highlight.js setup

tests/
  unit.test.ts                    # node:test unit tests for lib/chat.ts + lib/markdown.ts

auth.ts                           # NextAuth config (Google provider, email allowlist)
middleware.ts                     # auth guard for all non-login routes
scripts/migrate.mjs               # one-shot DB table creation
```

## Dependencies

Runtime: `next`, `react`, `react-dom`, `next-auth`, `marked`, `marked-highlight`, `highlight.js`, `@google/genai`, `pg`

The `@google/genai` and `pg` packages are in `serverExternalPackages` in `next.config.ts` to avoid webpack bundling issues.

## Auth

NextAuth v5 (beta) with Google OAuth. All routes except `/login` and `/api/auth/*` require authentication (enforced in `middleware.ts`). The `ALLOWED_EMAIL` env var is a comma-separated list of permitted emails; anyone else is rejected at the `signIn` callback in `auth.ts`.

## LLM providers

`app/api/chat/route.ts` handles all three providers:

- **OpenAI** — REST SSE, `Authorization: Bearer` header
- **Anthropic** — REST SSE, `x-api-key` header, `anthropic-version` header; system prompt is a top-level field (not a message)
- **Google Gemini** — uses `@google/genai` SDK (`generateContentStream`); role `assistant` maps to `model`; system prompt via `config.systemInstruction`

Images are stored as `{ data: string, mimeType: string }` (raw base64, no data-URL prefix) in the `Message` type and converted to provider-specific formats in the route.

## Shared chats

Stored in a single Postgres table (`shared_chats`) in Neon. Only explicitly shared chats are stored — normal sessions are ephemeral (in-memory React state). The schema is in `scripts/migrate.mjs`.

The fork flow is client-side only: the fork button writes `{ messages, model, systemPrompt }` to `localStorage` under `gippidy-fork`, then navigates to `/`. The main page checks for that key on mount, loads it, and clears it.

## Styles

All in `globals.css`. Retro terminal aesthetic: dark background (`#0c0c0c`), green (`#33ff33`) accents, monospace font, no border-radius. CSS variables are defined in `:root`. Mobile layout uses `100dvh` and a `flex-wrap` breakpoint at 540px for the header.

## What to avoid

- Do not add ORMs, UI libraries, or component frameworks
- Do not add Tailwind or any CSS preprocessor
- Do not split `app/page.tsx` into many sub-components unless it becomes unmanageable
- Keep the dependency list short — every new package is a future migration burden
