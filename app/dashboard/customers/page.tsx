'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  websiteType: string | null;
  status: string;
  automaticSuspension: boolean;
  paymentProvider: 'PAYSTACK' | 'FLUTTERWAVE';
  /** Null for a customer with no subscription yet — e.g. one created
   * via CSV import, which only ever creates the Customer + Domain rows.
   * See the "Months paid" activation control below. */
  subscriptionId: string | null;
}

// Curated service categories. The select's value IS the string that
// gets stored (websiteType is free text on the backend) — 'OTHER' is a
// UI-only sentinel that reveals a text box instead of being sent as-is.
const WEBSITE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Not specified' },
  { value: 'Website', label: 'Website' },
  { value: 'Application', label: 'Application' },
  { value: 'Social media management', label: 'Social media management' },
  { value: 'Support', label: 'Support' },
  { value: 'Smart home', label: 'Smart home' },
  { value: 'Solar', label: 'Solar' },
  { value: 'OTHER', label: 'Other' },
];

// Display-only fallback for customers created before websiteType became
// free text — old rows may still hold one of these constant-style values.
const LEGACY_WEBSITE_TYPE_LABELS: Record<string, string> = {
  ONLINE_BANKING: 'Online banking',
  INVESTMENT: 'Investment / business investment',
  ECOMMERCE: 'E-commerce',
  DELIVERY: 'Delivery',
  SAAS: 'SaaS product',
  WEB_APP: 'Web app',
  CORPORATE: 'Corporate / brochure site',
  OTHER: 'Other',
};

