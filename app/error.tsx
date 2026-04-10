'use client';

import { useEffect } from 'react';

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    const body = JSON.stringify({
      event: 'app.error',
      level: 'error',
      details: {
        name: error.name,
        digest: error.digest ?? null,
      },
    });
    const blob = new Blob([body], { type: 'application/json' });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/client-events', blob);
    else fetch('/api/client-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {});
  }, [error]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', gap: '16px', fontFamily: 'Courier New, monospace', background: '#0c0c0c', color: '#555' }}>
      <span style={{ color: '#33ff33', fontWeight: 'bold', letterSpacing: '3px' }}>GIPPIDY</span>
      <span>something went wrong</span>
      {error.digest && <span style={{ fontSize: '12px' }}>ref: {error.digest}</span>}
      <button onClick={reset} style={{ background: 'transparent', color: '#c8c8c8', border: '1px solid #2a2a2a', fontFamily: 'inherit', fontSize: '13px', padding: '4px 12px', cursor: 'pointer' }}>[RETRY]</button>
    </div>
  );
}
