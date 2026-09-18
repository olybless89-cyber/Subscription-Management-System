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

// ---------- ADMIN-only widgets (see the role-gated section below) ----------
// Kept intentionally separate from the shared "Your infrastructure"
// section above: this whole block only ever renders for
// session?.role === 'ADMIN', never for SUPER_ADMIN, so the existing
// shared dashboard stays pixel-identical for a SUPER_ADMIN session.

interface AdminWidgetCustomer {
  id: string;
  name: string;
  dateOfBirth: string | null;
}

interface AdminWidgetSubscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  nextBillingDate: string;
}

interface AdminWidgetPlan {
  id: string;
  name: string;
}

interface AdminWidgetNotification {
  id: string;
  customerId: string;
  event: string;
  createdAt: string;
}

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function nextBirthdayFrom(dateOfBirth: string): Date {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let next = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
  if (next.getTime() < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) {
    next = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()));
  }
  return next;
}

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

  // ADMIN-only widget data — never fetched or rendered for SUPER_ADMIN.
  const [adminCustomers, setAdminCustomers] = useState<AdminWidgetCustomer[]>([]);
  const [adminPlans, setAdminPlans] = useState<AdminWidgetPlan[]>([]);
  const [adminSubscriptions, setAdminSubscriptions] = useState<AdminWidgetSubscription[]>([]);
  const [adminNotifications, setAdminNotifications] = useState<AdminWidgetNotification[]>([]);
  const [adminWidgetsLoaded, setAdminWidgetsLoaded] = useState(false);

  const loadAdminWidgets = useCallback(async () => {
    if (!session || session.role !== 'ADMIN') return;
    try {
      const [custData, planData, subData, notifData] = await Promise.all([
        authFetch<{ customers: AdminWidgetCustomer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ plans: AdminWidgetPlan[] }>(session.token, '/api/admin/plans'),
        authFetch<{ subscriptions: AdminWidgetSubscription[] }>(session.token, '/api/admin/subscriptions'),
        authFetch<{ notifications: AdminWidgetNotification[] }>(session.token, '/api/admin/notifications/recent?limit=5'),
      ]);
      setAdminCustomers(custData.customers);
      setAdminPlans(planData.plans);
      setAdminSubscriptions(subData.subscriptions);
      setAdminNotifications(notifData.notifications);
    } finally {
      setAdminWidgetsLoaded(true);
    }
  }, [session]);

  useEffect(() => {
    loadAdminWidgets();
  }, [loadAdminWidgets]);

  const adminCustomerById = new Map(adminCustomers.map((c) => [c.id, c]));
  const adminPlanById = new Map(adminPlans.map((p) => [p.id, p]));
  const adminUrgentRenewals = adminSubscriptions
    .filter((s) => s.status === 'ACTIVE' || s.status === 'PAYMENT_DUE' || s.status === 'GRACE_PERIOD')
    .map((s) => ({ ...s, daysLeft: daysFromNow(s.nextBillingDate) }))
    .filter((s) => s.daysLeft <= 30)
    .sort((a, b) => a.daysLeft - b.daysLeft)
    .slice(0, 5);
  const adminUpcomingBirthdays = adminCustomers
    .filter((c) => c.dateOfBirth)
    .map((c) => ({ customer: c, next: nextBirthdayFrom(c.dateOfBirth as string) }))
    .filter((entry) => entry.next.getTime() - Date.now() <= 30 * 24 * 60 * 60 * 1000)
    .sort((a, b) => a.next.getTime() - b.next.getTime())
    .slice(0, 5);

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
        {session?.role === 'ADMIN' && (
          <>
            <a href="/dashboard/reminders" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Reminders &amp; Actions</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
                Urgent renewals, upcoming birthdays, and one-click Send Reminder / Greet.
              </div>
            </a>
            <a href="/dashboard/reports" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Reports &amp; Analytics</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
                Revenue by plan, renewal distribution, and CSV exports.
              </div>
            </a>
            <a href="/dashboard/import" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Import customers</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
                Bulk-create customers from a CSV file, auto-assigned to you.
              </div>
            </a>
          </>
        )}
        {session?.role === 'SUPER_ADMIN' && (
          <a href="/dashboard/admins" className="card" style={{ textDecoration: 'none', color: 'inherit' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.3em' }}>Admins &amp; delegation</div>
            <div style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
              Create admins and choose which customers each one can see and manage.
            </div>
          </a>
        )}
      </div>

      {session?.role === 'ADMIN' && (
        <div style={{ marginTop: '2.5em' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6em', marginBottom: '0.9em' }}>
            <h2 style={{ fontSize: '1.15em', fontWeight: 700, margin: 0 }}>Reminders &amp; Actions</h2>
            <a href="/dashboard/reminders" style={{ fontSize: '0.85em' }}>View all</a>
          </div>

          {!adminWidgetsLoaded && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}

          {adminWidgetsLoaded && (
            <div className="layout-main-side">
              <div className="card">
                <h3 style={{ fontSize: '0.95em', fontWeight: 600, marginTop: 0 }}>Urgent Renewals</h3>
                {adminUrgentRenewals.length === 0 && (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>Nothing due in the next 30 days.</p>
                )}
                {adminUrgentRenewals.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {adminUrgentRenewals.map((s) => (
                      <li key={s.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3em 0', fontSize: '0.88em', borderTop: '1px solid var(--line)' }}>
                        <span>{adminCustomerById.get(s.customerId)?.name ?? s.customerId} — {adminPlanById.get(s.planId)?.name ?? s.planId}</span>
                        <span className="mono" style={{ color: s.daysLeft < 0 ? 'var(--clay)' : 'var(--ink-soft)' }}>
                          {s.daysLeft < 0 ? `${Math.abs(s.daysLeft)}d overdue` : `${s.daysLeft}d left`}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h3 style={{ fontSize: '0.95em', fontWeight: 600, marginTop: 0 }}>Upcoming Birthdays</h3>
                {adminUpcomingBirthdays.length === 0 && (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>None in the next 30 days.</p>
                )}
                {adminUpcomingBirthdays.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {adminUpcomingBirthdays.map(({ customer, next }) => (
                      <li key={customer.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3em 0', fontSize: '0.88em', borderTop: '1px solid var(--line)' }}>
                        <span>{customer.name}</span>
                        <span className="mono" style={{ color: 'var(--ink-soft)' }}>{next.toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="card">
                <h3 style={{ fontSize: '0.95em', fontWeight: 600, marginTop: 0 }}>Recent Communications</h3>
                {adminNotifications.length === 0 && (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>Nothing sent yet.</p>
                )}
                {adminNotifications.length > 0 && (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {adminNotifications.map((n) => (
                      <li key={n.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.3em 0', fontSize: '0.88em', borderTop: '1px solid var(--line)' }}>
                        <span>{adminCustomerById.get(n.customerId)?.name ?? n.customerId} — {n.event}</span>
                        <span className="mono" style={{ color: 'var(--ink-soft)' }}>{new Date(n.createdAt).toLocaleDateString()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>
      )}

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
