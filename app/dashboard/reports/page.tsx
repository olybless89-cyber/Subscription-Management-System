'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  status: string;
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
}

function daysFromNow(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function toCsv(rows: Array<Record<string, string | number>>): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}

function downloadCsv(filename: string, rows: Array<Record<string, string | number>>) {
  const csv = toCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Bar({ label, value, max, formatValue }: { label: string; value: number; max: number; formatValue: (n: number) => string }) {
  const pct = max > 0 ? Math.max((value / max) * 100, value > 0 ? 2 : 0) : 0;
  return (
    <div style={{ marginBottom: '0.6em' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.82em', marginBottom: '0.2em' }}>
        <span>{label}</span>
        <span className="mono" style={{ color: 'var(--ink-soft)' }}>{formatValue(value)}</span>
      </div>
      <div style={{ background: 'var(--paper-raised)', border: '1px solid var(--line-strong)', borderRadius: 3, height: 10 }}>
        <div style={{ width: `${pct}%`, background: 'var(--clay)', height: '100%', borderRadius: 3 }} />
      </div>
    </div>
  );
}

export default function ReportsPage() {
  const { session } = useAuth();
  const isAdmin = session?.role === 'ADMIN';

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [custData, planData, subData] = await Promise.all([
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
        authFetch<{ subscriptions: Subscription[] }>(session.token, '/api/admin/subscriptions'),
      ]);
      setCustomers(custData.customers);
      setPlans(planData.plans);
      setSubscriptions(subData.subscriptions);
      setLoaded(true);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans]);
  const customerById = useMemo(() => new Map(customers.map((c) => [c.id, c])), [customers]);

  const activeSubscriptions = useMemo(
    () => subscriptions.filter((s) => s.status === 'ACTIVE' || s.status === 'PAYMENT_DUE' || s.status === 'GRACE_PERIOD'),
    [subscriptions]
  );

  const dueWithin30 = useMemo(() => activeSubscriptions.filter((s) => daysFromNow(s.nextBillingDate) >= 0 && daysFromNow(s.nextBillingDate) <= 30), [activeSubscriptions]);
  const overdue = useMemo(() => activeSubscriptions.filter((s) => daysFromNow(s.nextBillingDate) < 0), [activeSubscriptions]);

  // Amounts are stored in minor units (kobo/cents) throughout this app —
  // divide by 100 for a human-readable major-unit figure, same
  // convention as src/lib/invoices/manage.ts.
  const monthlyValue = useMemo(
    () => activeSubscriptions.reduce((sum, s) => sum + (planById.get(s.planId)?.amount ?? 0), 0) / 100,
    [activeSubscriptions, planById]
  );
  const due30DayValue = useMemo(
    () => dueWithin30.reduce((sum, s) => sum + (planById.get(s.planId)?.amount ?? 0), 0) / 100,
    [dueWithin30, planById]
  );

  const revenueByPlan = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of activeSubscriptions) {
      const plan = planById.get(s.planId);
      if (!plan) continue;
      totals.set(plan.name, (totals.get(plan.name) ?? 0) + plan.amount / 100);
    }
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
  }, [activeSubscriptions, planById]);

  const dueDistribution = useMemo(() => {
    const buckets = { Overdue: 0, '0-7 days': 0, '8-14 days': 0, '15-30 days': 0, '30+ days': 0 };
    for (const s of activeSubscriptions) {
      const d = daysFromNow(s.nextBillingDate);
      if (d < 0) buckets['Overdue']++;
      else if (d <= 7) buckets['0-7 days']++;
      else if (d <= 14) buckets['8-14 days']++;
      else if (d <= 30) buckets['15-30 days']++;
      else buckets['30+ days']++;
    }
    return Object.entries(buckets);
  }, [activeSubscriptions]);

  const topCustomersByValue = useMemo(() => {
    const totals = new Map<string, number>();
    for (const s of activeSubscriptions) {
      const plan = planById.get(s.planId);
      if (!plan) continue;
      totals.set(s.customerId, (totals.get(s.customerId) ?? 0) + plan.amount / 100);
    }
    return [...totals.entries()]
      .map(([customerId, value]) => ({ customer: customerById.get(customerId), value }))
      .filter((r) => r.customer)
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [activeSubscriptions, planById, customerById]);

  function exportCustomersCsv() {
    downloadCsv(
      'customers.csv',
      customers.map((c) => ({ customerCode: c.customerCode, name: c.name, email: c.email, status: c.status }))
    );
  }

  function exportSubscriptionsCsv() {
    downloadCsv(
      'subscriptions.csv',
      subscriptions.map((s) => ({
        customer: customerById.get(s.customerId)?.name ?? s.customerId,
        plan: planById.get(s.planId)?.name ?? s.planId,
        status: s.status,
        nextBillingDate: s.nextBillingDate,
      }))
    );
  }

  if (!isAdmin) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        Reports &amp; Analytics is only available to admins, scoped to their own assigned customers.
      </p>
    );
  }

  const maxRevenue = Math.max(...revenueByPlan.map(([, v]) => v), 0);
  const maxBucket = Math.max(...dueDistribution.map(([, v]) => v), 0);
  const maxCustomerValue = Math.max(...topCustomersByValue.map((r) => r.value), 0);

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Reports &amp; Analytics</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        A snapshot of your assigned customers and subscriptions.
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {!loaded && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}

      {loaded && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.8em', marginTop: '1.5em' }}>
            {[
              { label: 'Customers', value: customers.length.toString() },
              { label: 'Active subscriptions', value: activeSubscriptions.length.toString() },
              { label: 'Due within 30 days', value: dueWithin30.length.toString() },
              { label: 'Overdue', value: overdue.length.toString() },
              { label: 'Monthly value', value: monthlyValue.toLocaleString() },
              { label: 'Due (30d) value', value: due30DayValue.toLocaleString() },
            ].map((tile) => (
              <div key={tile.label} className="card" style={{ padding: '1em' }}>
                <p style={{ margin: 0, fontSize: '0.78em', color: 'var(--ink-soft)' }}>{tile.label}</p>
                <p style={{ margin: '0.2em 0 0', fontSize: '1.4em', fontWeight: 700 }} className="mono">{tile.value}</p>
              </div>
            ))}
          </div>

          <div className="layout-main-side" style={{ marginTop: '1.5em' }}>
            <div className="card">
              <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Revenue by plan</h2>
              {revenueByPlan.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>No active subscriptions yet.</p>}
              {revenueByPlan.map(([name, value]) => (
                <Bar key={name} label={name} value={value} max={maxRevenue} formatValue={(n) => n.toLocaleString()} />
              ))}
            </div>

            <div className="card">
              <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Renewal due distribution</h2>
              {dueDistribution.map(([label, value]) => (
                <Bar key={label} label={label} value={value} max={maxBucket} formatValue={(n) => n.toString()} />
              ))}
            </div>
          </div>

          <div className="card" style={{ marginTop: '1.5em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Top customers by value</h2>
            {topCustomersByValue.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>No active subscriptions yet.</p>}
            {topCustomersByValue.length > 0 && (
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Customer</th>
                      <th>Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topCustomersByValue.map((r) => (
                      <tr key={r.customer!.id}>
                        <td>{r.customer!.name}</td>
                        <td className="mono">{r.value.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card" style={{ marginTop: '1.5em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Export</h2>
            <div style={{ display: 'flex', gap: '0.8em' }}>
              <button type="button" className="btn" onClick={exportCustomersCsv}>Export customers CSV</button>
              <button type="button" className="btn" onClick={exportSubscriptionsCsv}>Export subscriptions CSV</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
