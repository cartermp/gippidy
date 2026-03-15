# gippidy

A minimal LLM chat app. Supports OpenAI, Anthropic, and Google Gemini models with streaming responses, markdown rendering, image inputs, and shareable chat sessions. Hosted on Vercel.

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
GOOGLE_ID=...
GOOGLE_SECRET=...

# Comma-separated list of emails allowed to sign in
ALLOWED_EMAIL=you@example.com,colleague@example.com

# NextAuth secret — generate with: openssl rand -base64 32
AUTH_SECRET=...

# Postgres (Neon)
POSTGRES_URL=postgres://...

# LLM API keys — any subset works; models without a key will return a 401
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
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
pnpm db:migrate   # creates the shared_chats table — run once against your Neon DB
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploying to Vercel

```bash
vercel deploy
```

Add all variables from `.env.local` to your Vercel project (Settings → Environment Variables). If you use Vercel's Neon integration, `POSTGRES_URL` will be set automatically.

Add your production Vercel URL to the authorized redirect URIs in Google Cloud Console.

## Features

- **Multiple models** — GPT-5.4, Claude Opus 4.6, Claude Sonnet 4.6, Gemini 3.1 Pro, Gemini 3 Flash
- **Streaming responses** with smart scroll (auto-follows stream unless you scroll up)
- **Markdown + syntax highlighting** via marked and highlight.js
- **Image inputs** — attach via file picker, paste from clipboard
- **System prompt** — configurable per-session, persisted in localStorage
- **Shared chats** — generate a shareable URL; recipients must be authenticated to view; they can fork the chat to continue it themselves
- **Google OAuth** — restricted to a configurable allowlist of emails

## Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build |
| `pnpm start` | Start production server |
| `pnpm db:migrate` | Create database tables (run once) |
