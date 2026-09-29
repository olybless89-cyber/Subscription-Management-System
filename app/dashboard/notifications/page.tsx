'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface AdminNotification {
  id: string;
  adminId: string;
  customerId: string | null;
  event: string;
  message: string;
  sentAt: string | null;
  createdAt: string;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

export default function NotificationsPage() {
  const { session } = useAuth();
  const [notifications, setNotifications] = useState<AdminNotification[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [notifData, custData] = await Promise.all([
        authFetch<{ notifications: AdminNotification[] }>(session.token, '/api/admin/notifications'),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers').catch(() => ({ customers: [] })),
      ]);
      setNotifications(notifData.notifications);
      setCustomers(custData.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load notifications');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  function customerLabel(customerId: string | null): string {
    if (!customerId) return 'Account-wide';
    const c = customers.find((c) => c.id === customerId);
    return c ? `${c.customerCode} — ${c.email}` : customerId;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Notifications</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Every key admin/user action you're notified for — every SUPER_ADMIN sees all of these, a
        plain admin only sees the ones for customers assigned to them. Each one is also emailed to
        you when email is configured (see the "Sent" column).
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {!notifications && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
      {notifications && notifications.length === 0 && (
        <p style={{ color: 'var(--ink-soft)' }}>No notifications yet.</p>
      )}

      {notifications && notifications.length > 0 && (
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Event</th>
                  <th>Customer</th>
                  <th>Message</th>
                  <th>Sent</th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((n) => (
                  <tr key={n.id}>
                    <td className="mono">{new Date(n.createdAt).toLocaleString()}</td>
                    <td className="mono">{n.event}</td>
                    <td>{customerLabel(n.customerId)}</td>
                    <td>{n.message}</td>
                    <td style={{ color: n.sentAt ? 'var(--forest-bright)' : 'var(--ink-soft)' }}>
                      {n.sentAt ? 'Emailed' : 'Not emailed'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
