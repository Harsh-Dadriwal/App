import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

// Self-hosted by Next at build time: no render-blocking request to Google Fonts, and no
// layout shift when the font arrives.
const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
  variable: '--font-sans'
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f4f6fb' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0f1d' }
  ]
};

export const metadata: Metadata = {
  title: 'Mahalaxmi Electricals',
  description: 'Role-based application for Mahalaxmi Electricals',
  icons: {
    icon: '/icon.svg',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={sans.variable} suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before the first paint, so dark mode never flashes light. */}
        <script
          dangerouslySetInnerHTML={{
            __html: "try{if(localStorage.getItem('mahalaxmi-theme')==='dark')document.documentElement.dataset.theme='dark'}catch(e){}"
          }}
        />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
