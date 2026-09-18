'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  Boxes,
  Wallet,
  Globe,
  FileText,
  Bell,
  ChevronDown,
  LogOut,
  Server,
  ShieldCheck,
  Activity,
  Menu,
  X,
} from 'lucide-react';
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

interface UptimeSeriesPoint {
  label: string;
  upPercent: number | null;
  conclusiveChecks: number;
}

interface ActivityEvent {
  resourceLabel: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  checkedAt: string;
  changed: boolean;
}

interface PortalResource {
  id: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  hostingMode: string;
  label: string;
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
  uptimeSummary: { d1: UptimeStats; d7: UptimeStats; d30: UptimeStats };
  activity: { series: UptimeSeriesPoint[]; events: ActivityEvent[] };
}

const STATUS_COLOR: Record<string, string> = {
  ACTIVE: 'var(--w3-cyan)',
  STOPPED: 'var(--w3-danger)',
  UNKNOWN: 'var(--w3-amber)',
  ERROR: 'var(--w3-danger)',
};

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: 'Healthy',
  STOPPED: 'Down',
  UNKNOWN: 'Unknown',
  ERROR: 'Error',
};

const NEEDS_ATTENTION_STATUSES = ['PAYMENT_DUE', 'GRACE_PERIOD', 'SUSPENDED'];

const NAV_ITEMS = [
  { id: 'overview', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'subscriptions', label: 'Subscriptions', icon: Boxes },
  { id: 'billing', label: 'Billing', icon: Wallet },
  { id: 'domains', label: 'Domains', icon: Globe },
  { id: 'invoices', label: 'Invoices', icon: FileText },
];

function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

