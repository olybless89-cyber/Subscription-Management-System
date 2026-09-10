'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../_components/AuthProvider';
import { authFetch, ApiError } from '../../../_lib/api';

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  suspensionEnabled: boolean;
  currentPeriodEnd: string;
  nextBillingDate: string;
  gracePeriodEnd: string | null;
  dryRunOverride: boolean | null;
}

interface Plan {
  id: string;
  name: string;
}

export default function SubscriptionDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [planId, setPlanId] = useState('');
  const [suspensionEnabled, setSuspensionEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [actionPending, setActionPending] = useState<'suspend' | 'restore' | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [subData, planData] = await Promise.all([
        authFetch<{ subscription: Subscription }>(session.token, `/api/admin/subscriptions/${params.id}`),
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
      ]);
      setSubscription(subData.subscription);
      setPlanId(subData.subscription.planId);
      setSuspensionEnabled(subData.subscription.suspensionEnabled);
      setPlans(planData.plans);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load subscription');
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !subscription) return;
    setSaveError(null);
    setSaveNotice(null);
    setSaving(true);
    try {
      await authFetch(session.token, `/api/admin/subscriptions/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ planId, suspensionEnabled }),
      });
      setSaveNotice('Saved');
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspendOrRestore(action: 'suspend' | 'restore') {
    if (!session) return;
    setActionNotice(null);
    setActionPending(action);
    try {
      const result = await authFetch<{ outcome: string; reason?: string }>(
        session.token,
        `/api/subscriptions/${params.id}/${action}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActionNotice(`${action === 'suspend' ? 'Suspend' : 'Restore'} outcome: ${result.outcome}`);
      await load();
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setActionPending(null);
    }
  }

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (!subscription) return <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Subscription</h1>
      <p className="mono" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>{subscription.id}</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2em', alignItems: 'start', marginTop: '1.5em' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Details</h2>
          <table className="data-table">
            <tbody>
              <tr><th>Status</th><td>{subscription.status}</td></tr>
              <tr><th>Next billing</th><td className="mono">{new Date(subscription.nextBillingDate).toLocaleString()}</td></tr>
              <tr><th>Current period ends</th><td className="mono">{new Date(subscription.currentPeriodEnd).toLocaleString()}</td></tr>
              <tr><th>Grace period ends</th><td className="mono">{subscription.gracePeriodEnd ? new Date(subscription.gracePeriodEnd).toLocaleString() : '—'}</td></tr>
              <tr>
                <th>Dry-run override</th>
                <td>
                  {subscription.dryRunOverride === null
                    ? 'Inherits global setting'
                    : subscription.dryRunOverride
                      ? 'TRUE — will never really suspend/restore'
                      : 'FALSE — real, regardless of global setting'}
                </td>
              </tr>
            </tbody>
          </table>

          <div style={{ marginTop: '1.5em', display: 'flex', gap: '0.6em' }}>
            <button
              className="btn"
              disabled={actionPending !== null}
              onClick={() => handleSuspendOrRestore('suspend')}
            >
              {actionPending === 'suspend' ? 'Suspending…' : 'Suspend now'}
            </button>
            <button
              className="btn"
              disabled={actionPending !== null}
              onClick={() => handleSuspendOrRestore('restore')}
            >
              {actionPending === 'restore' ? 'Restoring…' : 'Restore now'}
            </button>
          </div>
          {actionNotice && <p style={{ fontSize: '0.9em', marginTop: '0.8em' }}>{actionNotice}</p>}
          <p style={{ fontSize: '0.8em', color: 'var(--ink-soft)', marginTop: '0.8em' }}>
            These call the real suspend/restore engine. Check the dry-run override above before
            testing against a real customer.
          </p>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Edit</h2>
          <form onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="edit-plan">Plan</label>
              <select id="edit-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6em' }}>
              <input
                id="edit-suspension-enabled"
                type="checkbox"
                checked={suspensionEnabled}
                onChange={(e) => setSuspensionEnabled(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label htmlFor="edit-suspension-enabled" style={{ margin: 0 }}>Automatic suspension enabled</label>
            </div>

            {saveError && <p className="error-text">{saveError}</p>}
            {saveNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{saveNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
