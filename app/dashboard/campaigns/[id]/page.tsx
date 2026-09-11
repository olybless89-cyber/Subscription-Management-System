'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../_components/AuthProvider';
import { authFetch, ApiError } from '../../../_lib/api';

interface Campaign {
  id: string;
  name: string;
  channels: Array<'EMAIL' | 'WHATSAPP'>;
  subject: string | null;
  message: string;
  status: 'DRAFT' | 'SENDING' | 'SENT';
  createdAt: string;
  sentAt: string | null;
}

interface Recipient {
  id: string;
  customerId: string;
  channel: 'EMAIL' | 'WHATSAPP';
  status: 'PENDING' | 'SENT' | 'FAILED';
  sentAt: string | null;
  error: string | null;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

const STATUS_COLOR: Record<string, string> = {
  PENDING: 'var(--ink-soft)',
  SENT: 'var(--forest-bright)',
  FAILED: 'var(--danger)',
};

export default function CampaignDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [sendNotice, setSendNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [detailData, custData] = await Promise.all([
        authFetch<{ campaign: Campaign; recipients: Recipient[] }>(session.token, `/api/admin/campaigns/${params.id}`),
        authFetch<{ customers: Customer[] }>(session.token, '/api/admin/customers'),
      ]);
      setCampaign(detailData.campaign);
      setRecipients(detailData.recipients);
      setCustomers(custData.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load campaign');
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSend() {
    if (!session) return;
    setSendError(null);
    setSendNotice(null);
    setSending(true);
    try {
      const result = await authFetch<{ outcome: string; message: string; sent: number; failed: number }>(
        session.token,
        `/api/admin/campaigns/${params.id}/send`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setSendNotice(result.message);
      await load();
    } catch (err) {
      setSendError(err instanceof ApiError ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  function customerLabel(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.customerCode} — ${c.email}` : id;
  }

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (!campaign) return <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>{campaign.name}</h1>
      <p className="mono" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
        {campaign.channels.join(', ')} — {campaign.status}
      </p>

      <div className="card" style={{ marginTop: '1em', maxWidth: 600 }}>
        {campaign.subject && (
          <p style={{ margin: '0 0 0.6em' }}><strong>Subject:</strong> {campaign.subject}</p>
        )}
        <p style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{campaign.message}</p>
      </div>

      {campaign.status === 'DRAFT' && (
        <div style={{ marginTop: '1em' }}>
          <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
            {sending ? 'Sending…' : `Send to ${recipients.length} recipient(s)`}
          </button>
          {sendError && <p className="error-text" style={{ marginTop: '0.6em' }}>{sendError}</p>}
          {sendNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em', marginTop: '0.6em' }}>{sendNotice}</p>}
        </div>
      )}

      <div className="card" style={{ marginTop: '1.5em' }}>
        <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.8em' }}>Recipients</h2>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Channel</th>
                <th>Status</th>
                <th>Error</th>
              </tr>
            </thead>
            <tbody>
              {recipients.map((r) => (
                <tr key={r.id}>
                  <td>{customerLabel(r.customerId)}</td>
                  <td className="mono">{r.channel}</td>
                  <td>
                    <span className="status-dot" style={{ background: STATUS_COLOR[r.status] }} />
                    {r.status}
                  </td>
                  <td style={{ fontSize: '0.85em', color: 'var(--danger)' }}>{r.error ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
