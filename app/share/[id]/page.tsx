import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { auth, googleAuthConfigured, signIn } from '@/auth';
import RenderedMarkdown from '@/app/rendered-markdown';
import ForkButton from './fork-button';
import logger from '@/lib/log';
import type { Message } from '@/lib/chat';
import { getSharedChat } from '@/lib/share';
import { isShareId } from '@/lib/validation';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!isShareId(id)) return { title: 'Not found — GIPPIDY' };
  const share = await getSharedChat(id);
  if (!share) return { title: 'Not found — GIPPIDY' };

  const { model, messages } = share;
  const firstUserMsg = messages.find(m => m.role === 'user')?.content ?? '';
  const preview = firstUserMsg.length > 140 ? firstUserMsg.slice(0, 140) + '…' : firstUserMsg;
  const title = `Shared chat · ${model}`;

  return {
    title,
    description: preview || `${messages.length} messages`,
    openGraph: {
      title,
      description: preview || `${messages.length} messages`,
      siteName: 'GIPPIDY',
    },
  };
}

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isShareId(id)) notFound();
  const [sessionResult, share] = await Promise.all([
    auth(),
    getSharedChat(id),
  ]);

  if (!share) {
    logger.warn({ id }, 'share.view not_found');
    notFound();
  }

  logger.info({ id, model: share.model, msgs: (share.messages as unknown[]).length, authed: !!sessionResult }, 'share.view');
  const messages: Message[] = share.messages;
  const date = new Date(share.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="app share-view">
      <header>
        <span className="logo">GIPPIDY</span>
        <span className="share-meta">{share.model} · {date}</span>
        <div className="header-spacer" />
        <div className="header-actions">
          {sessionResult && <Link href="/" className="header-link">[BACK]</Link>}
          {sessionResult
            ? <ForkButton messages={messages} model={share.model} systemPrompt={share.system_prompt ?? undefined} />
            : googleAuthConfigured
              ? <form action={async () => {
                  'use server';
                  await signIn('google', { redirectTo: `/share/${id}` });
                }}>
                  <button type="submit">[SIGN IN TO CONTINUE]</button>
                </form>
              : <span className="share-meta">sign-in unavailable</span>
          }
        </div>
      </header>

      <div className="share-banner">[ read-only · shared chat ]</div>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
            <div className="message-shell">
              <div className="message-head">
                <span className="message-label">{msg.role === 'assistant' ? '[OUTPUT]' : '[INPUT]'}</span>
              </div>
              <div className="message-body">
                <span className="role">{msg.role === 'user' ? '>' : '#'}</span>
                <div className="content">
                  {msg.images && msg.images.length > 0 && (
                    <div className="message-images">
                      {msg.images.map((img, j) => (
                        <img key={j} src={`data:${img.mimeType};base64,${img.data}`} alt="" className="message-image" />
                      ))}
                    </div>
                  )}
                  {msg.role === 'assistant'
                    ? <RenderedMarkdown text={msg.content} followupsEnabled />
                    : msg.content && <RenderedMarkdown text={msg.content} />
                  }
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
