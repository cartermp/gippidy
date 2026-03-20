'use client';

export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100dvh', gap: '16px', fontFamily: 'Courier New, monospace', background: '#0c0c0c', color: '#555' }}>
      <span style={{ color: '#33ff33', fontWeight: 'bold', letterSpacing: '3px' }}>GIPPIDY</span>
      <span>something went wrong</span>
      <span style={{ fontSize: '12px', maxWidth: '400px', textAlign: 'center', wordBreak: 'break-word' }}>{error.message}</span>
      <button onClick={reset} style={{ background: 'transparent', color: '#c8c8c8', border: '1px solid #2a2a2a', fontFamily: 'inherit', fontSize: '13px', padding: '4px 12px', cursor: 'pointer' }}>[RETRY]</button>
    </div>
  );
}
