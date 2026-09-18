'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Domain {
  id: string;
  customerId: string;
  domainName: string;
  isPrimary: boolean;
  subscriptionId: string | null;
  railwayStatus: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

interface Subscription {
  id: string;
  customerId: string;
  status: string;
}

export default function DomainsPage() {
  const { session } = useAuth();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const [domains, setDomains] = useState<Domain[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [customerId, setCustomerId] = useState('');
  const [domainName, setDomainName] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [subscriptionId, setSubscriptionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  // Per-row edit/delete/suspend state, same pattern as the customer
  // detail page's Domains table.
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrimary, setEditPrimary] = useState(false);
  const [editSubscriptionId, setEditSubscriptionId] = useState('');
  const [rowActionPending, setRowActionPending] = useState<string | null>(null);
  const [rowActionError, setRowActionError] = useState<string | null>(null);
  const [rowActionNotice, setRowActionNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [domData, custData, subData] = await Promise.all([
        authFetch<{ domains: Domain[] }>(session.token, '/api/admin/domains'),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
        authFetch<{ subscriptions: Subscription[] }>(session.token, '/api/admin/subscriptions'),
      ]);
      setDomains(domData.domains);
      setCustomers(custData.customers);
      setSubscriptions(subData.subscriptions);
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
        body: JSON.stringify({ customerId, domainName, isPrimary, subscriptionId: subscriptionId || null }),
      });
      setFormNotice(`Attached ${result.domain?.domainName}`);
      setDomainName('');
      setIsPrimary(false);
      setSubscriptionId('');
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

  function startEdit(d: Domain) {
    setRowActionError(null);
    setRowActionNotice(null);
    setConfirmDeleteId(null);
    setEditingDomainId(d.id);
    setEditName(d.domainName);
    setEditPrimary(d.isPrimary);
    setEditSubscriptionId(d.subscriptionId ?? '');
  }

  async function saveEdit(domainId: string) {
    if (!session) return;
    setRowActionError(null);
    setRowActionNotice(null);
    setRowActionPending(domainId);
    try {
      await authFetch(session.token, `/api/admin/domains/${domainId}`, {
        method: 'PATCH',
        body: JSON.stringify({ domainName: editName, isPrimary: editPrimary, subscriptionId: editSubscriptionId || null }),
      });
      setEditingDomainId(null);
      setRowActionNotice('Domain updated');
      await load();
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : 'Failed to update domain');
    } finally {
      setRowActionPending(null);
    }
  }

  async function suspendOrRestore(d: Domain, action: 'suspend' | 'restore') {
    if (!session || !d.subscriptionId) return;
    setRowActionError(null);
    setRowActionNotice(null);
    setRowActionPending(d.id);
    try {
      const result = await authFetch<{ outcome: string }>(
        session.token,
        `/api/subscriptions/${d.subscriptionId}/${action}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setRowActionNotice(`${d.domainName}: ${action} outcome ${result.outcome}`);
      await load();
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setRowActionPending(null);
    }
  }

  async function deleteDomain(domainId: string) {
    if (!session) return;
    if (confirmDeleteId !== domainId) {
      setConfirmDeleteId(domainId);
      return;
    }
    setRowActionError(null);
    setRowActionNotice(null);
    setRowActionPending(domainId);
    try {
      await authFetch(session.token, `/api/admin/domains/${domainId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      setRowActionNotice('Domain permanently removed');
      await load();
    } catch (err) {
      setRowActionError(err instanceof ApiError ? err.message : 'Failed to delete domain');
    } finally {
      setRowActionPending(null);
    }
  }

  const formCustomerSubscriptions = subscriptions.filter((s) => s.customerId === customerId);

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Domains</h1>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!domains && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {domains && domains.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No domains yet — attach one on the right.</p>
          )}
          {domains && domains.length > 0 && (
            <div className="table-scroll">
                        <table className="data-table">
              <thead>
                <tr>
                  <th>Domain</th>
                  <th>Customer</th>
                  <th>Primary</th>
                  <th>Governing subscription</th>
                  <th>Railway status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => {
                  const isEditing = editingDomainId === d.id;
                  const isPending = rowActionPending === d.id;
                  const rowSubs = subscriptions.filter((s) => s.customerId === d.customerId);
                  const linkedSub = subscriptions.find((s) => s.id === d.subscriptionId);
                  return (
                    <tr key={d.id}>
                      {isEditing ? (
                        <>
                          <td>
                            <input value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%' }} />
                          </td>
                          <td>{customerLabel(d.customerId)}</td>
                          <td>
                            <input type="checkbox" checked={editPrimary} onChange={(e) => setEditPrimary(e.target.checked)} />
                          </td>
                          <td>
                            <select value={editSubscriptionId} onChange={(e) => setEditSubscriptionId(e.target.value)} style={{ width: '100%' }}>
                              <option value="">Not linked</option>
                              {rowSubs.map((s) => (
                                <option key={s.id} value={s.id}>{s.id} ({s.status})</option>
                              ))}
                            </select>
                          </td>
                          <td className="mono">{d.railwayStatus ?? '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn btn-primary" disabled={isPending} onClick={() => saveEdit(d.id)} style={{ marginRight: '0.4em' }}>
                              {isPending ? 'Saving…' : 'Save'}
                            </button>
                            <button className="btn" onClick={() => setEditingDomainId(null)}>Cancel</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="mono">{d.domainName}</td>
                          <td>
                            <a href={`/dashboard/customers/${d.customerId}`} style={{ color: 'var(--forest-bright)' }}>
                              {customerLabel(d.customerId)}
                            </a>
                          </td>
                          <td>{d.isPrimary ? 'Yes' : ''}</td>
                          <td className="mono" style={{ fontSize: '0.85em' }}>
                            {linkedSub ? `${linkedSub.id} (${linkedSub.status})` : d.subscriptionId ? d.subscriptionId : '—'}
                          </td>
                          <td className="mono">{d.railwayStatus ?? '—'}</td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            <button className="btn" onClick={() => startEdit(d)} style={{ marginRight: '0.4em' }}>Edit</button>
                            {d.subscriptionId && (
                              <>
                                <button className="btn" disabled={isPending} onClick={() => suspendOrRestore(d, 'suspend')} style={{ marginRight: '0.4em' }}>
                                  Suspend
                                </button>
                                <button className="btn" disabled={isPending} onClick={() => suspendOrRestore(d, 'restore')} style={{ marginRight: '0.4em' }}>
                                  Restore
                                </button>
                              </>
                            )}
                            {isSuperAdmin && (
                              <button className="btn" disabled={isPending} onClick={() => deleteDomain(d.id)} style={{ color: 'var(--danger)' }}>
                                {confirmDeleteId === d.id ? 'Confirm delete' : 'Delete'}
                              </button>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          )}
          {rowActionError && <p className="error-text" style={{ marginBottom: 0 }}>{rowActionError}</p>}
          {rowActionNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em', marginBottom: 0 }}>{rowActionNotice}</p>}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Attach domain</h2>
          {customers.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Create a customer first.</p>
          ) : (
            <form onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="dom-customer">Customer</label>
                <select
                  id="dom-customer"
                  value={customerId}
                  onChange={(e) => {
                    setCustomerId(e.target.value);
                    setSubscriptionId('');
                  }}
                  required
                >
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
              <div className="field">
                <label htmlFor="dom-subscription">Governing subscription (optional)</label>
                <select
                  id="dom-subscription"
                  value={subscriptionId}
                  onChange={(e) => setSubscriptionId(e.target.value)}
                  disabled={!customerId}
                >
                  <option value="">Not linked — suspending the customer suspends every domain</option>
                  {formCustomerSubscriptions.map((s) => (
                    <option key={s.id} value={s.id}>{s.id} ({s.status})</option>
                  ))}
                </select>
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
