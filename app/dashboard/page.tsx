'use client';

import { useAuth } from '../_components/AuthProvider';

export default function DashboardHome() {
  const { session } = useAuth();

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Dashboard</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
        Signed in as {session?.email} ({session?.role}).
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1em', marginTop: '2em' }}>
        <a href="/dashboard/customers" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Customers</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
            View and create hosting customers.
          </div>
        </a>
        <a href="/dashboard/plans" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Plans</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
            Define hosting plans and pricing.
          </div>
        </a>
        <a href="/dashboard/subscriptions" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
          <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Subscriptions</div>
          <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
            Tie customers to plans and track billing.
          </div>
        </a>
      </div>
    </div>
  );
}
