'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../_components/CustomerAuthProvider';
import { fetchDashboardData, fetchInvoicePdf } from './_components/dashboardData';
import { DashboardData, NEEDS_ATTENTION_STATUSES, UptimeWindow, formatAmount, PortalResource } from './_components/types';
import { DashboardLayout } from './_components/DashboardLayout';
import { DashboardSkeleton, DashboardErrorState } from './_components/Skeletons';
import { WelcomeHero } from './_components/WelcomeHero';
import { SystemUptimeCard } from './_components/SystemUptimeCard';
import { ServerHealthCard } from './_components/ServerHealthCard';
import { SystemActivityCard } from './_components/SystemActivityCard';
import { UptimeRing } from './_components/UptimeGauge';

export default function ClientDashboardPage() {
  const { session, logout, loading: authLoading } = useCustomerAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingInvoiceId, setOpeningInvoiceId] = useState<string | null>(null);
  const [uptimeWindow, setUptimeWindow] = useState<UptimeWindow>('d1');

  const load = useCallback(async () => {
    if (!session) return;
    setLoadError(null);
    try {
      setData(await fetchDashboardData(session.token));
    } catch {
      setLoadError('Unable to load system health');
    }
  }, [session]);

  useEffect(() => {
    if (!authLoading && !session) {
      router.replace('/client/login');
    }
  }, [authLoading, session, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleViewInvoice(invoiceId: string) {
    if (!session) return;
    setOpeningInvoiceId(invoiceId);
    try {
      const blob = await fetchInvoicePdf(session.token, invoiceId);
      window.open(URL.createObjectURL(blob), '_blank');
    } catch {
      // Best-effort — a failed PDF open shouldn't crash the dashboard.
    } finally {
      setOpeningInvoiceId(null);
    }
  }

  function handleLogout() {
    logout();
    router.push('/client/login');
  }

  if (authLoading || (!data && !loadError)) {
    return (
      <main className="w3-shell">
        <div style={{ maxWidth: 1400, margin: '0 auto', padding: '1.8em 1.6em' }}>
          <DashboardSkeleton />
        </div>
      </main>
    );
  }

  if (loadError || !data) {
    return (
      <main className="w3-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.6em' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>
          <DashboardErrorState message={loadError ?? 'Unable to load your dashboard'} onRetry={load} />
        </div>
      </main>
    );
  }

  const anySubscriptionNeedsAttention = data.subscriptions.some((s) => NEEDS_ATTENTION_STATUSES.includes(s.status));
  const allResources = data.subscriptions.flatMap((s) => s.resources);
  const anyResourceDown = allResources.some((r) => r.status === 'STOPPED' || r.status === 'ERROR');
  const systemsOk = !anyResourceDown && !anySubscriptionNeedsAttention;
  const alertEvents = data.activity.events.filter((e) => e.status !== 'ACTIVE');

  return (
    <DashboardLayout
      customerName={data.customer.name}
      customerCode={data.customer.customerCode}
      systemsOk={systemsOk}
      alerts={alertEvents}
      onLogout={handleLogout}
    >
      {({ goToSection }) => (
        <>
          <div id="overview" style={{ scrollMarginTop: 92 }}>
            <WelcomeHero
              customerName={data.customer.name}
              systemsOk={systemsOk}
              needsAttentionMessage={anySubscriptionNeedsAttention ? 'Your subscription needs attention — see billing below.' : null}
              onViewDetails={() => goToSection('subscriptions')}
            />

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2em', marginBottom: '1.2em' }}>
              <SystemUptimeCard
                uptimeSummary={data.uptimeSummary}
                hasResources={allResources.length > 0}
                window={uptimeWindow}
                onWindowChange={setUptimeWindow}
              />
              <ServerHealthCard resources={allResources} onSelect={() => goToSection('subscriptions')} />
            </div>

            <SystemActivityCard events={data.activity.events} series={data.activity.series} />
          </div>

          {/* Subscriptions */}
          <div id="subscriptions" style={{ scrollMarginTop: 92 }}>
            <div className="w3-label" style={{ marginBottom: '0.8em' }}>SUBSCRIPTIONS</div>
            {allResources.length === 0 ? (
              <div className="w3-panel" style={{ marginBottom: '1.4em', color: 'var(--w3-text-soft)', fontSize: '0.9em' }}>
                No infrastructure has been mapped to your account yet — our team is setting this up.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1em', marginBottom: '1.4em' }}>
                {allResources.map((r: PortalResource) => (
                  <div key={r.id} className="w3-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.2em' }}>
                    <UptimeRing uptime={r.uptime} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.3em' }}>
                        <span
                          className="w3-pulse-dot"
                          style={{ background: r.status === 'ACTIVE' ? 'var(--w3-cyan)' : r.status === 'UNKNOWN' ? 'var(--w3-amber)' : 'var(--w3-danger)' }}
                        />
                        <span style={{ fontWeight: 600 }}>{r.status}</span>
                      </div>
                      <div className="w3-label" style={{ marginBottom: '0.4em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</div>
                      <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>
                        {r.uptime.totalChecks > 0
                          ? `${r.uptime.activeChecks}/${r.uptime.conclusiveChecks} checks up${r.uptime.windowStart ? ` since ${new Date(r.uptime.windowStart).toLocaleDateString()}` : ''}`
                          : 'Monitoring just started'}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Billing */}
          <div id="billing" style={{ scrollMarginTop: 92 }}>
            <div className="w3-label" style={{ marginBottom: '0.8em' }}>BILLING</div>
            {data.subscriptions.length === 0 ? (
              <div className="w3-panel" style={{ marginBottom: '1.4em', color: 'var(--w3-text-soft)', fontSize: '0.9em' }}>
                No subscription set up yet.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1em', marginBottom: '1.4em' }}>
                {data.subscriptions.map((s) => (
                  <div key={s.id} className="w3-panel">
                    <div className="w3-label" style={{ marginBottom: '0.4em' }}>{s.planName ?? 'Plan'}</div>
                    <div className="w3-stat-value" style={{ fontSize: '1.5em', marginBottom: '0.5em' }}>
                      {s.amount !== null && s.currency ? formatAmount(s.amount, s.currency) : '—'}
                    </div>
                    <div style={{ fontSize: '0.82em', color: 'var(--w3-text-soft)' }}>Status: {s.status}</div>
                    <div style={{ fontSize: '0.82em', color: 'var(--w3-text-soft)' }}>
                      Next billing: {new Date(s.nextBillingDate).toLocaleDateString()}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {anySubscriptionNeedsAttention && (
              <div style={{ marginBottom: '1.4em' }}>
                <a href={`/renew/${encodeURIComponent(data.customer.customerCode)}`} className="w3-btn" style={{ textDecoration: 'none' }}>
                  Renew now
                </a>
              </div>
            )}
          </div>

          {/* Domains + Invoices */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.4em' }}>
            <div id="domains" style={{ scrollMarginTop: 92 }}>
              <div className="w3-label" style={{ marginBottom: '0.8em' }}>DOMAINS</div>
              <div className="w3-panel">
                {data.domains.length === 0 ? (
                  <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>No domains attached yet.</p>
                ) : (
                  data.domains.map((d) => (
                    <div key={d.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5em 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <span className="w3-mono">{d.domainName}</span>
                      <span style={{ fontSize: '0.85em', color: 'var(--w3-text-soft)' }}>{d.railwayStatus ?? '—'}</span>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div id="invoices" style={{ scrollMarginTop: 92 }}>
              <div className="w3-label" style={{ marginBottom: '0.8em' }}>INVOICES</div>
              <div className="w3-panel">
                {data.invoices.length === 0 ? (
                  <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>No invoices yet.</p>
                ) : (
                  data.invoices.map((inv) => (
                    <div key={inv.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5em 0', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                      <div>
                        <div className="w3-mono" style={{ fontSize: '0.85em' }}>{inv.invoiceNumber}</div>
                        <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>
                          {formatAmount(inv.amount, inv.currency)} · {inv.status}
                        </div>
                      </div>
                      <button
                        onClick={() => handleViewInvoice(inv.id)}
                        disabled={openingInvoiceId === inv.id}
                        className="w3-btn"
                        style={{ padding: '0.4em 0.8em', fontSize: '0.8em' }}
                      >
                        {openingInvoiceId === inv.id ? '…' : 'View'}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </DashboardLayout>
  );
}
