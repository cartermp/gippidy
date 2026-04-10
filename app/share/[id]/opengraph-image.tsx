import { ImageResponse } from 'next/og';
import logger from '@/lib/log';
import { getSharedChat } from '@/lib/share';
import { isShareId } from '@/lib/validation';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const fallback = (label: string) => new ImageResponse(
  <div style={{ background: '#0c0c0c', color: '#555', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'monospace' }}>
    {label}
  </div>,
  size,
);

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isShareId(id)) return fallback('not found');

  try {
    const share = await getSharedChat(id);
    if (!share) return fallback('not found');

    const { model, messages, created_at } = share;
    const userMessages = messages.filter(m => m.role === 'user');
    const firstMsg = userMessages[0]?.content ?? '';
    const preview = firstMsg.length > 160 ? firstMsg.slice(0, 160) + '…' : firstMsg;
    const date = new Date(created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const msgCount = messages.length;

    return new ImageResponse(
      <div
        style={{
          background: '#0c0c0c',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          padding: '64px 72px',
          fontFamily: 'monospace',
          border: '1px solid #2a2a2a',
        }}
      >
        {/* header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '48px' }}>
          <span style={{ color: '#33ff33', fontSize: 36, letterSpacing: 6, fontWeight: 'bold' }}>GIPPIDY</span>
          <span style={{ color: '#555', fontSize: 22 }}>{model} · {date}</span>
        </div>

        {/* message preview */}
        {preview ? (
          <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start', flex: 1 }}>
            <span style={{ color: '#5599ff', fontSize: 28, fontWeight: 'bold', marginTop: 4 }}>&gt;</span>
            <span style={{ color: '#c8c8c8', fontSize: 28, lineHeight: 1.6 }}>{preview}</span>
          </div>
        ) : (
          <div style={{ flex: 1 }} />
        )}

        {/* footer */}
        <div style={{ color: '#555', fontSize: 20, marginTop: '40px' }}>
          {`${msgCount} message${msgCount !== 1 ? 's' : ''} · gippidy.chat`}
        </div>
      </div>,
      size,
    );
  } catch (err) {
    logger.error({ id, err: String(err) }, 'og.image db_error');
    return fallback('unavailable');
  }
}
