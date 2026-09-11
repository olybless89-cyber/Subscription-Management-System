'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { ApiError } from '../../_lib/api';

interface Invoice {
  id: string;
  invoiceNumber: string;
  customerId: string;
  type: 'RECEIPT' | 'DUE';
  status: 'PENDING' | 'PAID';
  amount: number;
  currency: string;
  description: string;
  dueDate: string | null;
  paidAt: string | null;
  issuedAt: string;
}

interface Customer {
  id: string;
  customerCode: string;
  email: string;
}

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

const STATUS_COLOR: Record<string, string> = {
  PAID: 'var(--forest-bright)',
  PENDING: 'var(--clay)',
};

export default function InvoicesPage() {
  const { session } = useAuth();
  const [invoices, setInvoices] = useState<Invoice[] | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [invRes, custRes] = await Promise.all([
        fetch('/api/admin/invoices', { headers: { Authorization: `Bearer ${session.token}` } }),
        fetch('/api/admin/customers', { headers: { Authorization: `Bearer ${session.token}` } }),
      ]);
      if (!invRes.ok) throw new ApiError('Failed to load invoices', invRes.status);
      if (!custRes.ok) throw new ApiError('Failed to load customers', custRes.status);
      const invData = await invRes.json();
      const custData = await custRes.json();
      setInvoices(invData.invoices);
      setCustomers(custData.customers);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load invoices');
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  // A plain <a href> can't carry the Authorization bearer token, so a
  // click would just 403 — fetch the PDF as a blob with the token
  // attached, then open it from an object URL instead.
  async function handleViewPdf(invoiceId: string) {
    if (!session) return;
    setPdfError(null);
    setOpeningId(invoiceId);
    try {
      const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to load PDF (${res.status})`);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (err) {
      setPdfError(err instanceof Error ? err.message : 'Failed to open PDF');
    } finally {
      setOpeningId(null);
    }
  }

  function customerLabel(id: string): string {
    const c = customers.find((c) => c.id === id);
    return c ? `${c.customerCode} — ${c.email}` : id;
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Invoices</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Auto-generated on payment (receipts) and when a subscription becomes due — nothing here is
        created manually.
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {pdfError && <p className="error-text">{pdfError}</p>}
      {!invoices && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
      {invoices && invoices.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No invoices yet.</p>}

      {invoices && invoices.length > 0 && (
        <div className="card">
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Invoice #</th>
                  <th>Customer</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Amount</th>
                  <th>Date</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="mono">{inv.invoiceNumber}</td>
                    <td>{customerLabel(inv.customerId)}</td>
                    <td>{inv.type === 'RECEIPT' ? 'Receipt' : 'Due'}</td>
                    <td>
                      <span className="status-dot" style={{ background: STATUS_COLOR[inv.status] }} />
                      {inv.status}
                    </td>
                    <td className="mono">{formatAmount(inv.amount, inv.currency)}</td>
                    <td className="mono">
                      {inv.type === 'DUE' && inv.dueDate
                        ? `Due ${new Date(inv.dueDate).toLocaleDateString()}`
                        : new Date(inv.issuedAt).toLocaleDateString()}
                    </td>
                    <td>
                      <button
                        onClick={() => handleViewPdf(inv.id)}
                        disabled={openingId === inv.id}
                        className="btn"
                        style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                      >
                        {openingId === inv.id ? 'Opening…' : 'View PDF'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
