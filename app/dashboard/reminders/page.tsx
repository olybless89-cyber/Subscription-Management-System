'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  dateOfBirth: string | null;
}

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
}

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  nextBillingDate: string;
  reminderDaysBeforeDue: number | null;
  lastRenewalReminderSentAt: string | null;
}

interface NotificationEntry {
  id: string;
  customerId: string;
  channel: string;
  event: string;
  message: string;
  createdAt: string;
}

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

/** Next occurrence of a customer's month/day birthday from today,
 * wrapping to next year if this year's has already passed — purely a
 * display computation, matches the server's month/day-only matching in
 * runBirthdayMessages. */
function nextBirthdayFrom(dateOfBirth: string): Date {
  const dob = new Date(dateOfBirth);
  const now = new Date();
  let next = new Date(Date.UTC(now.getUTCFullYear(), dob.getUTCMonth(), dob.getUTCDate()));
  if (next.getTime() < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).getTime()) {
    next = new Date(Date.UTC(now.getUTCFullYear() + 1, dob.getUTCMonth(), dob.getUTCDate()));
  }
  return next;
}

export default function RemindersPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === 'ADMIN';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [reminderDraft, setReminderDraft] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [custData, planData, subData, notifData] = await Promise.all([
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
        authFetch<{ subscriptions: Subscription[] }>(session.token, '/api/admin/subscriptions'),
        authFetch<{ notifications: NotificationEntry[] }>(session.token, '/api/admin/notifications/recent?limit=20'),
      ]);
      setCustomers(custData.customers);
      setPlans(planData.plans);
      setSubscriptions(subData.subscriptions);
      setNotifications(notifData.notifications);
      setLoaded(true);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);
  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);

  const urgentRenewals = useMemo(
    () =>
      subscriptions
        .filter((s) => s.status === 'ACTIVE' || s.status === 'PAYMENT_DUE' || s.status === 'GRACE_PERIOD')
        .map((s) => ({ ...s, daysLeft: daysFromNow(s.nextBillingDate) }))
        .filter((s) => s.daysLeft <= 30)
        .sort((a, b) => a.daysLeft - b.daysLeft),
    [subscriptions]
  );

  const upcomingBirthdays = useMemo(
    () =>
      customers
        .filter((c) => c.dateOfBirth)
        .map((c) => ({ customer: c, next: nextBirthdayFrom(c.dateOfBirth as string) }))
        .filter((entry) => entry.next.getTime() - Date.now() <= THIRTY_DAYS_MS)
        .sort((a, b) => a.next.getTime() - b.next.getTime()),
    [customers]
  );

  async function sendReminder(subscriptionId: string) {
    if (!session) return;
    setBusyKey(`reminder_${subscriptionId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/subscriptions/${subscriptionId}/send-reminder`, {
        method: 'POST',
      });
      setActionNotice(result.message);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send reminder');
    } finally {
      setBusyKey(null);
    }
  }

  async function sendGreeting(customerId: string) {
    if (!session) return;
    setBusyKey(`greet_${customerId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/customers/${customerId}/send-birthday-greeting`, {
        method: 'POST',
      });
      setActionNotice(result.message);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to send greeting');
    } finally {
      setBusyKey(null);
    }
  }

  async function saveReminderDays(subscriptionId: string) {
    if (!session) return;
    const raw = reminderDraft[subscriptionId];
    const days = raw === undefined || raw === '' ? null : Number(raw);
    if (days !== null && (!Number.isInteger(days) || days < 0)) {
      setActionError('Reminder days must be a whole number of 0 or more (or blank to turn off)');
      return;
    }
    setBusyKey(`days_${subscriptionId}`);
    setActionError(null);
    setActionNotice(null);
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/subscriptions/${subscriptionId}/reminder-days`, {
        method: 'PUT',
        body: JSON.stringify({ days }),
      });
      setActionNotice(result.message);
      await load();
    } catch (err) {
      setActionError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setBusyKey(null);
    }
  }

  if (!isAdmin) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        The Reminders &amp; Actions hub is only available to admins managing their own assigned customers.
      </p>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Reminders &amp; Actions</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Renewals due within 30 days, upcoming birthdays, and your recent outbound messages — all for
        customers assigned to you.
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {actionError && <p className="error-text">{actionError}</p>}
      {actionNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{actionNotice}</p>}
      {!loaded && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}

      {loaded && (
        <>
          <div className="card" style={{ marginTop: '1.5em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Urgent Renewals ({urgentRenewals.length})</h2>
            {urgentRenewals.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Nothing due in the next 30 days.</p>}
            {urgentRenewals.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Plan</th>
                      <th>Due</th>
                      <th>Days left</th>
                      <th>Auto-reminder (days before)</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {urgentRenewals.map((s) => {
                      const customer = customerById.get(s.customerId);
                      const plan = planById.get(s.planId);
                      const draftValue = reminderDraft[s.id] ?? (s.reminderDaysBeforeDue ?? '').toString();
                      return (
                        <tr key={s.id}>
                          <td>{customer?.name ?? s.customerId}</td>
                          <td>{plan?.name ?? s.planId}</td>
                          <td className="mono">{new Date(s.nextBillingDate).toLocaleDateString()}</td>
                          <td className="mono" style={{ color: s.daysLeft < 0 ? 'var(--clay)' : undefined }}>
                            {s.daysLeft < 0 ? `${Math.abs(s.daysLeft)} overdue` : s.daysLeft}
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '0.4em', alignItems: 'center' }}>
                              <input
                                type="number"
                                min={0}
                                max={365}
                                placeholder="off"
                                value={draftValue}
                                onChange={(e) => setReminderDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                                style={{ width: 60, padding: '0.3em 0.4em' }}
                              />
                              <button
                                type="button"
                                className="btn"
                                disabled={busyKey === `days_${s.id}`}
                                onClick={() => saveReminderDays(s.id)}
                              >
                                Save
                              </button>
                            </div>
                          </td>
                          <td>
                            <button
                              type="button"
                              className="btn btn-primary"
                              disabled={busyKey === `reminder_${s.id}`}
                              onClick={() => sendReminder(s.id)}
                            >
                              {busyKey === `reminder_${s.id}` ? 'Sending…' : 'Send Reminder'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Upcoming Birthdays ({upcomingBirthdays.length})</h2>
            {upcomingBirthdays.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>None in the next 30 days.</p>}
            {upcomingBirthdays.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Date</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {upcomingBirthdays.map(({ customer, next }) => (
                      <tr key={customer.id}>
                        <td>{customer.name}</td>
                        <td className="mono">{next.toLocaleDateString()}</td>
                        <td>
                          <button
                            type="button"
                            className="btn"
                            disabled={busyKey === `greet_${customer.id}`}
                            onClick={() => sendGreeting(customer.id)}
                          >
                            {busyKey === `greet_${customer.id}` ? 'Sending…' : 'Greet'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Recent Communications</h2>
            {notifications.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Nothing sent yet.</p>}
            {notifications.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Event</th>
                      <th>Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {notifications.map((n) => (
                      <tr key={n.id}>
                        <td>{customerById.get(n.customerId)?.name ?? n.customerId}</td>
                        <td className="mono">{n.event}</td>
                        <td className="mono">{new Date(n.createdAt).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
