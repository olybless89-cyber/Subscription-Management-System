'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../_components/AuthProvider';
import { authFetch, ApiError } from '../_lib/api';

interface ServiceItem {
  id: string;
  hostingMode: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  lastSyncedAt: string | null;
  customer: { id: string; name: string; customerCode: string };
  subscriptionStatus: string;
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--forest-bright)',
  STOPPED: 'var(--clay)',
  ERROR: 'var(--danger)',
  UNKNOWN: 'var(--ink-soft)',
};

export default function DashboardHome() {
  const { session } = useAuth();
  const [services, setServices] = useState<ServiceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authFetch<{ services: ServiceItem[] }>(session.token, '/api/admin/services');
      setServices(data.services);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to load services.');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const counts = (services ?? []).reduce(
    (acc, s) => {
      acc[s.status] = (acc[s.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Dashboard</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
        Signed in as {session?.email} ({session?.role}).
      </p>

      <div className="layout-3col" style={{ marginTop: '2em' }}>
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
        {session?.role === 'SUPER_ADMIN' && (
          <a href="/dashboard/admins" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Admins &amp; delegation</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
              Create admins and choose which customers each one can see and manage.
            </div>
          </a>
        )}
      </div>

      <div style={{ marginTop: '2.5em' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6em', marginBottom: '0.9em' }}>
          <h2 style={{ fontSize: '1.15em', fontWeight: 700, margin: 0 }}>Your infrastructure</h2>
          <span style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>
            Auto-synced from Railway every 30 minutes — every service currently mapped to a customer.
          </span>
        </div>

        {error && <p className="error-text">{error}</p>}

        {!error && services === null && (
          <p style={{ color: 'var(--ink-soft)' }}>Loading services…</p>
        )}

        {services !== null && (
          <>
            <div className="layout-3col" style={{ marginBottom: '1.2em', gridTemplateColumns: 'repeat(4, 1fr)' }}>
              {(['ACTIVE', 'STOPPED', 'ERROR', 'UNKNOWN'] as const).map((s) => (
                <div key={s} className="card" style={{ padding: '1em 1.2em' }}>
                  <div style={{ fontSize: '0.78em', color: 'var(--ink-soft)', fontWeight: 500, letterSpacing: '0.02em' }}>
                    {s}
                  </div>
                  <div style={{ fontSize: '1.6em', fontWeight: 700, marginTop: '0.15em' }}>{counts[s] ?? 0}</div>
                </div>
              ))}
            </div>

            {services.length === 0 ? (
              <div className="card" style={{ color: 'var(--ink-soft)' }}>
                No Railway resources have been mapped to a customer yet — add one from a subscription's page.
              </div>
            ) : (
              <div className="card table-scroll" style={{ padding: 0 }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Customer</th>
                      <th>Hosting mode</th>
                      <th>Subscription</th>
                      <th>Last synced</th>
                    </tr>
                  </thead>
                  <tbody>
                    {services.map((s) => (
                      <tr key={s.id}>
                        <td>
                          <span className="status-dot" style={{ background: STATUS_COLOR[s.status] }} />
                          {s.status}
                        </td>
                        <td>
                          <a href={`/dashboard/customers/${s.customer.id}`} style={{ textDecoration: 'none' }}>
                            {s.customer.name} <span className="mono" style={{ color: 'var(--ink-soft)' }}>({s.customer.customerCode})</span>
                          </a>
                        </td>
                        <td>{s.hostingMode.replace('_', ' ')}</td>
                        <td>{s.subscriptionStatus}</td>
                        <td>{s.lastSyncedAt ? new Date(s.lastSyncedAt).toLocaleString() : 'Not synced yet'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
