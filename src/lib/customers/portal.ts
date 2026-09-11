import { CustomerPortalDeps } from '../db/ports';
import { computeUptimeStats, UptimeStats } from '../monitoring/uptime';

export interface PortalResource {
  id: string;
  status: 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';
  hostingMode: string;
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
}

/**
 * getCustomerDashboardData — everything the customer portal needs, in
 * one call. Deliberately over-fetches a little (all subscriptions, all
 * invoices) rather than paginating — the expected data volume per
 * customer is small, so the simplicity is worth it.
 *
 * Returns null for an unknown customerId rather than throwing.
 */
export async function getCustomerDashboardData(
  deps: CustomerPortalDeps,
  customerId: string
): Promise<CustomerDashboardData | null> {
  const customer = await deps.customers.findById(customerId);
  if (!customer) return null;

  const subscriptions = await deps.subscriptions.findByCustomerId(customerId);
  const portalSubscriptions: PortalSubscription[] = await Promise.all(
    subscriptions.map(async (sub) => {
      const plan = await deps.plans.findById(sub.planId);
      const resources = await deps.railwayResources.findBySubscriptionId(sub.id);
      const portalResources: PortalResource[] = await Promise.all(
        resources.map(async (r) => ({
          id: r.id,
          status: r.status,
          hostingMode: r.hostingMode,
          uptime: await computeUptimeStats(deps, r.id),
        }))
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
  const domains = await deps.domains.findByCustomerId(customerId);

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
  };
}
