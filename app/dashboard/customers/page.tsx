'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  email: string;
  status: string;
  automaticSuspension: boolean;
  paymentProvider: 'PAYSTACK' | 'FLUTTERWAVE';
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--forest-bright)',
  SUSPENDED: 'var(--clay)',
  CANCELLED: 'var(--ink-soft)',
  TERMINATED: 'var(--danger)',
};

export default function CustomersPage() {
  const { session } = useAuth();
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<'PAYSTACK' | 'FLUTTERWAVE'>('PAYSTACK');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers');
      setCustomers(data.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load customers');
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
    setSubmitting(true);
    try {
      const result = await authFetch<{ outcome: string; customer?: Customer }>(
        session.token,
        '/api/admin/customers',
        { method: 'POST', body: JSON.stringify({ name, email, phone: phone || undefined, paymentProvider }) }
      );
      setFormNotice(`Created ${result.customer?.customerCode}`);
      setName('');
      setEmail('');
      setPhone('');
      setPaymentProvider('PAYSTACK');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Customers</h1>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '2em', alignItems: 'start' }}>
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!customers && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {customers && customers.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No customers yet — create one on the right.</p>
          )}
          {customers && customers.length > 0 && (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>Provider</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.customerCode}</td>
                    <td>{c.email}</td>
                    <td>
                      <span
                        className="status-dot"
                        style={{ background: STATUS_COLOR[c.status] ?? 'var(--ink-soft)' }}
                      />
                      {c.status}
                    </td>
                    <td className="mono">{c.paymentProvider}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>New customer</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="name">Name</label>
              <input id="name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="cust-email">Email</label>
              <input id="cust-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone (optional)</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="provider">Payment provider</label>
              <select
                id="provider"
                value={paymentProvider}
                onChange={(e) => setPaymentProvider(e.target.value as 'PAYSTACK' | 'FLUTTERWAVE')}
              >
                <option value="PAYSTACK">Paystack</option>
                <option value="FLUTTERWAVE">Flutterwave (not yet implemented)</option>
              </select>
            </div>

            {formError && <p className="error-text">{formError}</p>}
            {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Creating…' : 'Create customer'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
