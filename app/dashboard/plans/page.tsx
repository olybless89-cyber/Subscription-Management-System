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

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

export default function PlansPage() {
  const { session } = useAuth();
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [billingCycle, setBillingCycle] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM'>('MONTHLY');
  const [gracePeriodDays, setGracePeriodDays] = useState('2');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

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

    const naira = Number(amountNaira);
    if (!Number.isFinite(naira) || naira <= 0) {
      setFormError('Enter a valid amount in Naira');
      return;
    }

    setSubmitting(true);
    try {
      const result = await authFetch<{ outcome: string; plan?: Plan }>(session.token, '/api/admin/plans', {
        method: 'POST',
        body: JSON.stringify({
          name,
          amount: Math.round(naira * 100), // Naira -> kobo
          billingCycle,
          gracePeriodDays: Number(gracePeriodDays) || 2,
        }),
      });
      setFormNotice(`Created "${result.plan?.name}"`);
      setName('');
      setAmountNaira('');
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2em', alignItems: 'start' }}>
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!plans && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {plans && plans.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No plans yet — create one on the right.</p>
          )}
          {plans && plans.length > 0 && (
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
                    <td>{p.billingCycle}</td>
                    <td>{p.gracePeriodDays} day{p.gracePeriodDays === 1 ? '' : 's'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <label htmlFor="amount">Amount (₦)</label>
              <input
                id="amount"
                type="number"
                min="1"
                step="1"
                required
                value={amountNaira}
                onChange={(e) => setAmountNaira(e.target.value)}
                placeholder="25000"
              />
            </div>
            <div className="field">
              <label htmlFor="cycle">Billing cycle</label>
              <select id="cycle" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as typeof billingCycle)}>
                <option value="MONTHLY">Monthly</option>
                <option value="QUARTERLY">Quarterly</option>
                <option value="YEARLY">Yearly</option>
                <option value="CUSTOM">Custom</option>
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
