import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Web Oracle Host — Cloud Beyond Limits',
  description:
    'Deploy, scale and manage modern applications with Web Oracle Host — a powerful, intuitive and intelligent cloud control plane built for the next generation.',
  metadataBase: new URL('https://weboracle.host'),
  openGraph: {
    title: 'Web Oracle Host — Cloud Beyond Limits',
    description:
      'Deploy, scale and manage modern applications with a powerful, intuitive cloud control plane built for the next generation.',
    type: 'website',
    siteName: 'Web Oracle Host',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web Oracle Host — Cloud Beyond Limits',
    description:
      'Deploy, scale and manage modern applications with a powerful, intuitive cloud control plane built for the next generation.',
  },
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
