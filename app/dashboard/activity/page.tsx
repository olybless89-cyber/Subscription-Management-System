'use client';

import { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface AuditLogEntry {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  result: string;
  createdAt: string;
}

export default function ActivityPage() {
  const { session } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const data = await authFetch<{ entries: AuditLogEntry[] }>(session.token, '/api/admin/audit-logs');
      setEntries(data.entries);
    } catch (err) {
      setLoadError(
        err instanceof ApiError && err.status === 403
          ? 'Only the super admin can view system-wide activity.'
          : err instanceof ApiError
            ? err.message
            : 'Failed to load activity'
      );
    }
  }, [session]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Activity</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, fontSize: '0.9em' }}>
        Every admin action across the whole system, most recent first.
      </p>

      {loadError && <p className="error-text">{loadError}</p>}
      {!entries && !loadError && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
      {entries && entries.length === 0 && <p style={{ color: 'var(--ink-soft)' }}>No activity recorded yet.</p>}

      {entries && entries.length > 0 && (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id}>
                  <td className="mono">{new Date(e.createdAt).toLocaleString()}</td>
                  <td className="mono">{e.actor}</td>
                  <td>{e.action}</td>
                  <td className="mono">{e.target ?? '—'}</td>
                  <td style={{ color: e.result === 'SUCCESS' ? 'var(--forest-bright)' : 'var(--danger)' }}>
                    {e.result}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
