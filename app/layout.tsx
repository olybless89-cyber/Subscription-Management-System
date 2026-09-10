import './globals.css';
import { AuthProvider } from './_components/AuthProvider';

export const metadata = {
  title: 'Web Oracle Host',
  description: 'Hosting management and subscription control plane',
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
