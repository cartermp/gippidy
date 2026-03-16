import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { auth, signIn } from '@/auth';
import { query } from '@/lib/db';
import { renderMarkdown } from '@/lib/markdown';
import ForkButton from './fork-button';

type Image = { mimeType: string; data: string };
type Message = { role: string; content: string; images?: Image[] };

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await query('SELECT model, messages FROM shared_chats WHERE id = $1', [id]);
  if (result.rows.length === 0) return { title: 'Not found — GIPPIDY' };

  const { model, messages }: { model: string; messages: Message[] } = result.rows[0];
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
  const [sessionResult, dbResult] = await Promise.all([
    auth(),
    query('SELECT * FROM shared_chats WHERE id = $1', [id]),
  ]);

  if (dbResult.rows.length === 0) notFound();

  const share = dbResult.rows[0];
  const messages: Message[] = share.messages;
  const date = new Date(share.created_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });

  return (
    <div className="app">
      <header>
        <span className="logo">GIPPIDY</span>
        <span className="share-meta">{share.model} · {date}</span>
        <div className="header-spacer" />
        <div className="header-actions">
          {sessionResult && <Link href="/" className="header-link">[BACK]</Link>}
          {sessionResult
            ? <ForkButton messages={messages} model={share.model} systemPrompt={share.system_prompt} />
            : <form action={async () => {
                'use server';
                await signIn('google', { redirectTo: `/share/${id}` });
              }}>
                <button type="submit">[SIGN IN TO CONTINUE]</button>
              </form>
          }
        </div>
      </header>

      <div className="messages">
        {messages.map((msg, i) => (
          <div key={i} className={`message ${msg.role}`}>
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
                ? <div dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                : msg.content && <span>{msg.content}</span>
              }
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