function websiteTypeLabel(value: string | null): string {
  if (!value) return '—';
  return LEGACY_WEBSITE_TYPE_LABELS[value] ?? value;
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
  const [notificationEmail, setNotificationEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [websiteType, setWebsiteType] = useState('');
  const [websiteTypeOther, setWebsiteTypeOther] = useState('');
  const [domainName, setDomainName] = useState('');
  const [paymentProvider, setPaymentProvider] = useState<'PAYSTACK' | 'FLUTTERWAVE'>('PAYSTACK');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const [monthsPaidInput, setMonthsPaidInput] = useState<Record<string, string>>({});
  const [activatingId, setActivatingId] = useState<string | null>(null);
  const [activateError, setActivateError] = useState<string | null>(null);
  const [activateNotice, setActivateNotice] = useState<string | null>(null);

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
    if (websiteType === 'OTHER' && !websiteTypeOther.trim()) {
      setFormError('Please specify the website type for "Other"');
      return;
    }
    setSubmitting(true);
    try {
      const result = await authFetch<{
        outcome: string;
        customer?: Customer;
        domainOutcome?: string;
        domainMessage?: string;
      }>(session.token, '/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          notificationEmail: notificationEmail || undefined,
          phone: phone || undefined,
          dateOfBirth: dateOfBirth || undefined,
          serviceStartDate: serviceStartDate || undefined,
          serviceEndDate: serviceEndDate || undefined,
          websiteType: websiteType === 'OTHER' ? websiteTypeOther.trim() : websiteType || undefined,
          domainName: domainName || undefined,
          paymentProvider,
        }),
      });
      const domainNote = result.domainOutcome ? ` — ${result.domainMessage}` : '';
      setFormNotice(`Created ${result.customer?.customerCode}${domainNote}`);
      setName('');
      setEmail('');
      setNotificationEmail('');
      setPhone('');
      setDateOfBirth('');
      setServiceStartDate('');
      setServiceEndDate('');
      setWebsiteType('');
      setWebsiteTypeOther('');
      setDomainName('');
      setPaymentProvider('PAYSTACK');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create customer');
    } finally {
      setSubmitting(false);
    }
  }

  /**
   * handleActivate — the "Months paid" control for a customer that has
   * no subscription yet (subscriptionId === null), most commonly one
   * created via CSV import. Creates (or reuses) a plan for that many
   * months at the flat per-month rate and an ACTIVE subscription
   * starting now, so the automated suspend/restore engine has
   * something to act on for this customer going forward.
   */
  async function handleActivate(customerId: string) {
    if (!session) return;
    const raw = monthsPaidInput[customerId] ?? '1';
    const monthsPaid = Number.parseInt(raw, 10);
    setActivateError(null);
    setActivateNotice(null);
    if (!Number.isInteger(monthsPaid) || monthsPaid < 1) {
      setActivateError('Months paid must be a positive whole number');
      return;
    }
    setActivatingId(customerId);
    try {
      const result = await authFetch<{ outcome: string; message: string }>(
        session.token,
        `/api/admin/customers/${customerId}/activate-billing`,
        { method: 'POST', body: JSON.stringify({ monthsPaid }) }
      );
      setActivateNotice(result.message);
      await load();
    } catch (err) {
      setActivateError(err instanceof ApiError ? err.message : 'Failed to activate billing');
    } finally {
      setActivatingId(null);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Customers</h1>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!customers && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {customers && customers.length === 0 && (
            <p style={{ color: 'var(--ink-soft)' }}>No customers yet — create one on the right.</p>
          )}
          {activateError && <p className="error-text">{activateError}</p>}
          {activateNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{activateNotice}</p>}
          {customers && customers.length > 0 && (
            <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Provider</th>
                  <th>Billing</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">
                      <a href={`/dashboard/customers/${c.id}`} style={{ color: 'var(--forest-bright)', textDecoration: 'none' }}>
                        {c.customerCode}
                      </a>
                    </td>
                    <td>{c.name}</td>
                    <td style={{ fontSize: '0.9em', color: 'var(--ink-soft)' }}>{websiteTypeLabel(c.websiteType)}</td>
                    <td>
                      <span
                        className="status-dot"
                        style={{ background: STATUS_COLOR[c.status] ?? 'var(--ink-soft)' }}
                      />
                      {c.status}
                    </td>
                    <td className="mono">{c.paymentProvider}</td>
                    <td>
                      {c.subscriptionId ? (
                        <a
                          href={`/dashboard/subscriptions/${c.subscriptionId}`}
                          style={{ color: 'var(--forest-bright)', textDecoration: 'none', fontSize: '0.85em' }}
                        >
                          View subscription
                        </a>
                      ) : (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4em' }}>
                          <input
                            type="number"
                            min={1}
                            step={1}
                            aria-label={`Months paid for ${c.name}`}
                            value={monthsPaidInput[c.id] ?? '1'}
                            onChange={(e) =>
                              setMonthsPaidInput((prev) => ({ ...prev, [c.id]: e.target.value }))
                            }
                            style={{ width: '4em', padding: '0.3em' }}
                          />
                          <button
                            type="button"
                            className="btn"
                            disabled={activatingId === c.id}
                            onClick={() => handleActivate(c.id)}
                            style={{ fontSize: '0.85em', padding: '0.3em 0.7em' }}
                          >
                            {activatingId === c.id ? 'Activating…' : 'Activate'}
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
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
              <label htmlFor="cust-email">Login email</label>
              <input id="cust-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="notification-email">Notification email</label>
              <input
                id="notification-email"
                type="email"
                required
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder="Where this customer's emails actually go"
              />
            </div>
            <div className="field">
              <label htmlFor="phone">Phone (optional)</label>
              <input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="website-type">Website type (optional)</label>
              <select id="website-type" value={websiteType} onChange={(e) => setWebsiteType(e.target.value)}>
                {WEBSITE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              {websiteType === 'OTHER' && (
                <input
                  id="website-type-other"
                  style={{ marginTop: '0.5em' }}
                  placeholder="Specify the product/service"
                  value={websiteTypeOther}
                  onChange={(e) => setWebsiteTypeOther(e.target.value)}
                />
              )}
            </div>
            <div className="field">
              <label htmlFor="domain-name">Domain name</label>
              <input
                id="domain-name"
                required
                value={domainName}
                onChange={(e) => setDomainName(e.target.value)}
                placeholder="example.com"
              />
              <p style={{ fontSize: '0.78em', color: 'var(--ink-soft)', margin: '0.3em 0 0' }}>
                Used by the super admin to configure this customer on Railway later.
              </p>
            </div>
            <div className="field">
              <label htmlFor="dob">Birthday (optional)</label>
              <input id="dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="service-start">Service start date (optional)</label>
              <input id="service-start" type="date" value={serviceStartDate} onChange={(e) => setServiceStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="service-end">Service end date (optional)</label>
              <input id="service-end" type="date" value={serviceEndDate} onChange={(e) => setServiceEndDate(e.target.value)} />
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
