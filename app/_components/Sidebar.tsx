'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/plans', label: 'Plans' },
  { href: '/dashboard/subscriptions', label: 'Subscriptions' },
  { href: '/dashboard/domains', label: 'Domains' },
  { href: '/dashboard/admins', label: 'Admins' },
];

const SUPER_ADMIN_ONLY_NAV_ITEMS = [{ href: '/dashboard/activity', label: 'Activity' }];

export function Sidebar() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const router = useRouter();

  const navItems = session?.role === 'SUPER_ADMIN' ? [...NAV_ITEMS, ...SUPER_ADMIN_ONLY_NAV_ITEMS] : NAV_ITEMS;

  function handleLogout() {
    logout();
    router.push('/login');
  }

  return (
    <nav
      style={{
        width: 220,
        flexShrink: 0,
        background: 'var(--forest)',
        color: '#fff',
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        padding: '1.4em 1.2em',
      }}
    >
      <div style={{ marginBottom: '2em' }}>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8em', opacity: 0.7, letterSpacing: '0.02em' }}>
          WEB ORACLE HOST
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3em', flex: 1 }}>
        {navItems.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                padding: '0.55em 0.7em',
                borderRadius: 4,
                textDecoration: 'none',
                color: '#fff',
                background: active ? 'var(--forest-bright)' : 'transparent',
                fontWeight: active ? 600 : 400,
                opacity: active ? 1 : 0.85,
              }}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: '1em', fontSize: '0.85em' }}>
        <div style={{ opacity: 0.75, marginBottom: '0.6em', wordBreak: 'break-all' }}>{session?.email}</div>
        <div style={{ opacity: 0.6, marginBottom: '0.8em', fontFamily: 'var(--font-mono)', fontSize: '0.85em' }}>
          {session?.role}
        </div>
        <button onClick={handleLogout} className="btn" style={{ width: '100%', justifyContent: 'center', background: 'transparent', borderColor: 'rgba(255,255,255,0.3)', color: '#fff' }}>
          Log out
        </button>
      </div>
    </nav>
  );
}
