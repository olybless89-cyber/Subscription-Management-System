'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../_components/AuthProvider';
import { authFetch, ApiError } from '../../_lib/api';

interface RailwayEnvironment {
  id: string;
  name: string;
}

interface CustomerOption {
  id: string;
  name: string;
  customerCode: string;
  subscriptions: Array<{ id: string; status: string }>;
}

interface DiscoveredService {
  projectId: string;
  projectName: string;
  serviceId: string;
  serviceName: string;
  environments: RailwayEnvironment[];
  mapped: {
    subscriptionId: string;
    customerId: string | null;
    customerName: string | null;
    customerCode: string | null;
    hostingMode: string;
    suspensionStrategy: string;
  } | null;
  suggestedCustomerId: string | null;
}

type HostingMode = 'DEDICATED' | 'SHARED_SERVICE' | 'MULTI_TENANT';
type SuspensionStrategy = 'STOP_DEPLOYMENT' | 'APP_LEVEL' | 'REDIRECT' | 'MANUAL';

function defaultEnvironmentId(envs: RailwayEnvironment[]): string {
  return envs.find((e) => e.name.toLowerCase() === 'production')?.id ?? envs[0]?.id ?? '';
}

export default function RailwayImportPage() {
  const { session } = useAuth();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const [services, setServices] = useState<DiscoveredService[] | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Per-service pending form state, keyed by `${projectId}:${serviceId}`.
  const [selections, setSelections] = useState<
    Record<string, { subscriptionId: string; environmentId: string; hostingMode: HostingMode; suspensionStrategy: SuspensionStrategy }>
  >({});
  const [mappingKey, setMappingKey] = useState<string | null>(null);
  const [rowError, setRowError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!session || !isSuperAdmin) return;
    setLoadError(null);
    try {
      const data = await authFetch<{ services: DiscoveredService[]; customers: CustomerOption[] }>(
        session.token,
        '/api/admin/railway/services'
      );
      setServices(data.services);
      setCustomers(data.customers);

      setSelections((prev) => {
        const next = { ...prev };
        for (const svc of data.services) {
          const key = `${svc.projectId}:${svc.serviceId}`;
          if (svc.mapped || next[key]) continue;
          const suggested = svc.suggestedCustomerId
            ? data.customers.find((c) => c.id === svc.suggestedCustomerId)
            : null;
          next[key] = {
            subscriptionId: suggested?.subscriptions[0]?.id ?? '',
            environmentId: defaultEnvironmentId(svc.environments),
            hostingMode: 'DEDICATED',
            suspensionStrategy: 'STOP_DEPLOYMENT',
          };
        }
        return next;
      });
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Could not reach Railway.');
    }
  }, [session, isSuperAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const unmappedCount = useMemo(() => (services ?? []).filter((s) => !s.mapped).length, [services]);

  function updateSelection(key: string, patch: Partial<(typeof selections)[string]>) {
    setSelections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  async function handleMap(svc: DiscoveredService) {
    if (!session) return;
    const key = `${svc.projectId}:${svc.serviceId}`;
    const sel = selections[key];
    setRowError((prev) => ({ ...prev, [key]: '' }));

    if (!sel?.subscriptionId) {
      setRowError((prev) => ({ ...prev, [key]: 'Pick a customer first.' }));
      return;
    }
    if (!sel.environmentId) {
      setRowError((prev) => ({ ...prev, [key]: 'Pick an environment first.' }));
      return;
    }

    setMappingKey(key);
    try {
      await authFetch(session.token, `/api/admin/subscriptions/${sel.subscriptionId}/railway-resource`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: svc.projectId,
          environmentId: sel.environmentId,
          serviceId: svc.serviceId,
          hostingMode: sel.hostingMode,
          suspensionStrategy: sel.suspensionStrategy,
        }),
      });
      await load();
    } catch (err) {
      setRowError((prev) => ({ ...prev, [key]: err instanceof ApiError ? err.message : 'Failed to map' }));
    } finally {
      setMappingKey(null);
    }
  }

  if (!isSuperAdmin) {
    return (
      <p style={{ color: 'var(--ink-soft)' }}>
        Only the super admin can browse and map Railway infrastructure.
      </p>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Import Railway services</h1>
      <p style={{ color: 'var(--ink-soft)', marginTop: 0, maxWidth: 640 }}>
        Every project and service visible to your <code className="mono">RAILWAY_API_TOKEN</code>, pulled live —
        no more copying project/service IDs by hand. Railway has no idea which customer owns which service, so
        that part still needs a human: pick the customer per row (a likely match is pre-selected when one of
        their domains matches the service name) and confirm.
      </p>

      {loadError && (
        <div className="card" style={{ marginTop: '1em', borderColor: 'var(--danger)' }}>
          <p className="error-text" style={{ margin: 0 }}>{loadError}</p>
          <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: '0.5em', marginBottom: 0 }}>
            Make sure <code className="mono">RAILWAY_API_TOKEN</code> is set on this app&apos;s own Railway
            service (Variables tab) — it needs to be a personal account token, not a project-scoped one, or
            this list will come back empty.
          </p>
        </div>
      )}

      {!loadError && services === null && <p style={{ color: 'var(--ink-soft)' }}>Loading from Railway…</p>}

      {services !== null && (
        <>
          <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: '1.2em' }}>
            {services.length} service{services.length === 1 ? '' : 's'} found · {unmappedCount} not yet mapped
          </p>

          {services.length === 0 && !loadError && (
            <div className="card" style={{ marginTop: '1em', color: 'var(--ink-soft)' }}>
              No projects/services were returned for this token.
            </div>
          )}

          <div className="table-scroll" style={{ marginTop: '1em' }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Project / Service</th>
                  <th>Environment</th>
                  <th>Customer</th>
                  <th>Mode / Strategy</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {services.map((svc) => {
                  const key = `${svc.projectId}:${svc.serviceId}`;
                  const sel = selections[key];
                  return (
                    <tr key={key}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{svc.serviceName}</div>
                        <div className="mono" style={{ fontSize: '0.8em', color: 'var(--ink-soft)' }}>
                          {svc.projectName}
                        </div>
                      </td>
                      <td>
                        {svc.mapped ? (
                          '—'
                        ) : (
                          <select
                            value={sel?.environmentId ?? ''}
                            onChange={(e) => updateSelection(key, { environmentId: e.target.value })}
                          >
                            {svc.environments.map((env) => (
                              <option key={env.id} value={env.id}>{env.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        {svc.mapped ? (
                          <span>
                            <span className="status-dot" style={{ background: 'var(--forest-bright)' }} />
                            {svc.mapped.customerName ?? 'Mapped'}{' '}
                            {svc.mapped.customerCode && (
                              <span className="mono" style={{ color: 'var(--ink-soft)' }}>
                                ({svc.mapped.customerCode})
                              </span>
                            )}
                          </span>
                        ) : (
                          <select
                            value={sel?.subscriptionId ?? ''}
                            onChange={(e) => updateSelection(key, { subscriptionId: e.target.value })}
                          >
                            <option value="">Select customer…</option>
                            {customers.map((c) =>
                              c.subscriptions.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {c.name} ({c.customerCode}) — {s.status}
                                  {svc.suggestedCustomerId === c.id ? ' · suggested' : ''}
                                </option>
                              ))
                            )}
                          </select>
                        )}
                      </td>
                      <td>
                        {svc.mapped ? (
                          <span style={{ fontSize: '0.85em' }}>
                            {svc.mapped.hostingMode} / {svc.mapped.suspensionStrategy}
                          </span>
                        ) : (
                          <div style={{ display: 'flex', gap: '0.4em' }}>
                            <select
                              value={sel?.hostingMode ?? 'DEDICATED'}
                              onChange={(e) => {
                                const mode = e.target.value as HostingMode;
                                updateSelection(key, {
                                  hostingMode: mode,
                                  suspensionStrategy: mode === 'MULTI_TENANT' ? 'APP_LEVEL' : 'STOP_DEPLOYMENT',
                                });
                              }}
                            >
                              <option value="DEDICATED">Dedicated</option>
                              <option value="SHARED_SERVICE">Shared service</option>
                              <option value="MULTI_TENANT">Multi-tenant</option>
                            </select>
                            <select
                              value={sel?.suspensionStrategy ?? 'STOP_DEPLOYMENT'}
                              disabled={sel?.hostingMode === 'MULTI_TENANT'}
                              onChange={(e) =>
                                updateSelection(key, { suspensionStrategy: e.target.value as SuspensionStrategy })
                              }
                            >
                              {sel?.hostingMode === 'MULTI_TENANT' ? (
                                <option value="APP_LEVEL">App level</option>
                              ) : (
                                <>
                                  <option value="STOP_DEPLOYMENT">Stop deployment</option>
                                  <option value="REDIRECT">Redirect</option>
                                  <option value="MANUAL">Manual</option>
                                </>
                              )}
                            </select>
                          </div>
                        )}
                      </td>
                      <td>
                        {!svc.mapped && (
                          <>
                            <button
                              className="btn btn-primary"
                              disabled={mappingKey === key}
                              onClick={() => handleMap(svc)}
                              style={{ padding: '0.4em 0.9em', fontSize: '0.85em' }}
                            >
                              {mappingKey === key ? 'Mapping…' : 'Map'}
                            </button>
                            {rowError[key] && (
                              <div className="error-text" style={{ fontSize: '0.78em', marginTop: '0.3em' }}>
                                {rowError[key]}
                              </div>
                            )}
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
