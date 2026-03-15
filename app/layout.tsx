import type { Metadata } from 'next';
import './globals.css';
import 'highlight.js/styles/atom-one-dark.min.css';

export const metadata: Metadata = {
  title: 'GIPPIDY',
  description: 'minimal llm chat',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
