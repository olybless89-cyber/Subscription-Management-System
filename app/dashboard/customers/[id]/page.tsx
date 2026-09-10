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
  status: string;
  automaticSuspension: boolean;
  paymentProvider: 'PAYSTACK' | 'FLUTTERWAVE';
}

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
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
      const data = await authFetch<{ customer: Customer }>(session.token, `/api/admin/customers/${params.id}`);
      setCustomer(data.customer);
      setName(data.customer.name);
      setNotificationEmail(data.customer.notificationEmail ?? '');
      setPhone(data.customer.phone ?? '');
      setDateOfBirth(toDateInputValue(data.customer.dateOfBirth));
      setServiceStartDate(toDateInputValue(data.customer.serviceStartDate));
      setServiceEndDate(toDateInputValue(data.customer.serviceEndDate));
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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2em', alignItems: 'start', marginTop: '1.5em' }}>
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
