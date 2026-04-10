# gippidy

A minimal LLM chat app. Supports OpenAI, Anthropic, and Google Gemini models with streaming responses, markdown rendering, image and PDF inputs, web search, encrypted chat history, and shareable chat sessions. Hosted on Vercel.

## Prerequisites

- Node.js 20.6+
- pnpm
- A Vercel account (for deployment)
- A Neon Postgres database
- Google OAuth credentials
- API keys for whichever models you want to use

## Environment variables

Create a `.env.local` file at the repo root:

```
# Google OAuth (https://console.cloud.google.com)
# GOOGLE_* is documented here; AUTH_GOOGLE_* also works with NextAuth v5
GOOGLE_ID=...
GOOGLE_SECRET=...

# Comma-separated list of emails allowed to sign in
ALLOWED_EMAIL=you@example.com,colleague@example.com

# NextAuth secret — generate with: openssl rand -base64 32
AUTH_SECRET=...

# Postgres (Neon)
DATABASE_URL=postgres://...

# LLM API keys — any subset works; models without a key will return a 401
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Optional: set to debug, info, warn, or error (default: info)
LOG_LEVEL=info

# Base URL for OG image metadata (defaults to https://www.gippidy.chat)
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app
```

## Google OAuth setup

1. Go to [Google Cloud Console](https://console.cloud.google.com) → APIs & Services → Credentials
2. Create an OAuth 2.0 Client ID (Web application)
3. Add authorized redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `https://your-domain.vercel.app/api/auth/callback/google` (production)
4. Copy the Client ID and Secret into `GOOGLE_ID` and `GOOGLE_SECRET`

## Local setup

```bash
pnpm install
pnpm db:migrate   # creates DB tables — run once against your Neon DB
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

```bash
vercel deploy
```

Add all variables from `.env.local` to your Vercel project (Settings → Environment Variables). If you use Vercel's Neon integration, `DATABASE_URL` will be set automatically.

Add your production Vercel URL to the authorized redirect URIs in Google Cloud Console.

## Features

- **Multiple models** — GPT-5.4, Claude Opus 4.6, Claude Sonnet 4.6, Gemini 3.1 Pro, Gemini 3 Flash
- **Streaming responses** with smart scroll (auto-follows stream unless you scroll up)
- **Markdown + syntax highlighting** via marked and highlight.js
- **Image inputs** — attach via file picker, paste from clipboard, or drag and drop
- **PDF inputs** — attach PDFs for models that support document reading (Anthropic, Gemini)
- **File inputs** — attach text/code files; contents are inlined as XML-tagged blocks
- **Web search** — per-request toggle; uses each provider's native search tool
- **System prompt** — configurable, persisted server-side per user
- **Encrypted chat history** — saved chats are AES-GCM encrypted client-side; key is stored server-side so it's shared across devices
- **Shared chats** — generate a shareable read-only URL with OG image preview; authenticated users can fork the chat to continue it
- **Google OAuth** — restricted to a configurable allowlist of emails
- **Health endpoint** — `GET /api/health` checks DB connectivity; suitable for uptime monitors
- **Observability** — API responses include `X-Request-Id`, and the app emits structured server/client diagnostics without logging plaintext chat history

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm test` | Run unit tests |
| `pnpm db:migrate` | Create database tables (run once) |
