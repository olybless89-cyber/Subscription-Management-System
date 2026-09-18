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

interface FullCustomer {
  id: string;
  email: string;
}

interface PlanOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface DiscoveredService {
  projectId: string;
  projectName: string;
  serviceId: string;
  serviceName: string;
  environments: RailwayEnvironment[];
  defaultEnvironmentId: string;
  latestDeploymentId: string | null;
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

// Sentinel value for the customer <select> meaning "don't ask me to pick
// one — auto-create a placeholder customer named after this service, and
// let me rename/fix it properly on the Customers page afterward." Kept
// out of band from real subscription ids (those are cuids, never this
// literal string).
const PLACEHOLDER = '__PLACEHOLDER__';

function defaultEnvironmentId(envs: RailwayEnvironment[]): string {
  return envs.find((e) => e.name.toLowerCase() === 'production')?.id ?? envs[0]?.id ?? '';
}

/** Turns a Railway service name into a short, stable, URL/email-safe
 * slug — used both for the placeholder email's local part and, when the
 * service name isn't already domain-shaped, for a fabricated domain. */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/^https?-/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'service';
}

/** Many of these service names already look like the real domain
 * ("bellinzoneacredit.com", "https-veyloraglobal.com") — prefer that as
 * the placeholder's domainName when it's shaped like one, since it's
 * more useful to have on file than a fabricated placeholder. */
function looksLikeDomain(s: string): string | null {
  const stripped = s.replace(/^https?-/, '').toLowerCase();
  return /^[a-z0-9-]+\.[a-z]{2,}$/.test(stripped) ? stripped : null;
}

export default function RailwayImportPage() {
  const { session } = useAuth();
  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const [services, setServices] = useState<DiscoveredService[] | null>(null);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [plans, setPlans] = useState<PlanOption[]>([]);
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
      const [data, planData] = await Promise.all([
        authFetch<{ services: DiscoveredService[]; customers: CustomerOption[] }>(
          session.token,
          '/api/admin/railway/services'
        ),
        authFetch<{ plans: PlanOption[] }>(session.token, '/api/admin/plans').catch(() => ({ plans: [] })),
      ]);
      setServices(data.services);
      setCustomers(data.customers);
      setPlans(planData.plans);

      setSelections((prev) => {
        const next = { ...prev };
        for (const svc of data.services) {
          const key = `${svc.projectId}:${svc.serviceId}`;
          if (svc.mapped || next[key]) continue;
          const suggested = svc.suggestedCustomerId
            ? data.customers.find((c) => c.id === svc.suggestedCustomerId)
            : null;
          // Default to the suggested real customer when we have one; when
          // we don't, default to the placeholder rather than a blank
          // "Select customer…" — the whole point is that clicking Map
          // works immediately, with the customer fixed up afterward.
          next[key] = {
            subscriptionId: suggested?.subscriptions[0]?.id ?? PLACEHOLDER,
            environmentId: svc.defaultEnvironmentId || defaultEnvironmentId(svc.environments),
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
  const placeholderPlan = useMemo(() => plans.find((p) => p.isActive) ?? plans[0] ?? null, [plans]);

  function updateSelection(key: string, patch: Partial<(typeof selections)[string]>) {
    setSelections((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  }

  /** Creates (or reuses, on retry) a placeholder customer + a TRIAL
   * subscription for it, named after the Railway service so it's
   * identifiable in the Customers list until someone fixes the real
   * name/email/domain. Returns the new subscription id to map against. */
  async function ensurePlaceholderSubscription(svc: DiscoveredService): Promise<string> {
    if (!session) throw new Error('Not signed in');
    if (!placeholderPlan) {
      throw new Error('No plan exists yet — create one on the Plans page first, then come back and map.');
    }

    const slug = slugify(`${svc.projectName}-${svc.serviceName}`);
    const email = `placeholder+${slug}@digitalweboracleict.com`;
    const domainName = looksLikeDomain(svc.serviceName) ?? `${slugify(svc.serviceName)}.placeholder.local`;

    let customerId: string;
    try {
      const created = await authFetch<{ customer: { id: string } }>(session.token, '/api/admin/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: svc.serviceName,
          email,
          notificationEmail: email,
          domainName,
        }),
      });
      customerId = created.customer.id;
    } catch (err) {
      // Re-running Map after a partial failure (customer created, then
      // the subscription or resource step failed) would otherwise hit
      // ALREADY_EXISTS forever — look the existing placeholder up by its
      // deterministic email and reuse it instead of dead-ending.
      if (err instanceof ApiError && err.status === 409) {
        const list = await authFetch<{ customers: FullCustomer[] }>(session.token, '/api/admin/customers');
        const existing = list.customers.find((c) => c.email === email);
        if (!existing) throw err;
        customerId = existing.id;
      } else {
        throw err;
      }
    }

    const sub = await authFetch<{ subscription: { id: string } }>(session.token, '/api/admin/subscriptions', {
      method: 'POST',
      body: JSON.stringify({ customerId, planId: placeholderPlan.id }),
    });
    return sub.subscription.id;
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
      const subscriptionId =
        sel.subscriptionId === PLACEHOLDER ? await ensurePlaceholderSubscription(svc) : sel.subscriptionId;

      await authFetch(session.token, `/api/admin/subscriptions/${subscriptionId}/railway-resource`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: svc.projectId,
          environmentId: sel.environmentId,
          serviceId: svc.serviceId,
          // Populated up front from Railway's latest deployment for this
          // service/environment — STOP_DEPLOYMENT suspension has nothing
          // to act on without it (see src/lib/suspension/engine.ts). If
          // Railway had no deployment yet when the list loaded, this is
          // null and suspension will fail until re-mapped after a deploy.
          deploymentId: sel.environmentId === svc.defaultEnvironmentId ? svc.latestDeploymentId : null,
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
        no more copying project/service IDs by hand. Railway has no idea which customer owns which service: a
        likely match is pre-selected when one of their domains matches the service name, and every other row
        defaults to <strong>creating a new placeholder customer named after the service</strong> — click Map to
        proceed as-is, then rename it properly on the Customers page whenever you get to it.
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

      {services !== null && !placeholderPlan && (
        <div className="card" style={{ marginTop: '1em', borderColor: 'var(--danger)' }}>
          <p className="error-text" style={{ margin: 0 }}>
            No plan exists yet, so placeholder customers can&apos;t get a subscription. Create a plan on the
            Plans page, then come back — the existing real-customer matches above still work without one.
          </p>
        </div>
      )}

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
                            value={sel?.subscriptionId ?? PLACEHOLDER}
                            disabled={sel?.subscriptionId === PLACEHOLDER && !placeholderPlan}
                            onChange={(e) => updateSelection(key, { subscriptionId: e.target.value })}
                          >
                            <option value={PLACEHOLDER}>+ New customer &quot;{svc.serviceName}&quot; (fix later)</option>
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
