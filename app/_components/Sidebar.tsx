'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { authFetch, ApiError } from '../_lib/api';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/dashboard/customers', label: 'Customers' },
  { href: '/dashboard/plans', label: 'Plans' },
  { href: '/dashboard/subscriptions', label: 'Subscriptions' },
  { href: '/dashboard/invoices', label: 'Invoices' },
  { href: '/dashboard/campaigns', label: 'Campaigns' },
  { href: '/dashboard/domains', label: 'Domains' },
  { href: '/dashboard/settings', label: 'Settings' },
];

const ADMINS_NAV_ITEM = { href: '/dashboard/admins', label: 'Admins' };

// Admins is gated by actual permission (canManageOtherAdmins — SUPER_ADMIN,
// or a plain ADMIN explicitly delegated canManageAdmins: true), NOT just
// role, since a plain admin CAN legitimately have that delegation. That
// flag deliberately isn't in the session token (see authorize.ts — so
// revoking it takes effect immediately), so a SUPER_ADMIN always passes
// and a plain ADMIN's access is checked live against
// GET /api/admin/admins below rather than assumed from role alone.

const SUPER_ADMIN_ONLY_NAV_ITEMS = [
  ADMINS_NAV_ITEM,
  { href: '/dashboard/hosting-accounts', label: 'Hosting Accounts' },
  { href: '/dashboard/railway-import', label: 'Import Railway services' },
  { href: '/dashboard/activity', label: 'Activity' },
];

// For the other admins only — see AdminWorkflowDeps's doc comment in
// src/lib/db/ports.ts. Never shown to SUPER_ADMIN, mirroring how
// SUPER_ADMIN_ONLY_NAV_ITEMS above is never shown to a plain ADMIN.
const ADMIN_ONLY_NAV_ITEMS = [
  { href: '/dashboard/reminders', label: 'Reminders & Actions' },
  { href: '/dashboard/reports', label: 'Reports & Analytics' },
  { href: '/dashboard/import', label: 'Import Customers' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { session, logout } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  // Defaults to hidden (fail closed) until the live permission check
  // below resolves — a plain admin without delegation never sees a
  // sidebar link to a page that just 403s on them.
  const [canManageAdmins, setCanManageAdmins] = useState(false);

  useEffect(() => {
    if (!session || session.role !== 'ADMIN') return;
    let cancelled = false;
    authFetch(session.token, '/api/admin/admins')
      .then(() => {
        if (!cancelled) setCanManageAdmins(true);
      })
      .catch((err) => {
        // A 403 means no delegation — stays hidden. Any other error
        // (network blip, etc.) also stays hidden rather than risk
        // showing a link that might not work; the admin can still be
        // reached directly by URL if delegation is confirmed elsewhere.
        if (!cancelled && !(err instanceof ApiError && err.status === 403)) {
          setCanManageAdmins(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [session]);

  const navItems =
    session?.role === 'SUPER_ADMIN'
      ? [...NAV_ITEMS, ...SUPER_ADMIN_ONLY_NAV_ITEMS]
      : session?.role === 'ADMIN'
        ? [...NAV_ITEMS, ...ADMIN_ONLY_NAV_ITEMS, ...(canManageAdmins ? [ADMINS_NAV_ITEM] : [])]
        : NAV_ITEMS;

  function handleLogout() {
    setOpen(false);
    logout();
    router.push('/login');
  }

  return (
    <>
      <button
        className="woh-sidebar-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Close menu' : 'Open menu'}
      >
        {open ? '✕' : '☰'}
      </button>
      <div className={`woh-sidebar-backdrop ${open ? 'open' : ''}`} onClick={() => setOpen(false)} />
      <nav
        className={`woh-sidebar ${open ? 'open' : ''}`}
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
            SUBSCRIPTION MANAGER
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3em', flex: 1 }}>
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
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
    </>
  );
}
