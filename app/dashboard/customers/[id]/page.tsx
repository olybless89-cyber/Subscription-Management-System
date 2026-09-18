'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  notes: string | null;
}

interface Domain {
  id: string;
  customerId: string;
  domainName: string;
  isPrimary: boolean;
  subscriptionId: string | null;
  railwayStatus: string | null;
}

interface Subscription {
  id: string;
  customerId: string;
  status: string;
  planId: string;
  nextBillingDate: string;
  reminderDaysBeforeDue: number | null;
}

// ---------- ADMIN-only additions (Communication History, notes, and the
// per-subscription reminder controls below) — every use of these types
// and the section that renders them is wrapped in a
// session?.role === 'ADMIN' check, so none of it ever reaches a
// SUPER_ADMIN session. ----------

interface Plan {
  id: string;
  name: string;
}

interface NotificationEntry {
  id: string;
  channel: string;
  event: string;
  message: string;
  createdAt: string;
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

const WEBSITE_TYPE_PRESET_VALUES = new Set(
  WEBSITE_TYPE_OPTIONS.map((o) => o.value).filter((v) => v !== '' && v !== 'OTHER')
);

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

export default function CustomerDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const router = useRouter();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';
  const isAdmin = session?.role === 'ADMIN';

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [serviceStartDate, setServiceStartDate] = useState('');
  const [serviceEndDate, setServiceEndDate] = useState('');
  const [websiteType, setWebsiteType] = useState('');
  const [websiteTypeOther, setWebsiteTypeOther] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  // ADMIN-only: communication history + per-subscription reminder controls.
  const [plans, setPlans] = useState<Plan[]>([]);
  const [notifications, setNotifications] = useState<NotificationEntry[] | null>(null);
  const [reminderDraft, setReminderDraft] = useState<Record<string, string>>({});
  const [reminderBusyKey, setReminderBusyKey] = useState<string | null>(null);
  const [reminderError, setReminderError] = useState<string | null>(null);
  const [reminderNotice, setReminderNotice] = useState<string | null>(null);

