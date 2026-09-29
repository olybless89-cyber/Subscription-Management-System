'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';
import { resolveBillingCycleForMonths } from '../../../src/lib/billing/months';

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: string;
  customMonths: number | null;
}

/** Mirrors DEFAULT_MONTHLY_RATE_MINOR_UNITS / DEFAULT_MONTHLY_RATE_CURRENCY
 * in src/lib/billing/manage.ts — the flat rate findOrCreatePlanForMonths
 * uses. Keep both in sync if that rate ever changes. */
const MONTH_TIER_RATE_MINOR_UNITS = 2000; // $20.00
const MONTH_TIER_CURRENCY = 'USD';

/** The 12 standard "N months at the flat rate" tiers, always offered
 * regardless of which Plan rows happen to exist yet — selecting one
 * sends monthsPaid to the API, which resolves or creates the matching
 * plan via findOrCreatePlanForMonths (same helper the per-customer
 * "Months paid" activation control uses). Encoded as `months:N` in the
 * <select> so real plan ids (opaque cuids) never collide with these. */
const MONTH_TIERS = Array.from({ length: 12 }, (_, i) => {
  const months = i + 1;
  const amount = MONTH_TIER_RATE_MINOR_UNITS * months;
  return {
    months,
    value: `months:${months}`,
    label: `${months === 1 ? '1 Month' : `${months} Months`} — ${(amount / 100).toFixed(2)} ${MONTH_TIER_CURRENCY}`,
  };
});

const STATUS_COLOR: Record<string, string> = {
  TRIAL: 'var(--ink-soft)',
  ACTIVE: 'var(--forest-bright)',
  PAYMENT_DUE: 'var(--clay)',
  GRACE_PERIOD: 'var(--clay)',
  SUSPENDED: 'var(--danger)',
  CANCELLED: 'var(--ink-soft)',
  TERMINATED: 'var(--danger)',
};

export default function SubscriptionsPage() {
  const { session } = useAuth();
  const [subscriptions, setSubscriptions] = useState<Subscription[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [planId, setPlanId] = useState('');
  const [status, setStatus] = useState<'TRIAL' | 'ACTIVE'>('TRIAL');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [subsData, custData, planData] = await Promise.all([
        authFetch<{ subscriptions: Subscription[] }>(session.token, '/api/admin/subscriptions'),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
      ]);
      setSubscriptions(subsData.subscriptions);
      setCustomers(custData.customers);
      setPlans(planData.plans);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load subscriptions');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    setFormNotice(null);
    if (!customerId || !planId) {
      setFormError('Choose a customer and a plan');
      return;
    }
    setSubmitting(true);
    try {
      const monthsMatch = /^months:(\d+)$/.exec(planId);
      const payload = monthsMatch
        ? { customerId, monthsPaid: Number.parseInt(monthsMatch[1], 10), status }
        : { customerId, planId, status };
      await authFetch(session.token, '/api/admin/subscriptions', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      setFormNotice('Subscription created');
      setCustomerId('');
      setPlanId('');
      setStatus('TRIAL');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create subscription');
    } finally {
      setSubmitting(false);
    }
  }

  function customerLabel(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.customerCode} — ${c.email}` : id;
  }

  function planLabel(id: string): string {
    return plans.find((p) => p.id === id)?.name ?? id;
  }

  const isStandardTierPlan = useMemo(() => {
    const shapes = MONTH_TIERS.map((tier) => ({
      ...resolveBillingCycleForMonths(tier.months),
      amount: MONTH_TIER_RATE_MINOR_UNITS * tier.months,
    }));
    return (p: Plan) =>
      shapes.some(
        (shape) =>
          shape.billingCycle === p.billingCycle &&
          shape.customMonths === p.customMonths &&
          shape.amount === p.amount &&
          p.currency === MONTH_TIER_CURRENCY
      );
  }, []);

  const customPlans = plans.filter((p) => !isStandardTierPlan(p));

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Subscriptions</h1>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!subscriptions && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {subscriptions && subscriptions.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No subscriptions yet — create one on the right.</p>
          )}
          {subscriptions && subscriptions.length > 0 && (
            <div className="table-scroll">
                        <table className="data-table">
              <thead>
                <tr>
                  <th>Customer</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Next billing</th>
                </tr>
              </thead>
              <tbody>
                {subscriptions.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <a href={`/dashboard/subscriptions/${s.id}`} style={{ color: 'var(--forest-bright)', textDecoration: 'none' }}>
                        {customerLabel(s.customerId)}
                      </a>
                    </td>
                    <td>{planLabel(s.planId)}</td>
                    <td>
                      <span className="status-dot" style={{ background: STATUS_COLOR[s.status] ?? 'var(--ink-soft)' }} />
                      {s.status}
                    </td>
                    <td className="mono">{new Date(s.nextBillingDate).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>New subscription</h2>
          {customers.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>
              You need at least one customer before you can create a subscription.
            </p>
          ) : (
            <form onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="sub-customer">Customer</label>
                <select id="sub-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerCode} — {c.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sub-plan">Plan</label>
                <select id="sub-plan" value={planId} onChange={(e) => setPlanId(e.target.value)} required>
                  <option value="">Select a plan…</option>
                  <optgroup label="Standard (months)">
                    {MONTH_TIERS.map((tier) => (
                      <option key={tier.value} value={tier.value}>
                        {tier.label}
                      </option>
                    ))}
                  </optgroup>
                  {customPlans.length > 0 && (
                    <optgroup label="Other plans">
                      {customPlans.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div className="field">
                <label htmlFor="sub-status">Initial status</label>
                <select id="sub-status" value={status} onChange={(e) => setStatus(e.target.value as 'TRIAL' | 'ACTIVE')}>
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active (skip trial)</option>
                </select>
              </div>

              {formError && <p className="error-text">{formError}</p>}
              {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
                {submitting ? 'Creating…' : 'Create subscription'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
