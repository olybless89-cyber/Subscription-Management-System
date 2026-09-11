'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface Admin {
  id: string;
  name: string;
  email: string;
  role: 'SUPER_ADMIN' | 'ADMIN';
  canManageAdmins: boolean;
  passwordChangedAt: string | null;
}

function formatPasswordChanged(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : 'Never (still original)';
}

export default function AdminsPage() {
  const { session } = useAuth();
  const [admins, setAdmins] = useState<Admin[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'SUPER_ADMIN'>('ADMIN');
  const [canManageAdmins, setCanManageAdmins] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const [resettingId, setResettingId] = useState<string | null>(null);
  const [resetPasswordValue, setResetPasswordValue] = useState('');
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetNotice, setResetNotice] = useState<string | null>(null);

  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authFetch<{ admins: Admin[] }>(session.token, '/api/admin/admins');
      setAdmins(data.admins);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to view or manage other admins."
          : err instanceof ApiError
            ? err.message
            : 'Failed to load admins'
      );
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
      const result = await authFetch<{ outcome: string; admin?: Admin }>(session.token, '/api/admin/admins', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email,
          password,
          role: isSuperAdmin ? role : 'ADMIN',
          canManageAdmins: isSuperAdmin ? canManageAdmins : false,
        }),
      });
      setFormNotice(`Created ${result.admin?.email}`);
      setName('');
      setEmail('');
      setPassword('');
      setRole('ADMIN');
      setCanManageAdmins(false);
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to create admin');
    } finally {
      setSubmitting(false);
    }
  }

  function startReset(adminId: string) {
    setResettingId(adminId);
    setResetPasswordValue('');
    setResetError(null);
    setResetNotice(null);
  }

  async function submitReset(adminId: string) {
    if (!session) return;
    setResetError(null);
    setResetNotice(null);
    if (resetPasswordValue.length < 12) {
      setResetError('New password must be at least 12 characters');
      return;
    }
    setResetSubmitting(true);
    try {
      await authFetch(session.token, `/api/admin/admins/${adminId}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword: resetPasswordValue }),
      });
      setResetNotice('Password reset');
      setResettingId(null);
      await load();
    } catch (err) {
      setResetError(err instanceof ApiError ? err.message : 'Failed to reset password');
    } finally {
      setResetSubmitting(false);
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '1em' }}>Admins</h1>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!admins && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {admins && admins.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No admins found.</p>}
          {admins && admins.length > 0 && (
            <div className="table-scroll">
                        <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Can manage admins</th>
                  {isSuperAdmin && <th>Password changed</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {admins.map((a) => (
                  <tr key={a.id}>
                    <td>{a.name}</td>
                    <td>{a.email}</td>
                    <td className="mono">{a.role}</td>
                    <td>{a.canManageAdmins ? 'Yes' : ''}</td>
                    {isSuperAdmin && (
                      <td style={{ fontSize: '0.88em', color: 'var(--ink-soft)' }}>
                        {formatPasswordChanged(a.passwordChangedAt)}
                      </td>
                    )}
                    <td style={{ display: 'flex', gap: '1em', alignItems: 'center' }}>
                      {a.role !== 'SUPER_ADMIN' && (
                        <a
                          href={`/dashboard/admins/${a.id}/assignments`}
                          style={{ color: 'var(--forest-bright)', textDecoration: 'none', fontSize: '0.9em' }}
                        >
                          Manage customers
                        </a>
                      )}
                      {isSuperAdmin && a.email !== session?.email && (
                        <button
                          className="btn"
                          style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                          onClick={() => startReset(a.id)}
                        >
                          Reset password
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}

          {resettingId && (
            <div className="card" style={{ marginTop: '1em', background: 'var(--paper)' }}>
              <h3 style={{ fontSize: '0.95em', fontWeight: 600, marginTop: 0, marginBottom: '0.8em' }}>
                Set a new password for {admins?.find((a) => a.id === resettingId)?.email}
              </h3>
              <div className="field">
                <label htmlFor="reset-password-value">New password</label>
                <input
                  id="reset-password-value"
                  type="password"
                  minLength={12}
                  value={resetPasswordValue}
                  onChange={(e) => setResetPasswordValue(e.target.value)}
                  autoFocus
                />
              </div>
              {resetError && <p className="error-text">{resetError}</p>}
              {resetNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{resetNotice}</p>}
              <div style={{ display: 'flex', gap: '0.6em' }}>
                <button
                  className="btn btn-primary"
                  disabled={resetSubmitting}
                  onClick={() => submitReset(resettingId)}
                >
                  {resetSubmitting ? 'Resetting…' : 'Reset password'}
                </button>
                <button className="btn" onClick={() => setResettingId(null)}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>New admin</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="admin-name">Name</label>
              <input id="admin-name" required value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="admin-email">Email</label>
              <input id="admin-email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="admin-password">Password</label>
              <input
                id="admin-password"
                type="password"
                required
                minLength={12}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {isSuperAdmin && (
              <>
                <div className="field">
                  <label htmlFor="admin-role">Role</label>
                  <select id="admin-role" value={role} onChange={(e) => setRole(e.target.value as 'ADMIN' | 'SUPER_ADMIN')}>
                    <option value="ADMIN">Admin</option>
                    <option value="SUPER_ADMIN">Super admin</option>
                  </select>
                </div>
                <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6em' }}>
                  <input
                    id="admin-can-manage"
                    type="checkbox"
                    checked={canManageAdmins}
                    onChange={(e) => setCanManageAdmins(e.target.checked)}
                    style={{ width: 'auto' }}
                  />
                  <label htmlFor="admin-can-manage" style={{ margin: 0 }}>Can manage other admins</label>
                </div>
              </>
            )}
            {!isSuperAdmin && (
              <p style={{ fontSize: '0.8em', color: 'var(--ink-soft)', marginTop: '-0.5em' }}>
                Only a super admin can create another super admin or grant admin-management rights —
                this will be created as a plain admin.
              </p>
            )}

            {formError && <p className="error-text">{formError}</p>}
            {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? 'Creating…' : 'Create admin'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
