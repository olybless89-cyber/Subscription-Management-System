import { PrismaClient } from '@prisma/client';

// Powers the super-admin "Services" panel — spec extension for this
// rebrand: a single view of every Railway resource mapped across every
// customer, auto-populated from whatever syncRailwayResources() has
// already recorded (see src/lib/cron/railway-sync.ts). Read-only, and
// scoped exactly like every other admin listing: SUPER_ADMIN sees
// everything, a plain ADMIN sees only resources belonging to customers
// assigned to them.
//
// This intentionally queries Prisma directly rather than going through
// RailwayResourceRepository — the existing port only exposes flat
// resource rows (see findAll() in prisma-repository.ts), and this view
// needs the customer/subscription join, which no other caller needs
// today. Kept as a separate, additive module rather than widening the
// shared port.
export interface ServiceOverviewItem {
  id: string;
  projectId: string;
  serviceId: string;
  environmentId: string;
  hostingMode: string;
  status: string;
  lastSyncedAt: string | null;
  lastError: string | null;
  customer: { id: string; name: string; customerCode: string };
  subscriptionStatus: string;
}

export async function listServicesOverview(
  prisma: PrismaClient,
  visibleCustomerIds: string[] | 'ALL'
): Promise<ServiceOverviewItem[]> {
  const rows = await prisma.railwayResource.findMany({
    where:
      visibleCustomerIds === 'ALL'
        ? undefined
        : { subscription: { customerId: { in: visibleCustomerIds } } },
    include: { subscription: { include: { customer: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return rows.map((r) => ({
    id: r.id,
    projectId: r.projectId,
    serviceId: r.serviceId,
    environmentId: r.environmentId,
    hostingMode: r.hostingMode,
    status: r.status,
    lastSyncedAt: r.lastSyncedAt ? r.lastSyncedAt.toISOString() : null,
    lastError: r.lastError,
    customer: {
      id: r.subscription.customer.id,
      name: r.subscription.customer.name,
      customerCode: r.subscription.customer.customerCode,
    },
    subscriptionStatus: r.subscription.status,
  }));
}