  const [emailSubject, setEmailSubject] = useState('');
  const [emailMessage, setEmailMessage] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resettingPassword, setResettingPassword] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  // Domain edit-in-place state — only one row editable at a time.
  const [editingDomainId, setEditingDomainId] = useState<string | null>(null);
  const [domainEditName, setDomainEditName] = useState('');
  const [domainEditPrimary, setDomainEditPrimary] = useState(false);
  const [domainEditSubscriptionId, setDomainEditSubscriptionId] = useState('');
  const [domainActionPending, setDomainActionPending] = useState<string | null>(null);
  const [domainActionError, setDomainActionError] = useState<string | null>(null);
  const [domainActionNotice, setDomainActionNotice] = useState<string | null>(null);
  const [confirmDeleteDomainId, setConfirmDeleteDomainId] = useState<string | null>(null);

  // Danger-zone customer deletion — type-to-confirm the customerCode.
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [deletingCustomer, setDeletingCustomer] = useState(false);
  const [deleteCustomerError, setDeleteCustomerError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [custData, domainData, subData] = await Promise.all([
        authFetch<{ customer: Customer }>(session.token, `/api/admin/customers/${params.id}`),
        authFetch<{ domains: Domain[] }>(session.token, `/api/admin/domains?customerId=${params.id}`),
        authFetch<{ subscriptions: Subscription[] }>(session.token, `/api/admin/subscriptions`),
      ]);
      setCustomer(custData.customer);
      setName(custData.customer.name);
      setNotificationEmail(custData.customer.notificationEmail ?? '');
      setPhone(custData.customer.phone ?? '');
      setDateOfBirth(toDateInputValue(custData.customer.dateOfBirth));
      setServiceStartDate(toDateInputValue(custData.customer.serviceStartDate));
      setServiceEndDate(toDateInputValue(custData.customer.serviceEndDate));
      setNotes(custData.customer.notes ?? '');
      const loadedWebsiteType = custData.customer.websiteType;
      if (!loadedWebsiteType) {
        setWebsiteType('');
        setWebsiteTypeOther('');
      } else if (WEBSITE_TYPE_PRESET_VALUES.has(loadedWebsiteType)) {
        setWebsiteType(loadedWebsiteType);
        setWebsiteTypeOther('');
      } else {
        // Doesn't match a current preset — either a custom "Other" value
        // or one of the old (pre-rename) constant-style values. Either
        // way, show it in the free-text box rather than losing it.
        setWebsiteType('OTHER');
        setWebsiteTypeOther(loadedWebsiteType);
      }
      setDomains(domainData.domains);
      setSubscriptions(subData.subscriptions.filter((s) => s.customerId === params.id));
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load customer');
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ADMIN-only: plans (for the reminder section's plan names) and
  // communication history — never fetched for SUPER_ADMIN.
  const loadAdminExtras = useCallback(async () => {
    if (!session || session.role !== 'ADMIN') return;
    try {
      const [planData, notifData] = await Promise.all([
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
        authFetch<{ notifications: NotificationEntry[] }>(session.token, `/api/admin/customers/${params.id}/notifications`),
      ]);
      setPlans(planData.plans);
      setNotifications(notifData.notifications);
    } catch (err) {
      setReminderError(err instanceof ApiError ? err.message : 'Failed to load communication history');
    }
  }, [session, params.id]);

  useEffect(() => {
    loadAdminExtras();
  }, [loadAdminExtras]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setSaveError(null);
    setSaveNotice(null);
    if (websiteType === 'OTHER' && !websiteTypeOther.trim()) {
      setSaveError('Please specify the website type for "Other"');
      return;
    }
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
          websiteType: websiteType === 'OTHER' ? websiteTypeOther.trim() : websiteType || null,
          // Omitted entirely (rather than sent as null) outside the
          // ADMIN-only notes UI, so a SUPER_ADMIN save can never wipe a
          // notes value it never showed in the first place.
          ...(isAdmin ? { notes: notes.trim() || null } : {}),
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

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setResetError(null);
    setResetNotice(null);
    if (resetPasswordValue.length < 12) {
      setResetError('New password must be at least 12 characters');
      return;
    }
    setResettingPassword(true);
    try {
      await authFetch(session.token, `/api/admin/customers/${params.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });
      setResetNotice('Password reset — pass the new password to the customer through a channel you trust.');
      setResetPasswordValue('');
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setResettingPassword(false);
    }
  }

  async function handleSendReminderNow(subscriptionId: string) {
    if (!session) return;
    setReminderError(null);
    setReminderNotice(null);
    setReminderBusyKey(`reminder_${subscriptionId}`);
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/subscriptions/${subscriptionId}/send-reminder`, {
        method: 'POST',
      });
      setReminderNotice(result.message);
      await Promise.all([load(), loadAdminExtras()]);
    } catch (err) {
      setReminderError(err instanceof ApiError ? err.message : 'Failed to send reminder');
    } finally {
      setReminderBusyKey(null);
    }
  }

  async function handleSaveReminderDays(subscriptionId: string) {
    if (!session) return;
    const raw = reminderDraft[subscriptionId];
    const days = raw === undefined || raw === '' ? null : Number(raw);
    if (days !== null && (!Number.isInteger(days) || days < 0)) {
      setReminderError('Reminder days must be a whole number of 0 or more (or blank to turn off)');
      return;
    }
    setReminderError(null);
    setReminderNotice(null);
    setReminderBusyKey(`days_${subscriptionId}`);
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/subscriptions/${subscriptionId}/reminder-days`, {
        method: 'PUT',
        body: JSON.stringify({ days }),
      });
      setReminderNotice(result.message);
      await load();
    } catch (err) {
      setReminderError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setReminderBusyKey(null);
    }
  }

  async function handleSendBirthdayGreeting() {
    if (!session) return;
    setReminderError(null);
    setReminderNotice(null);
    setReminderBusyKey('greet');
    try {
      const result = await authFetch<{ message: string }>(session.token, `/api/admin/customers/${params.id}/send-birthday-greeting`, {
        method: 'POST',
      });
      setReminderNotice(result.message);
      await loadAdminExtras();
    } catch (err) {
      setReminderError(err instanceof ApiError ? err.message : 'Failed to send greeting');
    } finally {
      setReminderBusyKey(null);
    }
  }

  function handleStartEditDomain(d: Domain) {
    setDomainActionError(null);
    setDomainActionNotice(null);
    setConfirmDeleteDomainId(null);
    setEditingDomainId(d.id);
    setDomainEditName(d.domainName);
    setDomainEditPrimary(d.isPrimary);
    setDomainEditSubscriptionId(d.subscriptionId ?? '');
  }

  function handleCancelEditDomain() {
    setEditingDomainId(null);
  }

  async function handleSaveDomain(domainId: string) {
    if (!session) return;
    setDomainActionError(null);
    setDomainActionNotice(null);
    setDomainActionPending(domainId);
    try {
      await authFetch(session.token, `/api/admin/domains/${domainId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          domainName: domainEditName,
          isPrimary: domainEditPrimary,
          subscriptionId: domainEditSubscriptionId || null,
        }),
      });
      setEditingDomainId(null);
      setDomainActionNotice('Domain updated');
      await load();
    } catch (err) {
      setDomainActionError(err instanceof ApiError ? err.message : 'Failed to update domain');
    } finally {
      setDomainActionPending(null);
    }
  }

  async function handleSuspendRestoreDomain(d: Domain, action: 'suspend' | 'restore') {
    if (!session || !d.subscriptionId) return;
    setDomainActionError(null);
    setDomainActionNotice(null);
    setDomainActionPending(d.id);
    try {
      const result = await authFetch<{ outcome: string }>(
        session.token,
        `/api/subscriptions/${d.subscriptionId}/${action}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setDomainActionNotice(`${d.domainName}: ${action} outcome ${result.outcome}`);
      await load();
    } catch (err) {
      setDomainActionError(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setDomainActionPending(null);
    }
  }

  async function handleDeleteDomain(domainId: string) {
    if (!session) return;
    if (confirmDeleteDomainId !== domainId) {
      // First click just arms the confirmation — nothing destructive
      // happens until the admin clicks "Confirm delete" too.
      setConfirmDeleteDomainId(domainId);
      return;
    }
    setDomainActionError(null);
    setDomainActionNotice(null);
    setDomainActionPending(domainId);
    try {
      await authFetch(session.token, `/api/admin/domains/${domainId}`, { method: 'DELETE' });
      setConfirmDeleteDomainId(null);
      setDomainActionNotice('Domain permanently removed');
      await load();
    } catch (err) {
      setDomainActionError(err instanceof ApiError ? err.message : 'Failed to delete domain');
    } finally {
      setDomainActionPending(null);
    }
  }

  async function handleDeleteCustomer() {
    if (!session || !customer) return;
    setDeleteCustomerError(null);
    setDeletingCustomer(true);
    try {
      await authFetch(session.token, `/api/admin/customers/${params.id}`, { method: 'DELETE' });
      router.push('/dashboard/customers');
    } catch (err) {
      setDeleteCustomerError(err instanceof ApiError ? err.message : 'Failed to delete customer');
      setDeletingCustomer(false);
    }
  }

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (!customer) return <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>;

  const deleteConfirmReady = deleteConfirmText.trim() === customer.customerCode;

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>{customer.name}</h1>
      <p className="mono" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>
        {customer.customerCode} — {customer.status}
      </p>

      <div className="card" style={{ marginTop: '1em' }}>
        <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em' }}>Domains</h2>
        <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: '-0.3em', marginBottom: '0.8em' }}>
          A domain linked to a subscription can be suspended or restored independently of this
          customer's other domains — the same suspend/restore engine used on the Subscription page,
          just scoped to whichever subscription that one domain is governed by.
        </p>
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
                <th>Governing subscription</th>
                <th>Railway status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {domains.map((d) => {
                const linkedSub = subscriptions.find((s) => s.id === d.subscriptionId);
                const isEditing = editingDomainId === d.id;
                const isPending = domainActionPending === d.id;
                return (
                  <tr key={d.id}>
                    {isEditing ? (
                      <>
                        <td>
                          <input
                            value={domainEditName}
                            onChange={(e) => setDomainEditName(e.target.value)}
                            style={{ width: '100%' }}
                          />
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={domainEditPrimary}
                            onChange={(e) => setDomainEditPrimary(e.target.checked)}
                          />
                        </td>
                        <td>
                          <select
                            value={domainEditSubscriptionId}
                            onChange={(e) => setDomainEditSubscriptionId(e.target.value)}
                            style={{ width: '100%' }}
                          >
                            <option value="">Not linked</option>
                            {subscriptions.map((s) => (
                              <option key={s.id} value={s.id}>{s.id} ({s.status})</option>
                            ))}
                          </select>
                        </td>
                        <td className="mono">{d.railwayStatus ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button
                            className="btn btn-primary"
                            disabled={isPending}
                            onClick={() => handleSaveDomain(d.id)}
                            style={{ marginRight: '0.4em' }}
                          >
                            {isPending ? 'Saving…' : 'Save'}
                          </button>
                          <button className="btn" onClick={handleCancelEditDomain}>Cancel</button>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="mono">{d.domainName}</td>
                        <td>{d.isPrimary ? 'Yes' : ''}</td>
                        <td className="mono" style={{ fontSize: '0.85em' }}>
                          {linkedSub ? `${linkedSub.id} (${linkedSub.status})` : d.subscriptionId ? d.subscriptionId : '—'}
                        </td>
                        <td className="mono">{d.railwayStatus ?? '—'}</td>
                        <td style={{ whiteSpace: 'nowrap' }}>
                          <button className="btn" onClick={() => handleStartEditDomain(d)} style={{ marginRight: '0.4em' }}>
                            Edit
                          </button>
                          {d.subscriptionId && (
                            <>
                              <button
                                className="btn"
                                disabled={isPending}
                                onClick={() => handleSuspendRestoreDomain(d, 'suspend')}
                                style={{ marginRight: '0.4em' }}
                              >
                                Suspend
                              </button>
                              <button
                                className="btn"
                                disabled={isPending}
                                onClick={() => handleSuspendRestoreDomain(d, 'restore')}
                                style={{ marginRight: '0.4em' }}
                              >
                                Restore
                              </button>
                            </>
                          )}
                          {isSuperAdmin && (
                            <button
                              className="btn"
                              disabled={isPending}
                              onClick={() => handleDeleteDomain(d.id)}
                              style={{ color: 'var(--danger)' }}
                            >
                              {confirmDeleteDomainId === d.id ? 'Confirm delete' : 'Delete'}
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
        {domainActionError && <p className="error-text" style={{ marginBottom: 0 }}>{domainActionError}</p>}
        {domainActionNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em', marginBottom: 0 }}>{domainActionNotice}</p>}
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
              {websiteType === 'OTHER' && (
                <input
                  id="edit-website-type-other"
                  style={{ marginTop: '0.5em' }}
                  placeholder="Specify the product/service"
                  value={websiteTypeOther}
                  onChange={(e) => setWebsiteTypeOther(e.target.value)}
                />
              )}
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

            {isAdmin && (
              <div className="field">
                <label htmlFor="edit-notes">Notes (private — never shown to the customer)</label>
                <textarea
                  id="edit-notes"
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  style={{ padding: '0.6em 0.7em', border: '1px solid var(--line-strong)', borderRadius: 4, background: 'var(--paper-raised)', fontFamily: 'inherit', resize: 'vertical' }}
                />
              </div>
            )}

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

      <div className="card" style={{ marginTop: '1.5em', maxWidth: 480 }}>
        <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em' }}>Reset password</h2>
        <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: 0 }}>
          For a forgotten password — sets a new one directly. There's no reset-link/email flow;
          you'll need to tell the customer their new password yourself.
        </p>
        <form onSubmit={handleResetPassword}>
          <div className="field">
            <label htmlFor="reset-password">New password</label>
            <input
              id="reset-password"
              type="password"
              minLength={12}
              value={resetPasswordValue}
              onChange={(e) => setResetPasswordValue(e.target.value)}
            />
          </div>
          {resetError && <p className="error-text">{resetError}</p>}
          {resetNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{resetNotice}</p>}
          <button type="submit" className="btn" disabled={resettingPassword}>
            {resettingPassword ? 'Resetting…' : 'Reset password'}
          </button>
        </form>
      </div>

      {isAdmin && (
        <div className="card" style={{ marginTop: '1.5em' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', flexWrap: 'wrap', gap: '0.6em' }}>
            <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em' }}>Reminders</h2>
            {customer.dateOfBirth && (
              <button type="button" className="btn" disabled={reminderBusyKey === 'greet'} onClick={handleSendBirthdayGreeting}>
                {reminderBusyKey === 'greet' ? 'Sending…' : 'Send birthday greeting'}
              </button>
            )}
          </div>
          {reminderError && <p className="error-text">{reminderError}</p>}
          {reminderNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{reminderNotice}</p>}
          {subscriptions.length === 0 ? (
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', margin: 0 }}>No subscriptions yet.</p>
          ) : (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Plan</th>
                    <th>Status</th>
                    <th>Next billing</th>
                    <th>Auto-reminder (days before)</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {subscriptions.map((s) => {
                    const plan = plans.find((p) => p.id === s.planId);
                    const draftValue = reminderDraft[s.id] ?? (s.reminderDaysBeforeDue ?? '').toString();
                    return (
                      <tr key={s.id}>
                        <td>{plan?.name ?? s.planId}</td>
                        <td>{s.status}</td>
                        <td className="mono">{new Date(s.nextBillingDate).toLocaleDateString()}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '0.4em', alignItems: 'center' }}>
                            <input
                              type="number"
                              min={0}
                              max={365}
                              placeholder="off"
                              value={draftValue}
                              onChange={(e) => setReminderDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                              style={{ width: 60, padding: '0.3em 0.4em' }}
                            />
                            <button
                              type="button"
                              className="btn"
                              disabled={reminderBusyKey === `days_${s.id}`}
                              onClick={() => handleSaveReminderDays(s.id)}
                            >
                              Save
                            </button>
                          </div>
                        </td>
                        <td>
                          <button
                            type="button"
                            className="btn btn-primary"
                            disabled={reminderBusyKey === `reminder_${s.id}`}
                            onClick={() => handleSendReminderNow(s.id)}
                          >
                            {reminderBusyKey === `reminder_${s.id}` ? 'Sending…' : 'Send Reminder'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isAdmin && (
        <div className="card" style={{ marginTop: '1.5em' }}>
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em' }}>Communication History</h2>
          {notifications === null && <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>Loading…</p>}
          {notifications !== null && notifications.length === 0 && (
            <p style={{ color: 'var(--ink-soft)', fontSize: '0.9em', margin: 0 }}>Nothing sent to this customer yet.</p>
          )}
          {notifications !== null && notifications.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Sent</th>
                    <th>Channel</th>
                    <th>Event</th>
                    <th>Message</th>
                  </tr>
                </thead>
                <tbody>
                  {notifications.map((n) => (
                    <tr key={n.id}>
                      <td className="mono">{new Date(n.createdAt).toLocaleString()}</td>
                      <td>{n.channel}</td>
                      <td className="mono">{n.event}</td>
                      <td style={{ fontSize: '0.85em', maxWidth: 360, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.message}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {isSuperAdmin && (
        <div className="card" style={{ marginTop: '1.5em', maxWidth: 480, borderColor: 'var(--danger)' }}>
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.6em', color: 'var(--danger)' }}>
            Danger zone
          </h2>
          <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: 0 }}>
            Permanently deletes this customer and everything tied to them — subscriptions,
            payments, invoices, domains, Railway resource mappings, suspension history. This does
            NOT delete anything on Railway itself; the actual services/domains there must be
            cleaned up separately if you no longer need them. This cannot be undone.
          </p>
          <div className="field">
            <label htmlFor="delete-confirm">
              Type <span className="mono">{customer.customerCode}</span> to confirm
            </label>
            <input
              id="delete-confirm"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder={customer.customerCode}
            />
          </div>
          {deleteCustomerError && <p className="error-text">{deleteCustomerError}</p>}
          <button
            className="btn"
            disabled={!deleteConfirmReady || deletingCustomer}
            onClick={handleDeleteCustomer}
            style={{ background: 'var(--danger)', color: 'white', width: '100%', justifyContent: 'center' }}
          >
            {deletingCustomer ? 'Deleting…' : 'Permanently delete this customer'}
          </button>
        </div>
      )}
    </div>
  );
}
