'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Campaign {
  id: string;
  name: string;
  channels: Array<'EMAIL' | 'WHATSAPP'>;
  status: 'DRAFT' | 'SENDING' | 'SENT';
  createdAt: string;
  sentAt: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

const STATUS_COLOR: Record<string, string> = {
  DRAFT: 'var(--ink-soft)',
  SENDING: 'var(--clay)',
  SENT: 'var(--forest-bright)',
};

export default function CampaignsPage() {
  const { session } = useAuth();
  const [campaigns, setCampaigns] = useState<Campaign[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [channels, setChannels] = useState<{ email: boolean; whatsapp: boolean }>({ email: true, whatsapp: false });
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [campData, custData] = await Promise.all([
        authFetch<{ campaigns: Campaign[] }>(session.token, '/api/admin/campaigns'),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
      ]);
      setCampaigns(campData.campaigns);
      setCustomers(custData.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load campaigns');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  function toggleCustomer(id: string) {
    setSelectedCustomerIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setFormError(null);
    setFormNotice(null);

    const selectedChannels: Array<'EMAIL' | 'WHATSAPP'> = [
      ...(channels.email ? (['EMAIL'] as const) : []),
      ...(channels.whatsapp ? (['WHATSAPP'] as const) : []),
    ];
    if (selectedChannels.length === 0) {
      setFormError('Choose at least one channel');
      return;
    }
    if (selectedCustomerIds.size === 0) {
      setFormError('Select at least one customer');
      return;
    }

    setSubmitting(true);
    try {
      const result = await authFetch<{ outcome: string; campaign?: Campaign }>(session.token, '/api/admin/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          channels: selectedChannels,
          subject: channels.email ? subject : undefined,
          message,
          customerIds: [...selectedCustomerIds],
        }),
      });
      setFormNotice(`Created "${result.campaign?.name}" as a draft — review and send it from the list below.`);
      setName('');
      setSubject('');
      setMessage('');
      setSelectedCustomerIds(new Set());
      setChannels({ email: true, whatsapp: false });
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create campaign');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Campaigns</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Bulk messages to a hand-picked set of customers, by email and/or WhatsApp. Created as a
        draft first — nothing sends until you open it and press Send.
      </p>

      <div className="layout-main-side" style={{ marginTop: '1.5em' }}>
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!campaigns && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {campaigns && campaigns.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No campaigns yet — create one on the right.</p>
          )}
          {campaigns && campaigns.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Channels</th>
                    <th>Status</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <a href={`/dashboard/campaigns/${c.id}`} style={{ color: 'var(--forest-bright)', textDecoration: 'none' }}>
                          {c.name}
                        </a>
                      </td>
                      <td className="mono">{c.channels.join(', ')}</td>
                      <td>
                        <span className="status-dot" style={{ background: STATUS_COLOR[c.status] }} />
                        {c.status}
                      </td>
                      <td className="mono">{new Date(c.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>New campaign</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="camp-name">Name</label>
              <input id="camp-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="September promo" />
            </div>

            <div className="field">
              <label>Channels</label>
              <div style={{ display: 'flex', gap: '1.2em' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4em', fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={channels.email}
                    onChange={(e) => setChannels((c) => ({ ...c, email: e.target.checked }))}
                    style={{ width: 'auto' }}
                  />
                  Email
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.4em', fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={channels.whatsapp}
                    onChange={(e) => setChannels((c) => ({ ...c, whatsapp: e.target.checked }))}
                    style={{ width: 'auto' }}
                  />
                  WhatsApp
                </label>
              </div>
            </div>

            {channels.email && (
              <div className="field">
                <label htmlFor="camp-subject">Email subject</label>
                <input id="camp-subject" required value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>
            )}

            <div className="field">
              <label htmlFor="camp-message">Message</label>
              <textarea
                id="camp-message"
                required
                rows={5}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                style={{ padding: '0.6em 0.7em', border: '1px solid var(--line-strong)', borderRadius: 4, background: 'var(--paper-raised)', fontFamily: 'inherit', resize: 'vertical' }}
              />
              {channels.whatsapp && (
                <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', margin: '0.3em 0 0' }}>
                  For WhatsApp, this text becomes the single variable in your approved template —
                  it won't send at all if that template isn't approved yet.
                </p>
              )}
            </div>

            <div className="field">
              <label>Recipients ({selectedCustomerIds.size} selected)</label>
              <div style={{ maxHeight: 220, overflowY: 'auto', border: '1px solid var(--line-strong)', borderRadius: 4, padding: '0.6em' }}>
                {customers.length === 0 && <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em', margin: 0 }}>No customers yet.</p>}
                {customers.map((c) => (
                  <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '0.6em', padding: '0.3em 0', cursor: 'pointer', fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      checked={selectedCustomerIds.has(c.id)}
                      onChange={() => toggleCustomer(c.id)}
                      style={{ width: 'auto' }}
                    />
                    <span className="mono" style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>{c.customerCode}</span>
                    <span style={{ fontSize: '0.9em' }}>{c.email}</span>
                  </label>
                ))}
              </div>
            </div>

            {formError && <p className="error-text">{formError}</p>}
            {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Creating…' : 'Create draft'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
