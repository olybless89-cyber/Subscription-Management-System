'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../../_components/AuthProvider';
import { authFetch, ApiError } from '../../../_lib/api';

interface Customer {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  notificationEmail: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  websiteType: string | null;
  status: string;
  automaticSuspension: boolean;
  paymentProvider: 'PAYSTACK' | 'FLUTTERWAVE';
}

interface Domain {
  id: string;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
}

const WEBSITE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Not specified' },
  { value: 'ONLINE_BANKING', label: 'Online banking' },
  { value: 'INVESTMENT', label: 'Investment / business investment' },
  { value: 'ECOMMERCE', label: 'E-commerce' },
  { value: 'DELIVERY', label: 'Delivery' },
  { value: 'SAAS', label: 'SaaS product' },
  { value: 'WEB_APP', label: 'Web app' },
  { value: 'CORPORATE', label: 'Corporate / brochure site' },
  { value: 'OTHER', label: 'Other' },
];

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [websiteType, setWebsiteType] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [custData, domainData] = await Promise.all([
        authFetch<{ customer: Customer }>(session.token, `/api/admin/customers/${params.id}`),
        authFetch<{ domains: Domain[] }>(session.token, `/api/admin/domains?customerId=${params.id}`),
      ]);
      setCustomer(custData.customer);
      setName(custData.customer.name);
      setNotificationEmail(custData.customer.notificationEmail ?? '');
      setPhone(custData.customer.phone ?? '');
      setDateOfBirth(toDateInputValue(custData.customer.dateOfBirth));
      setServiceStartDate(toDateInputValue(custData.customer.serviceStartDate));
      setServiceEndDate(toDateInputValue(custData.customer.serviceEndDate));
      setWebsiteType(custData.customer.websiteType ?? '');
      setDomains(domainData.domains);
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load customer');
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaveError(null);
    setSaveNotice(null);
    setSaving(true);
    try {
      await authFetch(session.token, `/api/admin/customers/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name,
          notificationEmail: notificationEmail || null,
          phone: phone || null,
          dateOfBirth: dateOfBirth || null,
          serviceStartDate: serviceStartDate || null,
          serviceEndDate: serviceEndDate || null,
          websiteType: websiteType || null,
        }),
      });
      setSaveNotice('Saved');
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleSendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setEmailError(null);
    setEmailNotice(null);
    setSendingEmail(true);
    try {
      await authFetch(session.token, `/api/admin/customers/${params.id}/send-email`, {
        method: 'POST',
        body: JSON.stringify({ subject: emailSubject, message: emailMessage }),
      });
      setEmailNotice('Sent');
      setEmailSubject('');
      setEmailMessage('');
    } catch (err) {
      setEmailError(err instanceof ApiError ? err.message : 'Failed to send');
    } finally {
      setSendingEmail(false);
    }
  }

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (!customer) return <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>;

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>{customer.name}</h1>
      <p className="mono" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
        {customer.customerCode} — {customer.status}
      </p>

      <div className="card" style={{ marginTop: '1em' }}>
        <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em' }}>Domains</h2>
        {domains.length === 0 ? (
          <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', margin: 0 }}>
            No domain attached yet. Attach one from the{' '}
            <a href="/dashboard/domains" style={{ color: 'var(--forest-bright)' }}>Domains page</a> —
            the super admin will need it to configure this customer on Railway.
          </p>
        ) : (
          <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Domain</th>
                <th>Primary</th>
                <th>Railway status</th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => (
                <tr key={d.id}>
                  <td className="mono">{d.domainName}</td>
                  <td>{d.isPrimary ? 'Yes' : ''}</td>
                  <td className="mono">{d.railwayStatus ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>

      <div className="layout-equal" style={{ marginTop: '1.5em' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Edit details</h2>
          <form onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="edit-name">Name</label>
              <input id="edit-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-notification-email">Notification email</label>
              <input
                id="edit-notification-email"
                type="email"
                value={notificationEmail}
                onChange={(e) => setNotificationEmail(e.target.value)}
                placeholder={customer.email}
              />
            </div>
            <div className="field">
              <label htmlFor="edit-phone">Phone</label>
              <input id="edit-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-website-type">Website type</label>
              <select id="edit-website-type" value={websiteType} onChange={(e) => setWebsiteType(e.target.value)}>
                {WEBSITE_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="edit-dob">Birthday</label>
              <input id="edit-dob" type="date" value={dateOfBirth} onChange={(e) => setDateOfBirth(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-service-start">Service start date</label>
              <input id="edit-service-start" type="date" value={serviceStartDate} onChange={(e) => setServiceStartDate(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="edit-service-end">Service end date</label>
              <input id="edit-service-end" type="date" value={serviceEndDate} onChange={(e) => setServiceEndDate(e.target.value)} />
            </div>

            {saveError && <p className="error-text">{saveError}</p>}
            {saveNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{saveNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Send a custom email</h2>
          <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: '-0.6em' }}>
            Goes to {customer.notificationEmail || customer.email} via the same pipeline as
            automated notifications.
          </p>
          <form onSubmit={handleSendEmail}>
            <div className="field">
              <label htmlFor="email-subject">Subject</label>
              <input id="email-subject" required value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="email-message">Message</label>
              <textarea
                id="email-message"
                required
                rows={6}
                value={emailMessage}
                onChange={(e) => setEmailMessage(e.target.value)}
                style={{ padding: '0.6em 0.7em', border: '1px solid var(--line-strong)', borderRadius: 4, background: 'var(--paper-raised)', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            {emailError && <p className="error-text">{emailError}</p>}
            {emailNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{emailNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={sendingEmail} style={{ width: '100%', justifyContent: 'center' }}>
              {sendingEmail ? 'Sending…' : 'Send email'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
