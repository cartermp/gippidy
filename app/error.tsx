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
    <div className="status-page">
      <span className="status-logo">GIPPIDY</span>
      <span>something went wrong</span>
      {error.digest && <span className="status-meta">ref: {error.digest}</span>}
      <button onClick={reset} className="status-action">[RETRY]</button>
    </div>
  );
}