function formatDuration(ms: number): string {
  if (ms <= 0) return '0m';
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(`${days}d`);
  if (days > 0 || hours > 0) parts.push(`${hours}h`);
  parts.push(`${minutes}m`);
  return parts.join(' ');
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

function activityEventLabel(event: ActivityEvent): string {
  if (event.changed) {
    if (event.status === 'ACTIVE') return `${event.resourceLabel} came back online`;
    if (event.status === 'STOPPED') return `${event.resourceLabel} went offline`;
    if (event.status === 'ERROR') return `${event.resourceLabel} reported an error`;
    return `${event.resourceLabel} status became unknown`;
  }
  return `${event.resourceLabel} — last check: ${STATUS_LABEL[event.status].toLowerCase()}`;
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

function BigUptimeDonut({ uptime }: { uptime: UptimeStats }) {
  const size = 168;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const percent = uptime.uptimePercent ?? 0;
  const offset = circumference - (percent / 100) * circumference;

  const elapsedMs = uptime.windowStart ? new Date(uptime.windowEnd).getTime() - new Date(uptime.windowStart).getTime() : 0;
  const uptimeMs = uptime.uptimePercent !== null ? elapsedMs * (uptime.uptimePercent / 100) : 0;
  const downtimeMs = uptime.uptimePercent !== null ? elapsedMs - uptimeMs : 0;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '1.6em', flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
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
            <>
              <span style={{ fontSize: '1.7em', fontWeight: 700 }}>{uptime.uptimePercent.toFixed(2)}%</span>
              <span className="w3-label" style={{ marginTop: '0.2em' }}>Uptime</span>
            </>
          ) : (
            <span style={{ fontSize: '0.8em', color: 'var(--w3-text-soft)', textAlign: 'center', padding: '0 0.6em' }}>
              Not enough data yet
            </span>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.9em' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <span className="w3-pulse-dot" style={{ background: 'var(--w3-cyan)' }} />
          <div>
            <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>Uptime</div>
            <div style={{ fontWeight: 700 }}>
              {uptime.uptimePercent !== null ? `${uptime.uptimePercent.toFixed(2)}%` : '—'}
              {uptime.windowStart && <span style={{ fontWeight: 400, color: 'var(--w3-text-soft)' }}> ({formatDuration(uptimeMs)})</span>}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em' }}>
          <span className="w3-pulse-dot" style={{ background: 'var(--w3-danger)' }} />
          <div>
            <div style={{ fontSize: '0.78em', color: 'var(--w3-text-soft)' }}>Downtime</div>
            <div style={{ fontWeight: 700 }}>
              {uptime.uptimePercent !== null ? `${(100 - uptime.uptimePercent).toFixed(2)}%` : '—'}
              {uptime.windowStart && <span style={{ fontWeight: 400, color: 'var(--w3-text-soft)' }}> ({formatDuration(downtimeMs)})</span>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ActivityChart({ series }: { series: UptimeSeriesPoint[] }) {
  const defined = series.map((p, i) => ({ ...p, i })).filter((p) => p.upPercent !== null);

  if (defined.length === 0) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 160, color: 'var(--w3-text-soft)', fontSize: '0.85em' }}>
        No activity data yet — checks will appear here once monitoring picks up.
      </div>
    );
  }

  const W = 300;
  const H = 100;
  const lastIndex = series.length - 1;
  const x = (i: number) => (lastIndex === 0 ? 0 : (i / lastIndex) * W);
  const y = (p: number) => H - (p / 100) * H;

  const linePath = defined.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${x(p.i)},${y(p.upPercent as number)}`).join(' ');
  const areaPath = `${linePath} L ${x(defined[defined.length - 1].i)},${H} L ${x(defined[0].i)},${H} Z`;

  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: 140, display: 'block' }}>
        <defs>
          <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--w3-cyan)" stopOpacity="0.35" />
            <stop offset="100%" stopColor="var(--w3-cyan)" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#activityFill)" />
        <path d={linePath} fill="none" stroke="var(--w3-cyan)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      </svg>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.4em' }}>
        {series.map((p, idx) => (
          <span key={idx} style={{ fontSize: '0.72em', color: 'var(--w3-text-soft)' }}>{p.label}</span>
        ))}
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
  const [uptimeWindow, setUptimeWindow] = useState<'d1' | 'd7' | 'd30'>('d1');
  const [activeSection, setActiveSection] = useState('overview');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

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

  function goToSection(id: string) {
    setActiveSection(id);
    setSidebarOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
  const systemsOk = !anyResourceDown && !anySubscriptionNeedsAttention;
  const firstName = data.customer.name.trim().split(/\s+/)[0] ?? data.customer.name;

  return (
    <main className="w3-shell">
      <div className={`w3-sidebar-backdrop${sidebarOpen ? ' open' : ''}`} onClick={() => setSidebarOpen(false)} />

      {/* Top bar */}
      <div
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 30,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.9em 1.4em',
          borderBottom: '1px solid rgba(255,255,255,0.08)',
          background: 'rgba(4, 10, 8, 0.85)',
          backdropFilter: 'blur(10px)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
          <button className="w3-sidebar-toggle" onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle navigation">
            {sidebarOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
          <img src="/dwo-logo.jpg" alt="Digital WebOracle" style={{ height: 30, width: 'auto', borderRadius: 6 }} />
          <div>
            <div style={{ fontWeight: 700, lineHeight: 1.1 }}>{data.customer.name}</div>
            <div className="w3-mono" style={{ fontSize: '0.72em', color: 'var(--w3-text-soft)' }}>{data.customer.customerCode}</div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.8em' }}>
          <span
            className="w3-badge"
            style={{
              color: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)',
              borderColor: systemsOk ? 'rgba(42, 245, 152, 0.3)' : 'rgba(255, 77, 109, 0.35)',
            }}
          >
            <span className="w3-pulse-dot" style={{ background: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)' }} />
            {systemsOk ? 'System Online' : 'Action needed'}
          </span>

          <button
            className="w3-btn"
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '0.55em', borderRadius: 10 }}
            aria-label="Notifications"
          >
            <Bell size={17} />
          </button>

          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setAccountMenuOpen((v) => !v)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.6em',
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                color: 'var(--w3-text)',
                padding: '0.2em 0.3em',
              }}
            >
              <span
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--w3-cyan), var(--w3-violet))',
                  color: '#04150d',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '0.82em',
                  flexShrink: 0,
                }}
              >
                {initials(data.customer.name)}
              </span>
              <span style={{ fontSize: '0.88em' }} className="w3-welcome-text">
                Welcome back, <strong>{firstName}</strong>
              </span>
              <ChevronDown size={15} style={{ color: 'var(--w3-text-soft)' }} />
            </button>

            {accountMenuOpen && (
              <div
                style={{
                  position: 'absolute',
                  right: 0,
                  top: '120%',
                  background: '#0a1712',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: 10,
                  padding: '0.4em',
                  minWidth: 160,
                  boxShadow: '0 12px 30px rgba(0,0,0,0.4)',
                  zIndex: 40,
                }}
              >
                <button
                  onClick={handleLogout}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.6em',
                    width: '100%',
                    padding: '0.6em 0.7em',
                    background: 'transparent',
                    border: 'none',
                    color: 'var(--w3-text)',
                    cursor: 'pointer',
                    borderRadius: 6,
                    fontSize: '0.88em',
                  }}
                >
                  <LogOut size={15} /> Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        {/* Sidebar */}
        <nav
          className={`w3-sidebar${sidebarOpen ? ' open' : ''}`}
          style={{
            width: 220,
            flexShrink: 0,
            borderRight: '1px solid rgba(255,255,255,0.08)',
            background: 'rgba(4, 10, 8, 0.6)',
            padding: '1.2em 0.9em',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'space-between',
            minHeight: 'calc(100vh - 60px)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3em' }}>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  key={item.id}
                  href={`#${item.id}`}
                  className={`w3-sidebar-link${activeSection === item.id ? ' active' : ''}`}
                  onClick={(e) => {
                    e.preventDefault();
                    goToSection(item.id);
                  }}
                >
                  <Icon size={17} />
                  {item.label}
                </a>
              );
            })}
          </div>

          <div style={{ padding: '0.8em', display: 'flex', alignItems: 'center', gap: '0.7em', color: 'var(--w3-text-soft)' }}>
            <ShieldCheck size={20} style={{ flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: '0.8em', fontWeight: 600, color: 'var(--w3-text)' }}>DWO Hosting</div>
              <div style={{ fontSize: '0.72em' }}>Secure · Managed · Yours</div>
            </div>
          </div>
        </nav>

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0, padding: '1.6em 1.4em 3em' }}>
          <div id="overview" style={{ scrollMarginTop: 80 }}>
            {/* Hero */}
            <div
              className="w3-panel"
              style={{
                marginBottom: '1.4em',
                background: 'linear-gradient(135deg, rgba(42, 245, 152, 0.12), rgba(15, 158, 99, 0.08))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1.4em',
                flexWrap: 'wrap',
              }}
            >
              <div>
                <div style={{ fontSize: '1.5em', fontWeight: 700, marginBottom: '0.2em' }}>
                  Welcome to <span style={{ color: 'var(--w3-cyan)' }}>{data.customer.name}</span>
                </div>
                <div style={{ color: 'var(--w3-text-soft)', marginBottom: '1em' }}>Your hosting, simplified.</div>
                <div
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.8em',
                    padding: '0.7em 1.1em',
                    borderRadius: 12,
                    background: 'rgba(0,0,0,0.18)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <span className="w3-pulse-dot" style={{ background: systemsOk ? 'var(--w3-cyan)' : 'var(--w3-danger)' }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.95em' }}>
                      {systemsOk ? 'All systems operational' : 'Action needed'}
                    </div>
                    <div style={{ fontSize: '0.8em', color: 'var(--w3-text-soft)' }}>
                      {anySubscriptionNeedsAttention ? 'Your subscription needs attention — see billing below.' : 'Everything is running normally.'}
                    </div>
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6em', alignItems: 'flex-end' }}>
                <Server size={54} style={{ color: 'var(--w3-cyan)', opacity: 0.55 }} />
                <button
                  onClick={() => goToSection('subscriptions')}
                  className="w3-btn"
                  style={{ textDecoration: 'none' }}
                >
                  View Details
                </button>
              </div>
            </div>

            {/* Uptime + Server Health */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.2em', marginBottom: '1.2em' }}>
              <div className="w3-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.2em', flexWrap: 'wrap', gap: '0.6em' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
                    <Activity size={17} style={{ color: 'var(--w3-cyan)' }} />
                    <span style={{ fontWeight: 700 }}>System Uptime</span>
                  </div>
                  <div style={{ display: 'flex', gap: '0.3em', background: 'rgba(255,255,255,0.04)', borderRadius: 999, padding: '0.25em' }}>
                    {(['d1', 'd7', 'd30'] as const).map((w) => (
                      <button
                        key={w}
                        onClick={() => setUptimeWindow(w)}
                        style={{
                          border: 'none',
                          cursor: 'pointer',
                          borderRadius: 999,
                          padding: '0.4em 0.85em',
                          fontSize: '0.78em',
                          fontWeight: 600,
                          background: uptimeWindow === w ? 'rgba(42, 245, 152, 0.18)' : 'transparent',
                          color: uptimeWindow === w ? 'var(--w3-cyan)' : 'var(--w3-text-soft)',
                        }}
                      >
                        {w === 'd1' ? '24h' : w === 'd7' ? '7d' : '30d'}
                      </button>
                    ))}
                  </div>
                </div>
                {allResources.length === 0 ? (
                  <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>No infrastructure to monitor yet.</p>
                ) : (
                  <BigUptimeDonut uptime={data.uptimeSummary[uptimeWindow]} />
                )}
              </div>

              <div className="w3-panel">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1em' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
                    <ShieldCheck size={17} style={{ color: 'var(--w3-cyan)' }} />
                    <span style={{ fontWeight: 700 }}>Server Health</span>
                  </div>
                  {allResources.length > 0 && (
                    <span
                      className="w3-badge"
                      style={{
                        color: anyResourceDown ? 'var(--w3-danger)' : 'var(--w3-cyan)',
                        borderColor: anyResourceDown ? 'rgba(255, 77, 109, 0.35)' : 'rgba(42, 245, 152, 0.3)',
                      }}
                    >
                      {anyResourceDown ? 'Needs attention' : 'All Healthy'}
                    </span>
                  )}
                </div>
                {allResources.length === 0 ? (
                  <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.9em', margin: 0 }}>
                    No infrastructure has been mapped to your account yet — our team is setting this up.
                  </p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {allResources.map((r) => (
                      <div
                        key={r.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.65em 0.2em',
                          borderBottom: '1px solid rgba(255,255,255,0.06)',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', minWidth: 0 }}>
                          <Server size={16} style={{ color: 'var(--w3-text-soft)', flexShrink: 0 }} />
                          <span style={{ fontSize: '0.9em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                        </div>
                        <span
                          className="w3-badge"
                          style={{
                            color: STATUS_COLOR[r.status],
                            borderColor: STATUS_COLOR[r.status],
                            flexShrink: 0,
                          }}
                        >
                          {STATUS_LABEL[r.status]}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* System Activity */}
            <div className="w3-panel" style={{ marginBottom: '1.4em' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em', marginBottom: '1.2em' }}>
                <Activity size={17} style={{ color: 'var(--w3-cyan)' }} />
                <span style={{ fontWeight: 700 }}>System Activity</span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'minmax(220px, 1fr) minmax(260px, 1.4fr)', gap: '1.6em' }}>
                <div>
                  {data.activity.events.length === 0 ? (
                    <p style={{ color: 'var(--w3-text-soft)', fontSize: '0.88em', margin: 0 }}>
                      No activity recorded yet — this fills in as your services get checked.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2em' }}>
                      {data.activity.events.map((event, idx) => {
                        const ok = event.status === 'ACTIVE';
                        return (
                          <div
                            key={idx}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              gap: '0.8em',
                              padding: '0.6em 0.1em',
                              borderBottom: '1px solid rgba(255,255,255,0.05)',
                              fontSize: '0.85em',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.7em', minWidth: 0 }}>
                              <span className="w3-pulse-dot" style={{ background: ok ? 'var(--w3-cyan)' : 'var(--w3-danger)', flexShrink: 0 }} />
                              <span className="w3-mono" style={{ fontSize: '0.85em', color: 'var(--w3-text-soft)', flexShrink: 0 }}>
                                {formatTime(event.checkedAt)}
                              </span>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activityEventLabel(event)}</span>
                            </div>
                            <span
                              className="w3-badge"
                              style={{
                                color: ok ? 'var(--w3-cyan)' : 'var(--w3-danger)',
                                borderColor: ok ? 'rgba(42, 245, 152, 0.3)' : 'rgba(255, 77, 109, 0.35)',
                                flexShrink: 0,
                              }}
                            >
                              {ok ? 'Success' : 'Attention'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
                <div>
                  <ActivityChart series={data.activity.series} />
                </div>
              </div>
            </div>
          </div>

          {/* Subscriptions */}
          <div id="subscriptions" style={{ scrollMarginTop: 80 }}>
            <div className="w3-label" style={{ marginBottom: '0.8em' }}>SUBSCRIPTIONS</div>
            {allResources.length === 0 ? (
              <div className="w3-panel" style={{ marginBottom: '1.4em', color: 'var(--w3-text-soft)', fontSize: '0.9em' }}>
                No infrastructure has been mapped to your account yet — our team is setting this up.
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1em', marginBottom: '1.4em' }}>
                {allResources.map((r) => (
                  <div key={r.id} className="w3-panel" style={{ display: 'flex', alignItems: 'center', gap: '1.2em' }}>
                    <UptimeRing uptime={r.uptime} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5em', marginBottom: '0.3em' }}>
                        <span className="w3-pulse-dot" style={{ background: STATUS_COLOR[r.status] }} />
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
          <div id="billing" style={{ scrollMarginTop: 80 }}>
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
            <div id="domains" style={{ scrollMarginTop: 80 }}>
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

            <div id="invoices" style={{ scrollMarginTop: 80 }}>
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
      </div>
    </main>
  );
}
