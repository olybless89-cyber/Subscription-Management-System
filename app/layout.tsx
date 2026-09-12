import './globals.css';
import { AuthProvider } from './_components/AuthProvider';

// metadataBase is required for Next.js to turn the opengraph-image route
// below into an ABSOLUTE URL in the actual <meta property="og:image">
// tag. Without it, Next emits a relative path — which works fine when
// Next.js itself renders a preview, but WhatsApp/Twitter/etc.'s link
// crawlers fetch the raw HTML from outside your server and can't
// resolve a relative URL, so the preview image silently fails for them
// specifically even though everything looks fine in a normal browser.
const appUrl = process.env.APP_URL || 'http://localhost:3000';

export const metadata = {
  metadataBase: new URL(appUrl),
  title: 'Web Oracle Host',
  description: 'The billing and infrastructure control plane for modern hosting providers.',
  openGraph: {
    title: 'Web Oracle Host',
    description: 'The billing and infrastructure control plane for modern hosting providers.',
    siteName: 'Web Oracle Host',
    type: 'website',
    images: [{ url: '/og-image.png', width: 1200, height: 630, alt: 'Web Oracle Host' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Web Oracle Host',
    description: 'The billing and infrastructure control plane for modern hosting providers.',
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
