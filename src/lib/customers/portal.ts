import { CustomerPortalDeps } from '../db/ports';
import { statsFromSnapshots, buildUptimeSeries, buildRecentActivityEvents, UptimeStats, UptimeSeriesPoint, ActivityEvent } from '../monitoring/uptime';
import { StatusSnapshotRecord } from '@/types/domain';

export interface PortalResource {
  id: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  hostingMode: string;
  /** The resource's primary domain when it has one, otherwise a
   * plan-based fallback — the same label used to build the account's
   * activity feed, exposed here too so a UI can show something more
   * meaningful than a raw hostingMode value. */
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

export interface CustomerDashboardData {
  customer: { id: string; customerCode: string; name: string; email: string; status: string };
  subscriptions: PortalSubscription[];
  invoices: PortalInvoice[];
  domains: PortalDomain[];
  /** Account-wide uptime, combined across every resource, for three
   * fixed windows at once — the client just switches which one it
   * shows (the "24h / 7d / 30d" tabs), no refetch needed. */
  uptimeSummary: { d1: UptimeStats; d7: UptimeStats; d30: UptimeStats };
  /** A real, derived "System Activity" feed: a trailing-24h uptime
   * chart plus the most recent genuine status events, built from the
   * same status-check history everything else here uses — nothing
   * here is fabricated for display purposes. */
  activity: { series: UptimeSeriesPoint[]; events: ActivityEvent[] };
}

/**
 * getCustomerDashboardData — everything the customer portal needs, in
 * one call. Deliberately over-fetches a little (all subscriptions, all
 * invoices) rather than paginating — the expected data volume per
 * customer is small, so the simplicity is worth it.
 *
 * Fetches each resource's last 30 days of status-check snapshots once
 * and derives every uptime figure (the per-resource `uptime` field, the
 * account-wide `uptimeSummary` across three windows, and the
 * `activity` feed/chart) from that same batch — one DB round-trip per
 * resource rather than one per figure.
 *
 * Returns null for an unknown customerId rather than throwing.
 */
export async function getCustomerDashboardData(
  deps: CustomerPortalDeps,
  customerId: string,
  opts: { now?: Date } = {}
): Promise<CustomerDashboardData | null> {
  const now = opts.now ?? new Date();
  const sinceIso30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const customer = await deps.customers.findById(customerId);
  if (!customer) return null;

  const domains = await deps.domains.findByCustomerId(customerId);

  const subscriptions = await deps.subscriptions.findByCustomerId(customerId);
  const resourceGroups: Array<{ label: string; snapshots: StatusSnapshotRecord[] }> = [];

  const portalSubscriptions: PortalSubscription[] = await Promise.all(
    subscriptions.map(async (sub) => {
      const plan = await deps.plans.findById(sub.planId);
      const resources = await deps.railwayResources.findBySubscriptionId(sub.id);

      const subDomains = domains.filter((d) => d.subscriptionId === sub.id);
      const primaryDomain = subDomains.find((d) => d.isPrimary) ?? subDomains[0] ?? null;

      const portalResources: PortalResource[] = await Promise.all(
        resources.map(async (r) => {
          const snapshots = await deps.statusSnapshots.findByResourceId(r.id, sinceIso30);
          const label = primaryDomain?.domainName ?? `${plan?.name ?? 'Hosting'} — ${r.hostingMode.replace('_', ' ').toLowerCase()}`;
          resourceGroups.push({ label, snapshots });
          return {
            id: r.id,
            status: r.status,
            hostingMode: r.hostingMode,
            label,
            uptime: statsFromSnapshots(snapshots, 30, now),
          };
        })
      );

      return {
        id: sub.id,
        status: sub.status,
        planName: plan?.name ?? null,
        amount: plan?.amount ?? null,
        currency: plan?.currency ?? null,
        currentPeriodEnd: sub.currentPeriodEnd,
        nextBillingDate: sub.nextBillingDate,
        resources: portalResources,
      };
    })
  );

  const invoices = await deps.invoices.findByCustomerId(customerId);

  const allSnapshots = resourceGroups.flatMap((g) => g.snapshots);
  const uptimeSummary = {
    d1: statsFromSnapshots(allSnapshots, 1, now),
    d7: statsFromSnapshots(allSnapshots, 7, now),
    d30: statsFromSnapshots(allSnapshots, 30, now),
  };
  const activity = {
    series: buildUptimeSeries(allSnapshots, now),
    events: buildRecentActivityEvents(resourceGroups, { limit: 6 }),
  };

  return {
    customer: {
      id: customer.id,
      customerCode: customer.customerCode,
      name: customer.name,
      email: customer.email,
      status: customer.status,
    },
    subscriptions: portalSubscriptions,
    invoices: invoices.map((i) => ({
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      type: i.type,
      status: i.status,
      amount: i.amount,
      currency: i.currency,
      dueDate: i.dueDate,
      paidAt: i.paidAt,
      issuedAt: i.issuedAt,
    })),
    domains: domains.map((d) => ({
      id: d.id,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
    })),
    uptimeSummary,
    activity,
  };
}
