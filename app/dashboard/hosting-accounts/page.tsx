'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

type HostingProvider = 'RAILWAY' | 'DIGITALOCEAN' | 'AWS' | 'VERCEL';

interface HostingAccount {
  id: string;
  provider: HostingProvider;
  label: string;
  apiUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

const PROVIDER_LABELS: Record<HostingProvider, string> = {
  RAILWAY: 'Railway',
  DIGITALOCEAN: 'DigitalOcean',
  AWS: 'AWS',
  VERCEL: 'Vercel',
};

// Only Railway has an adapter implemented so far (see
// src/lib/hosting/manage.ts#createHostingAccount) — the others are shown
// so the architecture and intent are visible, but disabled until a real
// adapter exists for each.
const IMPLEMENTED_PROVIDERS: HostingProvider[] = ['RAILWAY'];

export default function HostingAccountsPage() {
  const { session } = useAuth();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const [accounts, setAccounts] = useState<HostingAccount[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [provider, setProvider] = useState<HostingProvider>('RAILWAY');
  const [label, setLabel] = useState('');
  const [apiToken, setApiToken] = useState('');
  const [apiUrl, setApiUrl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formNotice, setFormNotice] = useState<string | null>(null);

  const [testingId, setTestingId] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { ok: boolean; message: string }>>({});

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editApiToken, setEditApiToken] = useState('');
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session || !isSuperAdmin) return;
    try {
      const data = await authFetch<{ accounts: HostingAccount[] }>(session.token, '/api/admin/hosting-accounts');
      setAccounts(data.accounts);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 403
          ? "You don't have permission to view connected hosting accounts."
          : err instanceof ApiError
            ? err.message
            : 'Failed to load hosting accounts'
      );
    }
  }, [session, isSuperAdmin]);

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
      const result = await authFetch<{ outcome: string; message: string; account?: HostingAccount }>(
        session.token,
        '/api/admin/hosting-accounts',
        {
          method: 'POST',
          body: JSON.stringify({ provider, label, apiToken, apiUrl: apiUrl.trim() || null }),
        }
      );
      setFormNotice(`Connected "${result.account?.label}"`);
      setLabel('');
      setApiToken('');
      setApiUrl('');
      await load();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Failed to connect hosting account');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTest(id: string) {
    if (!session) return;
    setTestingId(id);
    setTestResult((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    try {
      const result = await authFetch<{ outcome: string; message: string }>(
        session.token,
        `/api/admin/hosting-accounts/${id}/test`,
        { method: 'POST' }
      );
      setTestResult((prev) => ({ ...prev, [id]: { ok: result.outcome === 'OK', message: result.message } }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { ok: false, message: err instanceof ApiError ? err.message : 'Test failed' },
      }));
    } finally {
      setTestingId(null);
    }
  }

  function startEdit(account: HostingAccount) {
    setEditingId(account.id);
    setEditLabel(account.label);
    setEditApiToken('');
    setEditError(null);
  }

  async function submitEdit(id: string) {
    if (!session) return;
    setEditError(null);
    setEditSubmitting(true);
    try {
      const patch: { label?: string; apiToken?: string } = {};
      if (editLabel.trim()) patch.label = editLabel.trim();
      if (editApiToken.trim()) patch.apiToken = editApiToken.trim();
      await authFetch(session.token, `/api/admin/hosting-accounts/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      setEditingId(null);
      await load();
    } catch (err) {
      setEditError(err instanceof ApiError ? err.message : 'Failed to update hosting account');
    } finally {
      setEditSubmitting(false);
    }
  }

  async function toggleActive(account: HostingAccount) {
    if (!session) return;
    try {
      await authFetch(session.token, `/api/admin/hosting-accounts/${account.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive: !account.isActive }),
      });
      await load();
    } catch {
      // Surfaced via the row's own state on next load if it silently
      // failed to flip — a stale toggle is low-stakes enough not to
      // need its own dedicated error banner here.
    }
  }

  async function handleDelete(id: string) {
    if (!session) return;
    setDeletingId(id);
    setDeleteError((prev) => ({ ...prev, [id]: '' }));
    try {
      await authFetch(session.token, `/api/admin/hosting-accounts/${id}`, { method: 'DELETE' });
      await load();
    } catch (err) {
      setDeleteError((prev) => ({
        ...prev,
        [id]: err instanceof ApiError ? err.message : 'Failed to disconnect',
      }));
    } finally {
      setDeletingId(null);
    }
  }

  if (!isSuperAdmin) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        Only the super admin can view or manage connected hosting accounts.
      </p>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Hosting Accounts</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, maxWidth: 640, marginBottom: '1.2em' }}>
        Every customer&apos;s infrastructure is mapped to one of these connected accounts, not a single shared
        token — connect as many Railway accounts as you host customers on, and (once implemented) other
        providers too. Suspend/restore/sync always resolve the right account per customer, never a guess.
      </p>

      <div className="layout-main-side">
        <div className="card">
          {loadError && <p className="error-text">{loadError}</p>}
          {!accounts && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
          {accounts && accounts.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No hosting accounts connected yet.</p>}
          {accounts && accounts.length > 0 && (
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Connected</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {accounts.map((a) => (
                    <tr key={a.id}>
                      <td>
                        {editingId === a.id ? (
                          <input
                            value={editLabel}
                            onChange={(e) => setEditLabel(e.target.value)}
                            style={{ fontSize: '0.9em' }}
                            autoFocus
                          />
                        ) : (
                          a.label
                        )}
                      </td>
                      <td className="mono">{PROVIDER_LABELS[a.provider]}</td>
                      <td>
                        <span>
                          <span
                            className="status-dot"
                            style={{ background: a.isActive ? 'var(--forest-bright)' : 'var(--ink-soft)' }}
                          />
                          {a.isActive ? 'Active' : 'Disconnected'}
                        </span>
                      </td>
                      <td style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>
                        {new Date(a.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {editingId === a.id ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4em', minWidth: 220 }}>
                            <input
                              type="password"
                              placeholder="New token (leave blank to keep current)"
                              value={editApiToken}
                              onChange={(e) => setEditApiToken(e.target.value)}
                              style={{ fontSize: '0.85em' }}
                            />
                            {editError && <div className="error-text" style={{ fontSize: '0.8em' }}>{editError}</div>}
                            <div style={{ display: 'flex', gap: '0.4em' }}>
                              <button
                                className="btn btn-primary"
                                disabled={editSubmitting}
                                onClick={() => submitEdit(a.id)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                              >
                                {editSubmitting ? 'Saving…' : 'Save'}
                              </button>
                              <button
                                className="btn"
                                onClick={() => setEditingId(null)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35em' }}>
                            <div style={{ display: 'flex', gap: '0.5em', flexWrap: 'wrap' }}>
                              <button
                                className="btn"
                                disabled={testingId === a.id}
                                onClick={() => handleTest(a.id)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                              >
                                {testingId === a.id ? 'Testing…' : 'Test connection'}
                              </button>
                              <button
                                className="btn"
                                onClick={() => startEdit(a)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                              >
                                Edit
                              </button>
                              <button
                                className="btn"
                                onClick={() => toggleActive(a)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em' }}
                              >
                                {a.isActive ? 'Deactivate' : 'Reactivate'}
                              </button>
                              <button
                                className="btn"
                                disabled={deletingId === a.id}
                                onClick={() => handleDelete(a.id)}
                                style={{ padding: '0.3em 0.7em', fontSize: '0.85em', color: 'var(--danger)' }}
                              >
                                {deletingId === a.id ? 'Disconnecting…' : 'Disconnect'}
                              </button>
                            </div>
                            {testResult[a.id] && (
                              <div
                                style={{
                                  fontSize: '0.8em',
                                  color: testResult[a.id].ok ? 'var(--forest-bright)' : 'var(--danger)',
                                }}
                              >
                                {testResult[a.id].message}
                              </div>
                            )}
                            {deleteError[a.id] && (
                              <div className="error-text" style={{ fontSize: '0.8em' }}>{deleteError[a.id]}</div>
                            )}
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
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Connect a hosting account</h2>
          <form onSubmit={handleCreate}>
            <div className="field">
              <label htmlFor="ha-provider">Provider</label>
              <select id="ha-provider" value={provider} onChange={(e) => setProvider(e.target.value as HostingProvider)}>
                {(Object.keys(PROVIDER_LABELS) as HostingProvider[]).map((p) => (
                  <option key={p} value={p} disabled={!IMPLEMENTED_PROVIDERS.includes(p)}>
                    {PROVIDER_LABELS[p]}
                    {IMPLEMENTED_PROVIDERS.includes(p) ? '' : ' (coming soon)'}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="ha-label">Label</label>
              <input
                id="ha-label"
                required
                placeholder="e.g. Railway — second account"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ha-token">API token</label>
              <input
                id="ha-token"
                type="password"
                required
                value={apiToken}
                onChange={(e) => setApiToken(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="ha-url">API URL (optional)</label>
              <input
                id="ha-url"
                placeholder="Defaults to Railway's public API"
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
              />
            </div>

            {provider !== 'RAILWAY' && (
              <p style={{ fontSize: '0.8em', color: 'var(--ink-soft)', marginTop: '-0.5em' }}>
                No {PROVIDER_LABELS[provider]} adapter is implemented yet — connecting one here isn&apos;t possible until
                that&apos;s built.
              </p>
            )}

            {formError && <p className="error-text">{formError}</p>}
            {formNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{formNotice}</p>}

            <button
              type="submit"
              className="btn btn-primary"
              disabled={submitting || provider !== 'RAILWAY'}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {submitting ? 'Connecting…' : 'Connect account'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
