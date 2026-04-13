import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="status-page">
      <span className="status-logo">GIPPIDY</span>
      <span>404 — not found</span>
      <Link href="/" className="status-action">[HOME]</Link>
    </div>
  );
}
