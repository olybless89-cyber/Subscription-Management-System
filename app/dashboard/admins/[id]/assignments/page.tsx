'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../../_components/AuthProvider';
import { authFetch, ApiError } from '../../../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

export default function AdminAssignmentsPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [custData, assignData] = await Promise.all([
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ customerIds: string[] }>(session.token, `/api/admin/admins/${params.id}/assignments`),
      ]);
      setCustomers(custData.customers);
      setSelected(new Set(assignData.customerIds));
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to manage this admin's assignments."
          : err instanceof ApiError
            ? err.message
            : 'Failed to load'
      );
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  function toggle(customerId: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(customerId)) next.delete(customerId);
      else next.add(customerId);
      return next;
    });
  }

  async function handleSave() {
    if (!session) return;
    setSaveError(null);
    setSaveNotice(null);
    setSaving(true);
    try {
      const result = await authFetch<{ outcome: string; message?: string }>(
        session.token,
        `/api/admin/admins/${params.id}/assignments`,
        { method: 'POST', body: JSON.stringify({ customerIds: [...selected] }) }
      );
      setSaveNotice(result.message ?? 'Saved');
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Customer assignments</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Only customers checked below will be visible to this admin, and only these customers'
        payment notifications will reach them.
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {!customers && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}

      {customers && customers.length === 0 && (
        <p style={{ color: 'var(--ink-soft)' }}>
          No customers are visible to you to assign. If you're a delegated admin-manager, you can
          only assign customers you yourself can see.
        </p>
      )}

      {customers && customers.length > 0 && (
        <div className="card" style={{ maxWidth: 480 }}>
          {customers.map((c) => (
            <label
              key={c.id}
              style={{ display: 'flex', alignItems: 'center', gap: '0.6em', padding: '0.4em 0', cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={selected.has(c.id)}
                onChange={() => toggle(c.id)}
                style={{ width: 'auto' }}
              />
              <span className="mono" style={{ color: 'var(--ink-soft)' }}>{c.customerCode}</span>
              <span>{c.email}</span>
            </label>
          ))}

          {saveError && <p className="error-text" style={{ marginTop: '1em' }}>{saveError}</p>}
          {saveNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em', marginTop: '1em' }}>{saveNotice}</p>}

          <button
            className="btn btn-primary"
            onClick={handleSave}
            disabled={saving}
            style={{ marginTop: '1.2em' }}
          >
            {saving ? 'Saving…' : 'Save assignments'}
          </button>
        </div>
      )}
    </div>
  );
}
