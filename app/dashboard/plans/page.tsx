'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Plan {
  id: string;
  name: string;
  amount: number;
  currency: string;
  billingCycle: string;
  gracePeriodDays: number;
}

const CURRENCIES: Array<{ value: string; symbol: string; label: string }> = [
  { value: 'NGN', symbol: '₦', label: 'Naira (NGN)' },
  { value: 'USD', symbol: '$', label: 'US Dollar (USD)' },
];

const BILLING_CYCLES: Array<{ value: string; label: string }> = [
  { value: 'MONTHLY', label: 'Monthly (1 month)' },
  { value: 'QUARTERLY', label: 'Quarterly (3 months)' },
  { value: 'FOUR_MONTHS', label: 'Every 4 months' },
  { value: 'SEMI_ANNUAL', label: 'Semi-annual (6 months)' },
  { value: 'YEARLY', label: 'Yearly (12 months)' },
  { value: 'CUSTOM', label: 'Custom' },
];

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

export default function PlansPage() {
  const { session } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [currency, setCurrency] = useState('NGN');
  const [amount, setAmount] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'FOUR_MONTHS' | 'SEMI_ANNUAL' | 'YEARLY' | 'CUSTOM'>('MONTHLY');
  const [gracePeriodDays, setGracePeriodDays] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const currencySymbol = CURRENCIES.find((c) => c.value === currency)?.symbol ?? '';

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans');
      setPlans(data.plans);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load plans');
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

    const majorUnits = Number(amount);
    if (!Number.isFinite(majorUnits) || majorUnits <= 0) {
      setFormError(`Enter a valid amount in ${currency}`);
      return;
    }

    setSubmitting(true);
    try {
      const result = await authFetch<{ outcome: string; plan?: Plan }>(session.token, '/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify({
          name,
          amount: Math.round(majorUnits * 100), // major units -> minor units (kobo/cents)
          currency,
          billingCycle,
          gracePeriodDays: Number(gracePeriodDays) || 2,
        }),
      });
      setFormNotice(`Created "${result.plan?.name}"`);
      setName('');
      setAmount('');
      setGracePeriodDays('2');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create plan');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Plans</h1>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!plans && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {plans && plans.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No plans yet — create one on the right.</p>
          )}
          {plans && plans.length > 0 && (
            <div className="table-scroll">
                        <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Amount</th>
                  <th>Billing cycle</th>
                  <th>Grace period</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td>{p.name}</td>
                    <td className="mono">{formatAmount(p.amount, p.currency)}</td>
                    <td>{BILLING_CYCLES.find((c) => c.value === p.billingCycle)?.label ?? p.billingCycle}</td>
                    <td>{p.gracePeriodDays} day{p.gracePeriodDays === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>New plan</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="plan-name">Name</label>
              <input id="plan-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="currency">Currency</label>
              <select id="currency" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                {CURRENCIES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', margin: '0.3em 0 0' }}>
                Different customers can be billed in different currencies and amounts — create as
                many plans as you need.
              </p>
            </div>
            <div className="field">
              <label htmlFor="amount">Amount ({currencySymbol})</label>
              <input
                id="amount"
                type="number"
                min="1"
                step="1"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={currency === 'USD' ? '20' : '25000'}
              />
            </div>
            <div className="field">
              <label htmlFor="cycle">Billing cycle</label>
              <select id="cycle" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as typeof billingCycle)}>
                {BILLING_CYCLES.map((c) => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="grace">Grace period (days)</label>
              <input
                id="grace"
                type="number"
                min="0"
                step="1"
                value={gracePeriodDays}
                onChange={(e) => setGracePeriodDays(e.target.value)}
              />
            </div>

            {formError && <p className="error-text">{formError}</p>}
            {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Creating…' : 'Create plan'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
