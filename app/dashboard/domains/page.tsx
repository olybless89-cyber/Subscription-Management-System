'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Domain {
  id: string;
  customerId: string;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

export default function DomainsPage() {
  const { session } = useAuth();
  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [domainName, setDomainName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [domData, custData] = await Promise.all([
        authFetch<{ domains: Domain[] }>(session.token, '/api/admin/domains'),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
      ]);
      setDomains(domData.domains);
      setCustomers(custData.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load domains');
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
    if (!customerId) {
      setFormError('Choose a customer');
      return;
    }
    setSubmitting(true);
    try {
      const result = await authFetch<{ outcome: string; domain?: Domain }>(session.token, '/api/admin/domains', {
        method: 'POST',
        body: JSON.stringify({ customerId, domainName, isPrimary }),
      });
      setFormNotice(`Attached ${result.domain?.domainName}`);
      setDomainName('');
      setIsPrimary(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to attach domain');
    } finally {
      setSubmitting(false);
    }
  }

  function customerLabel(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.customerCode} — ${c.email}` : id;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Domains</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2em', alignItems: 'start' }}>
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!domains && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {domains && domains.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No domains yet — attach one on the right.</p>
          )}
          {domains && domains.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Customer</th>
                  <th>Primary</th>
                  <th>Railway status</th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => (
                  <tr key={d.id}>
                    <td className="mono">{d.domainName}</td>
                    <td>{customerLabel(d.customerId)}</td>
                    <td>{d.isPrimary ? 'Yes' : ''}</td>
                    <td className="mono">{d.railwayStatus ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Attach domain</h2>
          {customers.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Create a customer first.</p>
          ) : (
            <form onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="dom-customer">Customer</label>
                <select id="dom-customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} required>
                  <option value="">Select a customer…</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.customerCode} — {c.email}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="dom-name">Domain name</label>
                <input
                  id="dom-name"
                  required
                  value={domainName}
                  onChange={(e) => setDomainName(e.target.value)}
                  placeholder="example.com"
                />
              </div>
              <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6em' }}>
                <input
                  id="dom-primary"
                  type="checkbox"
                  checked={isPrimary}
                  onChange={(e) => setIsPrimary(e.target.checked)}
                  style={{ width: 'auto' }}
                />
                <label htmlFor="dom-primary" style={{ margin: 0 }}>Primary domain</label>
              </div>

              {formError && <p className="error-text">{formError}</p>}
              {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
                {submitting ? 'Attaching…' : 'Attach domain'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
