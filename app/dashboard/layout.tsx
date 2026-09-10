'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../_components/AuthProvider';
import { Sidebar } from '../_components/Sidebar';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !session) {
      router.replace('/login');
    }
  }, [loading, session, router]);

  if (loading) {
    return <div style={{ padding: '2em' }}>Loading…</div>;
  }

  if (!session) {
    // Redirect effect above will fire; render nothing in the meantime.
    return null;
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main style={{ flex: 1, padding: '2em 2.5em', maxWidth: 1100 }}>{children}</main>
    </div>
  );
}
