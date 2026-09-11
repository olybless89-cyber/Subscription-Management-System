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
                    <td>
                      {a.role !== 'SUPER_ADMIN' && (
                        <a
                          href={`/dashboard/admins/${a.id}/assignments`}
                          style={{ color: 'var(--forest-bright)', textDecoration: 'none', fontSize: '0.9em' }}
                        >
                          Manage customers
                        </a>
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
