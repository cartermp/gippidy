import type { Metadata, Viewport } from 'next';
import './globals.css';
import 'highlight.js/styles/atom-one-dark.min.css';

const GIRL_MODE_STORAGE_KEY = 'gippidy-girl-mode';
const GIRL_MODE_BOOTSTRAP = `
try {
  if (localStorage.getItem('${GIRL_MODE_STORAGE_KEY}') === '1') {
    document.documentElement.setAttribute('data-girl-mode', 'true');
  }
} catch {}
`;

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL ?? 'https://www.gippidy.chat'),
  title: 'GIPPIDY',
  description: 'minimal llm chat',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <script dangerouslySetInnerHTML={{ __html: GIRL_MODE_BOOTSTRAP }} />
        {children}
      </body>
    </html>
  );
}
