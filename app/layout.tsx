import type { Metadata, Viewport } from 'next';
import type { CSSProperties } from 'react';
import { IBM_Plex_Mono, JetBrains_Mono } from 'next/font/google';
import { auth } from '@/auth';
import './globals.css';
import 'highlight.js/styles/atom-one-dark.min.css';
import { DEFAULT_FONT_FAMILY, getFontFamily } from '@/lib/fonts';
import logger from '@/lib/log';
import { getUserSettings } from '@/lib/user-settings';

const jetbrainsMono = JetBrains_Mono({ subsets: ['latin'], variable: '--font-jetbrains-mono', display: 'swap' });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-ibm-plex-mono', display: 'swap' });

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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  let girlMode = false;
  let fontFamily: string = DEFAULT_FONT_FAMILY;

  const session = await auth();
  if (session?.user?.email) {
    try {
      const settings = await getUserSettings(session.user.email);
      girlMode = settings.girlMode;
      fontFamily = getFontFamily(settings.font, settings.customFontFamily);
    } catch (error) {
      logger.warn(
        { user: session.user.email, error: String(error).slice(0, 200) },
        'layout.settings_load_failed',
      );
    }
  }

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${jetbrainsMono.variable} ${ibmPlexMono.variable}`}
      data-girl-mode={girlMode ? 'true' : undefined}
      style={{ '--app-font-family': fontFamily } as CSSProperties}
    >
      <body>
        {children}
      </body>
    </html>
  );
}
