'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useAuth } from '../../../_components/AuthProvider';
import { authFetch, ApiError } from '../../../_lib/api';

interface Subscription {
  id: string;
  customerId: string;
  planId: string;
  status: string;
  suspensionEnabled: boolean;
  currentPeriodEnd: string;
  nextBillingDate: string;
  gracePeriodEnd: string | null;
  dryRunOverride: boolean | null;
}

interface Plan {
  id: string;
  name: string;
}

type HostingMode = 'DEDICATED' | 'SHARED_SERVICE' | 'MULTI_TENANT';
type SuspensionStrategy = 'STOP_DEPLOYMENT' | 'APP_LEVEL' | 'REDIRECT' | 'MANUAL';

interface RailwayResource {
  id: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  deploymentId: string | null;
  hostingMode: HostingMode;
  suspensionStrategy: SuspensionStrategy;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
}

interface HostingAccountOption {
  id: string;
  provider: 'RAILWAY' | 'DIGITALOCEAN' | 'AWS' | 'VERCEL';
  label: string;
  isActive: boolean;
}

interface RailwayEnvironmentOption {
  id: string;
  name: string;
}

interface DiscoveredService {
  projectId: string;
  projectName: string;
  serviceId: string;
  serviceName: string;
  environments: RailwayEnvironmentOption[];
  defaultEnvironmentId: string;
  latestDeploymentId: string | null;
  mapped: { subscriptionId: string } | null;
  suggestedCustomerId: string | null;
}

// Three plain-language positions in place of the old two buttons +
// paragraph of prose — the badge next to this always says, in one
// glance, what Suspend/Restore will actually do.
type DryRunMode = 'inherit' | 'dryrun' | 'real';

function modeFromOverride(override: boolean | null): DryRunMode {
  return override === null ? 'inherit' : override ? 'dryrun' : 'real';
}

function overrideFromMode(mode: DryRunMode): boolean | null {
  if (mode === 'inherit') return null;
  return mode === 'dryrun';
}

function statusBadgeClass(status: RailwayResource['status']): string {
  switch (status) {
    case 'ACTIVE':
      return 'badge badge-success';
    case 'STOPPED':
      return 'badge badge-warning';
    case 'ERROR':
      return 'badge badge-danger';
    default:
      return 'badge badge-neutral';
  }
}

