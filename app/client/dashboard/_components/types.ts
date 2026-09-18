// Shared types for the customer dashboard. Mirrors the shape returned by
// GET /api/customer/dashboard (src/lib/customers/portal.ts) — kept as a
// plain, hand-maintained mirror rather than importing the server module
// directly, since this file is bundled into client code and the server
// module pulls in Prisma-adjacent dependencies that don't belong in a
// browser bundle.

export interface UptimeStats {
  uptimePercent: number | null;
  totalChecks: number;
  conclusiveChecks: number;
  activeChecks: number;
  inconclusiveChecks: number;
  windowStart: string | null;
  windowEnd: string;
  requestedWindowDays: number;
}

export interface UptimeSeriesPoint {
  label: string;
  upPercent: number | null;
  conclusiveChecks: number;
}

export type ResourceStatus = 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';

export interface ActivityEvent {
  resourceLabel: string;
  status: ResourceStatus;
  checkedAt: string;
  changed: boolean;
}

export interface PortalResource {
  id: string;
  status: ResourceStatus;
  hostingMode: string;
  label: string;
  uptime: UptimeStats;
}

export interface PortalSubscription {
  id: string;
  status: string;
  planName: string | null;
  amount: number | null;
  currency: string | null;
  currentPeriodEnd: string;
  nextBillingDate: string;
  resources: PortalResource[];
}

export interface PortalInvoice {
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

export interface PortalDomain {
  id: string;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
}

export type UptimeWindow = 'd1' | 'd7' | 'd30';

export interface DashboardData {
  customer: { id: string; customerCode: string; name: string; email: string; status: string };
  subscriptions: PortalSubscription[];
  invoices: PortalInvoice[];
  domains: PortalDomain[];
  uptimeSummary: Record<UptimeWindow, UptimeStats>;
  activity: { series: UptimeSeriesPoint[]; events: ActivityEvent[] };
}

export const NEEDS_ATTENTION_STATUSES = ['PAYMENT_DUE', 'GRACE_PERIOD', 'SUSPENDED'];

export function formatAmount(minorUnits: number, currency: string): string {
  return `${currency} ${(minorUnits / 100).toLocaleString()}`;
}

export function formatDuration(ms: number): string {
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

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}
