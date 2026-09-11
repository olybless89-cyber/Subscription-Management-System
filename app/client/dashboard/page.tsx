'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useCustomerAuth } from '../../_components/CustomerAuthProvider';

interface UptimeStats {
  uptimePercent: number | null;
  totalChecks: number;
  conclusiveChecks: number;
  activeChecks: number;
  inconclusiveChecks: number;
  windowStart: string | null;
  windowEnd: string;
  requestedWindowDays: number;
}

interface PortalResource {
  id: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  hostingMode: string;
  uptime: UptimeStats;
}

interface PortalSubscription {
  id: string;
  status: string;
  planName: string | null;
  amount: number | null;
  currency: string | null;
  currentPeriodEnd: string;
  nextBillingDate: string;
  resources: PortalResource[];
}

interface PortalInvoice {
  id: string;
  invoiceNumber: string;
  type: string;
  status: string;
  amount: number;
  currency: string;
  dueDate: string | null;
  paidAt: string | null;
  issuedAt: string;
}

interface PortalDomain {
  id: string;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
}

interface DashboardData {
  customer: { id: string; customerCode: string; name: string; email: string; status: string };
  subscriptions: PortalSubscription[];
  invoices: PortalInvoice[];
  domains: PortalDomain[];
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--w3-cyan)',
  STOPPED: 'var(--w3-danger)',
  UNKNOWN: 'var(--w3-amber)',
  ERROR: 'var(--w3-danger)',
};

const NEEDS_ATTENTION_STATUSES = ['PAYMENT_DUE', 'GRACE_PERIOD', 'SUSPENDED'];

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

function UptimeRing({ uptime }: { uptime: UptimeStats }) {
  const size = 92;
  const stroke = 8;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = uptime.uptimePercent ?? 0;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <div style={{ position: 'relative', width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={radius} strokeWidth={stroke} fill="none" className="w3-progress-ring-bg" />
        {uptime.uptimePercent !== null && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={stroke}
            fill="none"
            stroke="var(--w3-cyan)"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            strokeLinecap="round"
            style={{ transition: 'stroke-dashoffset 0.6s ease' }}
          />
        )}
      </svg>
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column' }}>
        {uptime.uptimePercent !== null ? (
          <span style={{ fontSize: '1.1em', fontWeight: 700 }}>{uptime.uptimePercent.toFixed(1)}%</span>
        ) : (
          <span style={{ fontSize: '0.65em', color: 'var(--w3-text-soft)', textAlign: 'center', padding: '0 0.4em' }}>
            No data yet
          </span>
        )}
      </div>
    </div>
  );
}

export default function ClientDashboardPage() {
  const { session, logout, loading: authLoading } = useCustomerAuth();
  const router = useRouter();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openingInvoiceId, setOpeningInvoiceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session) return;
    try {
      const res = await fetch('/api/customer/dashboard', {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        setLoadError('Failed to load your dashboard.');
        return;
      }
      setData(await res.json());
    } catch {
      setLoadError('Failed to load your dashboard.');
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
      const res = await fetch(`/api/admin/invoices/${invoiceId}/pdf`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) throw new Error('Failed to load invoice');
      const blob = await res.blob();
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
      <main className="w3-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--w3-text-soft)' }}>Loading your dashboard…</p>
      </main>
    );
  }

  if (loadError || !data) {
    return (
      <main className="w3-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: 'var(--w3-danger)' }}>{loadError}</p>
      </main>
    );
  }

  const anySubscriptionNeedsAttention = data.subscriptions.some((s) => NEEDS_ATTENTION_STATUSES.includes(s.status));
  const allResources = data.subscriptions.flatMap((s) => s.resources);
  const anyResourceDown = allResources.some((r) => r.status === 'STOPPED' || r.status === 'ERROR');

  return (
    <main className="w3-shell">
      <div className="w3-content" style={{ maxWidth: 1100, margin: '0 auto', padding: '1.6em 1.2em 3em' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.6em', flexWrap: 'wrap', gap: '0.8em' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
            <img src="/dwo-logo.jpg" alt="Web Oracle Host" style={{ height: 28, width: 'auto', borderRadius: 5 }} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '1.05em' }}>{data.customer.name}</div>
              <div className="w3-mono" style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>{data.customer.customerCode}</div>
            </div>
          </div>
          <button onClick={handleLogout} className="w3-btn" style={{ background: 'transparent' }}>
            Log out
          </button>
        </div>

        {/* Overall status hero */}
        <div className="w3-panel" style={{ marginBottom: '1.4em', display: 'flex', alignItems: 'center', gap: '1em', flexWrap: 'wrap' }}>
          <span
            className="w3-pulse-dot"
            style={{ background: anyResourceDown || anySubscriptionNeedsAttention ? 'var(--w3-danger)' : 'var(--w3-cyan)' }}
          />
          <div>
            <div style={{ fontWeight: 700, fontSize: '1.15em' }}>
              {anyResourceDown || anySubscriptionNeedsAttention ? 'Action needed' : 'All systems operational'}
            </div>
            <div style={{ fontSize: '0.85em', color: 'var(--w3-text-soft)' }}>
              {anySubscriptionNeedsAttention
                ? 'Your subscription needs attention — see billing below.'
                : 'Everything is running normally.'}
            </div>
          </div>
          {anySubscriptionNeedsAttention && (
            <a
              href={`/renew/${encodeURIComponent(data.customer.customerCode)}`}
              className="w3-btn"
              style={{ marginLeft: 'auto', textDecoration: 'none' }}
            >
              Renew now
            </a>
          )}
        </div>

        {/* Resources */}
        <div className="w3-label" style={{ marginBottom: '0.8em' }}>YOUR RESOURCES</div>
        {allResources.length === 0 ? (
          <div className="w3-panel" style={{ marginBottom: '1.4em', color: 'var(--w3-text-soft)', fontSize: '0.9em' }}>
            No infrastructure has been mapped to your account yet — our team is setting this up.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1em', marginBottom: '1.4em' }}>
            {allResources.map((r) => (
              <div key={r.id} className="w3-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.2em' }}>
                <UptimeRing uptime={r.uptime} />
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.3em' }}>
                    <span className="w3-pulse-dot" style={{ background: STATUS_COLOR[r.status] }} />
                    <span style={{ fontWeight: 600 }}>{r.status}</span>
                  </div>
                  <div className="w3-label" style={{ marginBottom: '0.4em' }}>{r.hostingMode.replace('_', ' ')}</div>
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

        {/* Billing */}
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

        {/* Domains + Invoices */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.4em' }}>
          <div>
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

          <div>
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
      </div>
    </main>
  );
}