export default function SubscriptionDetailPage({ params }: { params: { id: string } }) {
  const { session } = useAuth();
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [resources, setResources] = useState<RailwayResource[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [planId, setPlanId] = useState('');
  const [suspensionEnabled, setSuspensionEnabled] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  const [actionPending, setActionPending] = useState<'suspend' | 'restore' | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const [dryRunPending, setDryRunPending] = useState(false);
  const [dryRunNotice, setDryRunNotice] = useState<string | null>(null);

  // ---------- Railway infrastructure: live auto-discovery ----------
  const [hostingAccounts, setHostingAccounts] = useState<HostingAccountOption[] | null>(null);
  const [selectedAccountId, setSelectedAccountId] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredService[] | null>(null);
  const [discoverError, setDiscoverError] = useState<string | null>(null);
  const [selectedServiceKey, setSelectedServiceKey] = useState('');
  const [discoverEnvironmentId, setDiscoverEnvironmentId] = useState('');
  const [hostingMode, setHostingMode] = useState<HostingMode>('DEDICATED');
  const [suspensionStrategy, setSuspensionStrategy] = useState<SuspensionStrategy>('STOP_DEPLOYMENT');
  const [mapping, setMapping] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapNotice, setMapNotice] = useState<string | null>(null);

  // Manual entry stays available as a fallback (no Railway account
  // connected, or the service you need isn't showing up for some
  // reason) — collapsed by default now that auto-discovery covers the
  // common case.
  const [showManual, setShowManual] = useState(false);
  const [manualProjectId, setManualProjectId] = useState('');
  const [manualEnvironmentId, setManualEnvironmentId] = useState('production');
  const [manualServiceId, setManualServiceId] = useState('');
  const [manualDeploymentId, setManualDeploymentId] = useState('');

  const isSuperAdmin = session?.role === 'SUPER_ADMIN';

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const [subData, planData] = await Promise.all([
        authFetch<{ subscription: Subscription }>(session.token, `/api/admin/subscriptions/${params.id}`),
        authFetch<{ plans: Plan[] }>(session.token, '/api/admin/plans'),
      ]);
      setSubscription(subData.subscription);
      setPlanId(subData.subscription.planId);
      setSuspensionEnabled(subData.subscription.suspensionEnabled);
      setPlans(planData.plans);

      // Railway resources are SUPER_ADMIN-only — don't even attempt this
      // call for a plain admin, since it would 403 and (if bundled into
      // the same Promise.all as everything else) take the whole page
      // load down with it.
      if (session.role === 'SUPER_ADMIN') {
        const resourceData = await authFetch<{ resources: RailwayResource[] }>(
          session.token,
          `/api/admin/subscriptions/${params.id}/railway-resource`
        );
        setResources(resourceData.resources);
      }
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : 'Failed to load subscription');
    }
  }, [session, params.id]);

  useEffect(() => {
    load();
  }, [load]);

  // ---------- discover live Railway services, same mechanism as the
  // bulk "Import Railway services" screen, scoped to this one
  // subscription so mapping it is "pick from a list" instead of typing
  // project/service/environment ids by hand. ----------
  useEffect(() => {
    if (!session || !isSuperAdmin) return;
    authFetch<{ accounts: HostingAccountOption[] }>(session.token, '/api/admin/hosting-accounts')
      .then((data) => {
        const railwayAccounts = data.accounts.filter((a) => a.provider === 'RAILWAY');
        setHostingAccounts(railwayAccounts);
        setSelectedAccountId((prev) => {
          if (prev && railwayAccounts.some((a) => a.id === prev)) return prev;
          return railwayAccounts.find((a) => a.isActive)?.id ?? railwayAccounts[0]?.id ?? '';
        });
      })
      .catch(() => setHostingAccounts([]));
  }, [session, isSuperAdmin]);

  const loadDiscovered = useCallback(async () => {
    if (!session || !isSuperAdmin || !selectedAccountId) return;
    setDiscoverError(null);
    try {
      const data = await authFetch<{ services: DiscoveredService[] }>(
        session.token,
        `/api/admin/railway/services?accountId=${encodeURIComponent(selectedAccountId)}`
      );
      setDiscovered(data.services);
    } catch (err) {
      setDiscoverError(err instanceof ApiError ? err.message : 'Could not reach Railway.');
      setDiscovered([]);
    }
  }, [session, isSuperAdmin, selectedAccountId]);

  useEffect(() => {
    setDiscovered(null);
    setSelectedServiceKey('');
    loadDiscovered();
  }, [loadDiscovered]);

  const unmappedServices = useMemo(() => (discovered ?? []).filter((s) => !s.mapped), [discovered]);

  // Grouped by project (preserving first-seen order) so the picker shows
  // "Project A: serviceX, serviceY" as one visual group instead of a flat
  // list that repeats the project name on every row — several real
  // customers' services (a frontend + its own API, say) commonly live
  // side by side in one Railway project.
  const groupedUnmappedServices = useMemo(() => {
    const order: string[] = [];
    const groups = new Map<string, { projectName: string; services: DiscoveredService[] }>();
    for (const svc of unmappedServices) {
      if (!groups.has(svc.projectId)) {
        groups.set(svc.projectId, { projectName: svc.projectName, services: [] });
        order.push(svc.projectId);
      }
      groups.get(svc.projectId)!.services.push(svc);
    }
    return order.map((projectId) => ({ projectId, ...groups.get(projectId)! }));
  }, [unmappedServices]);

  // Pre-select whichever unmapped service looks like it belongs to this
  // subscription's own customer — the same domain-name heuristic the
  // bulk import screen uses — so the common case is "confirm and click
  // Map", not "hunt through every service on the account".
  useEffect(() => {
    if (!subscription || selectedServiceKey) return;
    const suggested = unmappedServices.find((s) => s.suggestedCustomerId === subscription.customerId);
    if (suggested) {
      setSelectedServiceKey(`${suggested.projectId}:${suggested.serviceId}`);
      setDiscoverEnvironmentId(suggested.defaultEnvironmentId);
    }
  }, [subscription, unmappedServices, selectedServiceKey]);

  const selectedService = useMemo(
    () => unmappedServices.find((s) => `${s.projectId}:${s.serviceId}` === selectedServiceKey) ?? null,
    [unmappedServices, selectedServiceKey]
  );

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session || !subscription) return;
    setSaveError(null);
    setSaveNotice(null);
    setSaving(true);
    try {
      await authFetch(session.token, `/api/admin/subscriptions/${params.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ planId, suspensionEnabled }),
      });
      setSaveNotice('Saved');
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiError ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  async function handleSuspendOrRestore(action: 'suspend' | 'restore') {
    if (!session || !subscription) return;
    const mode = modeFromOverride(subscription.dryRunOverride);
    if (mode === 'real') {
      const verb = action === 'suspend' ? 'suspend' : 'restore';
      const confirmed = window.confirm(
        `Real mode is on for this subscription — this will actually ${verb} the customer's live hosting, not a simulation. Continue?`
      );
      if (!confirmed) return;
    }
    setActionNotice(null);
    setActionPending(action);
    try {
      const result = await authFetch<{ outcome: string; reason?: string }>(
        session.token,
        `/api/subscriptions/${params.id}/${action}`,
        { method: 'POST', body: JSON.stringify({}) }
      );
      setActionNotice(`${action === 'suspend' ? 'Suspend' : 'Restore'} outcome: ${result.outcome}`);
      await load();
    } catch (err) {
      setActionNotice(err instanceof ApiError ? err.message : `Failed to ${action}`);
    } finally {
      setActionPending(null);
    }
  }

  // One click sets the mode AND persists it immediately — no separate
  // "now click Suspend" step to remember, and the badge above always
  // reflects exactly what's saved.
  async function handleSetMode(mode: DryRunMode) {
    if (!session) return;
    setDryRunNotice(null);
    setDryRunPending(true);
    try {
      const result = await authFetch<{ outcome: string; message: string }>(
        session.token,
        `/api/admin/subscriptions/${params.id}/dry-run-override`,
        { method: 'POST', body: JSON.stringify({ override: overrideFromMode(mode) }) }
      );
      setDryRunNotice(result.message);
      await load();
    } catch (err) {
      setDryRunNotice(err instanceof ApiError ? err.message : 'Failed to update dry-run override');
    } finally {
      setDryRunPending(false);
    }
  }

  async function handleAutoMap() {
    if (!session || !selectedService) return;
    setMapError(null);
    setMapNotice(null);
    setMapping(true);
    try {
      await authFetch(session.token, `/api/admin/subscriptions/${params.id}/railway-resource`, {
        method: 'POST',
        body: JSON.stringify({
          hostingAccountId: selectedAccountId,
          projectId: selectedService.projectId,
          environmentId: discoverEnvironmentId || selectedService.defaultEnvironmentId,
          serviceId: selectedService.serviceId,
          deploymentId:
            (discoverEnvironmentId || selectedService.defaultEnvironmentId) === selectedService.defaultEnvironmentId
              ? selectedService.latestDeploymentId
              : null,
          hostingMode,
          suspensionStrategy,
        }),
      });
      setMapNotice('Mapped');
      setSelectedServiceKey('');
      await Promise.all([load(), loadDiscovered()]);
    } catch (err) {
      setMapError(err instanceof ApiError ? err.message : 'Failed to map resource');
    } finally {
      setMapping(false);
    }
  }

  async function handleManualMap(e: React.FormEvent) {
    e.preventDefault();
    if (!session) return;
    setMapError(null);
    setMapNotice(null);
    setMapping(true);
    try {
      await authFetch(session.token, `/api/admin/subscriptions/${params.id}/railway-resource`, {
        method: 'POST',
        body: JSON.stringify({
          hostingAccountId: selectedAccountId,
          projectId: manualProjectId,
          environmentId: manualEnvironmentId,
          serviceId: manualServiceId,
          deploymentId: manualDeploymentId || null,
          hostingMode,
          suspensionStrategy,
        }),
      });
      setMapNotice('Mapped');
      setManualProjectId('');
      setManualServiceId('');
      setManualDeploymentId('');
      await Promise.all([load(), loadDiscovered()]);
    } catch (err) {
      setMapError(err instanceof ApiError ? err.message : 'Failed to map resource');
    } finally {
      setMapping(false);
    }
  }

  if (loadError) return <p className="error-text">{loadError}</p>;
  if (!subscription) return <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>;

  const mode = modeFromOverride(subscription.dryRunOverride);
  const modeBadgeClass =
    mode === 'real' ? 'badge badge-danger' : mode === 'dryrun' ? 'badge badge-warning' : 'badge badge-neutral';
  const modeLabel =
    mode === 'real'
      ? 'Real — will actually act'
      : mode === 'dryrun'
        ? 'Dry-run — simulated only'
        : 'Inherits global setting';

  return (
    <div>
      <h1 style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>Subscription</h1>
      <p className="mono" style={{ color: 'var(--ink-soft)', marginTop: 0 }}>{subscription.id}</p>

      <div className="layout-main-side" style={{ marginTop: '1.5em' }}>
        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0 }}>Details</h2>
          <div className="table-scroll">
            <table className="data-table">
              <tbody>
                <tr><th>Status</th><td>{subscription.status}</td></tr>
                <tr><th>Next billing</th><td className="mono">{new Date(subscription.nextBillingDate).toLocaleString()}</td></tr>
                <tr><th>Current period ends</th><td className="mono">{new Date(subscription.currentPeriodEnd).toLocaleString()}</td></tr>
                <tr><th>Grace period ends</th><td className="mono">{subscription.gracePeriodEnd ? new Date(subscription.gracePeriodEnd).toLocaleString() : '—'}</td></tr>
              </tbody>
            </table>
          </div>

          {isSuperAdmin ? (
            <>
              <hr className="section-divider" />
              <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.8em' }}>
                Suspend / restore
              </h2>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.6em' }}>
                <span className={modeBadgeClass}>
                  <span className="status-dot" style={{ background: 'currentColor' }} />
                  {modeLabel}
                </span>
                <div className="seg-control" role="group" aria-label="Dry-run mode">
                  <button
                    type="button"
                    className={mode === 'inherit' ? 'active' : ''}
                    disabled={dryRunPending}
                    onClick={() => handleSetMode('inherit')}
                  >
                    Inherit
                  </button>
                  <button
                    type="button"
                    className={mode === 'dryrun' ? 'active' : ''}
                    disabled={dryRunPending}
                    onClick={() => handleSetMode('dryrun')}
                  >
                    Dry-run
                  </button>
                  <button
                    type="button"
                    className={mode === 'real' ? 'active' : ''}
                    disabled={dryRunPending}
                    onClick={() => handleSetMode('real')}
                  >
                    Real
                  </button>
                </div>
              </div>
              {dryRunNotice && <p style={{ fontSize: '0.82em', color: 'var(--ink-soft)', marginTop: '0.6em' }}>{dryRunNotice}</p>}

              <div style={{ marginTop: '1.3em', display: 'flex', gap: '0.6em' }}>
                <button
                  className="btn btn-primary"
                  disabled={actionPending !== null}
                  onClick={() => handleSuspendOrRestore('suspend')}
                >
                  {actionPending === 'suspend' ? 'Suspending…' : 'Suspend now'}
                </button>
                <button
                  className="btn"
                  disabled={actionPending !== null}
                  onClick={() => handleSuspendOrRestore('restore')}
                >
                  {actionPending === 'restore' ? 'Restoring…' : 'Restore now'}
                </button>
              </div>
              {actionNotice && <p style={{ fontSize: '0.9em', marginTop: '0.8em' }}>{actionNotice}</p>}
              {resources && resources.length === 0 && (
                <p style={{ fontSize: '0.8em', color: 'var(--clay)', marginTop: '0.8em' }}>
                  No Railway resource is mapped to this subscription yet — suspend/restore will
                  succeed without ever touching real infrastructure. Map one below first.
                </p>
              )}
            </>
          ) : (
            <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)', marginTop: '1.5em' }}>
              Only the super admin can suspend, restore, or manage Railway infrastructure for this
              subscription.
            </p>
          )}

          {isSuperAdmin && (
            <>
              <hr className="section-divider" />
              <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '0.8em' }}>
                Railway infrastructure
              </h2>

              {resources === null && <p style={{ color: 'var(--ink-soft)' }}>Loading…</p>}
              {resources && resources.length > 0 && (
                <div className="table-scroll">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Service</th>
                        <th>Mode</th>
                        <th>Strategy</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resources.map((r) => (
                        <tr key={r.id}>
                          <td className="mono" style={{ fontSize: '0.85em' }}>{r.serviceId}</td>
                          <td style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>{r.hostingMode}</td>
                          <td style={{ color: 'var(--ink-soft)', fontSize: '0.9em' }}>{r.suspensionStrategy}</td>
                          <td>
                            <span className={statusBadgeClass(r.status)}>
                              <span className="status-dot" style={{ background: 'currentColor' }} />
                              {r.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="card" style={{ background: 'var(--paper)', marginTop: '1.2em', padding: '1.2em' }}>
                <h3 style={{ fontSize: '0.95em', fontWeight: 600, marginTop: 0, marginBottom: '0.3em' }}>
                  Map a new resource
                </h3>
                <p style={{ fontSize: '0.82em', color: 'var(--ink-soft)', marginTop: 0, marginBottom: '1em' }}>
                  Pulled live from Railway — pick the service, everything else is filled in for you.
                </p>

                {hostingAccounts === null && <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>Loading Railway accounts…</p>}

                {hostingAccounts && hostingAccounts.length === 0 && (
                  <p style={{ fontSize: '0.85em', color: 'var(--ink-soft)' }}>
                    No Railway account is connected yet — connect one on the{' '}
                    <a href="/dashboard/hosting-accounts" style={{ color: 'var(--forest-bright)' }}>Hosting Accounts</a>{' '}
                    page, or map manually below.
                  </p>
                )}

                {hostingAccounts && hostingAccounts.length > 1 && (
                  <div className="field">
                    <label htmlFor="rw-account">Railway account</label>
                    <select id="rw-account" value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                      {hostingAccounts.map((a) => (
                        <option key={a.id} value={a.id} disabled={!a.isActive}>
                          {a.label}{a.isActive ? '' : ' (disconnected)'}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {hostingAccounts && hostingAccounts.length > 0 && selectedAccountId && discovered === null && !discoverError && (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>Loading services from Railway…</p>
                )}

                {discoverError && <p className="error-text" style={{ fontSize: '0.85em' }}>{discoverError}</p>}

                {discovered !== null && unmappedServices.length === 0 && !discoverError && (
                  <p style={{ color: 'var(--ink-soft)', fontSize: '0.85em' }}>
                    Every service on this account is already mapped somewhere — map manually below if
                    the one you need isn&apos;t showing up.
                  </p>
                )}

                {unmappedServices.length > 0 && (
                  <>
                    <div className="field">
                      <label htmlFor="rw-service">Railway service</label>
                      <select
                        id="rw-service"
                        value={selectedServiceKey}
                        onChange={(e) => {
                          setSelectedServiceKey(e.target.value);
                          const svc = unmappedServices.find((s) => `${s.projectId}:${s.serviceId}` === e.target.value);
                          setDiscoverEnvironmentId(svc?.defaultEnvironmentId ?? '');
                        }}
                      >
                        <option value="">Choose a service…</option>
                        {groupedUnmappedServices.map((group) => (
                          <optgroup key={group.projectId} label={group.projectName}>
                            {group.services.map((svc) => {
                              const key = `${svc.projectId}:${svc.serviceId}`;
                              const suggested = subscription && svc.suggestedCustomerId === subscription.customerId;
                              return (
                                <option key={key} value={key}>
                                  {svc.serviceName}{suggested ? ' · suggested match' : ''}
                                </option>
                              );
                            })}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    {selectedService && selectedService.environments.length > 1 && (
                      <div className="field">
                        <label htmlFor="rw-env">Environment</label>
                        <select id="rw-env" value={discoverEnvironmentId} onChange={(e) => setDiscoverEnvironmentId(e.target.value)}>
                          {selectedService.environments.map((env) => (
                            <option key={env.id} value={env.id}>{env.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    <div className="field">
                      <label htmlFor="rw-mode">Hosting mode</label>
                      <select
                        id="rw-mode"
                        value={hostingMode}
                        onChange={(e) => {
                          const modeValue = e.target.value as HostingMode;
                          setHostingMode(modeValue);
                          if (modeValue === 'MULTI_TENANT') setSuspensionStrategy('APP_LEVEL');
                          else if (suspensionStrategy === 'APP_LEVEL') setSuspensionStrategy('STOP_DEPLOYMENT');
                        }}
                      >
                        <option value="DEDICATED">Dedicated</option>
                        <option value="SHARED_SERVICE">Shared service</option>
                        <option value="MULTI_TENANT">Multi-tenant</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor="rw-strategy">Suspension strategy</label>
                      <select
                        id="rw-strategy"
                        value={suspensionStrategy}
                        onChange={(e) => setSuspensionStrategy(e.target.value as SuspensionStrategy)}
                        disabled={hostingMode === 'MULTI_TENANT'}
                      >
                        {hostingMode === 'MULTI_TENANT' ? (
                          <option value="APP_LEVEL">App level (required for multi-tenant)</option>
                        ) : (
                          <>
                            <option value="STOP_DEPLOYMENT">Stop deployment</option>
                            <option value="REDIRECT">Redirect</option>
                            <option value="MANUAL">Manual</option>
                          </>
                        )}
                      </select>
                    </div>

                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={!selectedServiceKey || mapping}
                      onClick={handleAutoMap}
                      style={{ width: '100%', justifyContent: 'center' }}
                    >
                      {mapping ? 'Mapping…' : 'Map this service'}
                    </button>
                  </>
                )}

                {mapError && <p className="error-text" style={{ marginTop: '0.8em' }}>{mapError}</p>}
                {mapNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em', marginTop: '0.8em' }}>{mapNotice}</p>}
              </div>

              <button
                type="button"
                className="btn"
                style={{ marginTop: '1em', fontSize: '0.82em', padding: '0.45em 0.9em' }}
                onClick={() => setShowManual((s) => !s)}
              >
                {showManual ? 'Hide manual entry' : 'Enter Railway IDs manually instead'}
              </button>

              {showManual && (
                <form onSubmit={handleManualMap} style={{ marginTop: '1em' }}>
                  {hostingAccounts && hostingAccounts.length > 0 && (
                    <div className="field">
                      <label htmlFor="rw-manual-account">Railway account</label>
                      <select id="rw-manual-account" required value={selectedAccountId} onChange={(e) => setSelectedAccountId(e.target.value)}>
                        {hostingAccounts.map((a) => (
                          <option key={a.id} value={a.id} disabled={!a.isActive}>
                            {a.label}{a.isActive ? '' : ' (disconnected)'}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="rw-project">Project ID</label>
                    <input id="rw-project" required value={manualProjectId} onChange={(e) => setManualProjectId(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="rw-env-manual">Environment ID</label>
                    <input id="rw-env-manual" required value={manualEnvironmentId} onChange={(e) => setManualEnvironmentId(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="rw-service-manual">Service ID</label>
                    <input id="rw-service-manual" required value={manualServiceId} onChange={(e) => setManualServiceId(e.target.value)} />
                  </div>
                  <div className="field">
                    <label htmlFor="rw-deployment">Deployment ID (optional)</label>
                    <input id="rw-deployment" value={manualDeploymentId} onChange={(e) => setManualDeploymentId(e.target.value)} />
                  </div>

                  <button type="submit" className="btn btn-primary" disabled={mapping} style={{ width: '100%', justifyContent: 'center' }}>
                    {mapping ? 'Mapping…' : 'Map Railway resource'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>

        <div className="card">
          <h2 style={{ fontSize: '1.05em', fontWeight: 600, marginTop: 0, marginBottom: '1em' }}>Edit</h2>
          <form onSubmit={handleSave}>
            <div className="field">
              <label htmlFor="edit-plan">Plan</label>
              <select id="edit-plan" value={planId} onChange={(e) => setPlanId(e.target.value)}>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="field" style={{ flexDirection: 'row', alignItems: 'center', gap: '0.6em' }}>
              <input
                id="edit-suspension-enabled"
                type="checkbox"
                checked={suspensionEnabled}
                onChange={(e) => setSuspensionEnabled(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label htmlFor="edit-suspension-enabled" style={{ margin: 0 }}>Automatic suspension enabled</label>
            </div>

            {saveError && <p className="error-text">{saveError}</p>}
            {saveNotice && <p style={{ color: 'var(--forest-bright)', fontSize: '0.9em' }}>{saveNotice}</p>}

            <button type="submit" className="btn btn-primary" disabled={saving} style={{ width: '100%', justifyContent: 'center' }}>
              {saving ? 'Saving…' : 'Save changes'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
