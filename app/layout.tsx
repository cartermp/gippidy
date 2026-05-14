import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import { CUSTOM_FONT_ID, DEFAULT_FONT_FAMILY, FONTS } from '@/lib/fonts';

const GIRL_MODE_STORAGE_KEY = 'gippidy-girl-mode';
const FONT_STORAGE_KEY = 'gippidy-font';
const CUSTOM_FONT_STORAGE_KEY = 'gippidy-custom-font-family';
const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-ibm-plex-mono', display: 'swap' });
const FONT_BOOTSTRAP_MAP = Object.fromEntries(FONTS.map(font => [font.id, font.family]));
const GIRL_MODE_BOOTSTRAP = `
try {
  if (localStorage.getItem('${GIRL_MODE_STORAGE_KEY}') === '1') {
    document.documentElement.setAttribute('data-girl-mode', 'true');
  }
} catch {}
`;
const FONT_BOOTSTRAP = `
try {
  const fontMap = ${JSON.stringify(FONT_BOOTSTRAP_MAP)};
  const defaultFont = ${JSON.stringify(DEFAULT_FONT_FAMILY)};
  const font = localStorage.getItem('${FONT_STORAGE_KEY}');
  const custom = (localStorage.getItem('${CUSTOM_FONT_STORAGE_KEY}') || '')
    .replace(/[{};]/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  const value = font === '${CUSTOM_FONT_ID}'
    ? (custom ? custom + ', monospace' : defaultFont)
    : (font && fontMap[font]) || defaultFont;
  document.documentElement.style.setProperty('--app-font-family', value);
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
    <html lang="en" suppressHydrationWarning className={`${jetbrainsMono.variable} ${ibmPlexMono.variable}`}>
      <body>
        <script dangerouslySetInnerHTML={{ __html: `${GIRL_MODE_BOOTSTRAP}\n${FONT_BOOTSTRAP}` }} />
        {children}
      </body>
    </html>
  );
}
