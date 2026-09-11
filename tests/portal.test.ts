import { describe, it, expect } from 'vitest';
import { getCustomerDashboardData } from '@/lib/customers/portal';
import { makeFakeCustomerPortalDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, PlanRecord, RailwayResourceRecord } from '@/types/domain';

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000042',
    name: 'Chihap Grilled Fish Bar',
    email: 'owner@chihap.example.com',
    notificationEmail: null,
    phone: null,
    dateOfBirth: null,
    serviceStartDate: null,
    serviceEndDate: null,
    websiteType: null,
    passwordHash: 'x',
    status: 'ACTIVE',
    automaticSuspension: true,
    paymentProvider: 'PAYSTACK',
    ...overrides,
  };
}

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: 'plan_1',
    name: 'Standard Hosting',
    amount: 2_500_000,
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    gracePeriodDays: 2,
    ...overrides,
  };
}

function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub_1',
    customerId: 'cust_1',
    planId: 'plan_1',
    status: 'ACTIVE',
    suspensionEnabled: true,
    suspendedAt: null,
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    nextBillingDate: '2026-09-01T00:00:00.000Z',
    gracePeriodEnd: null,
    dryRunOverride: null,
    ...overrides,
  };
}

function resource(overrides: Partial<RailwayResourceRecord> = {}): RailwayResourceRecord {
  return {
    id: 'res_1',
    subscriptionId: 'sub_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    serviceId: 'svc_1',
    deploymentId: null,
    hostingMode: 'DEDICATED',
    suspensionStrategy: 'STOP_DEPLOYMENT',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('getCustomerDashboardData', () => {
  it('returns null for an unknown customer', async () => {
    const deps = makeFakeCustomerPortalDeps({ customers: [], subscriptions: [], plans: [], railwayResources: [] });

    const result = await getCustomerDashboardData(deps, 'nope');

    expect(result).toBeNull();
  });

  it('assembles subscription, plan, resource, and uptime data together', async () => {
    const deps = makeFakeCustomerPortalDeps({
      customers: [customer()],
      subscriptions: [subscription()],
      plans: [plan()],
      railwayResources: [resource()],
    });
    await deps.statusSnapshots.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await deps.statusSnapshots.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });

    const result = await getCustomerDashboardData(deps, 'cust_1');

    expect(result).not.toBeNull();
    expect(result!.customer.customerCode).toBe('WOH-000042');
    expect(result!.subscriptions).toHaveLength(1);
    expect(result!.subscriptions[0].planName).toBe('Standard Hosting');
    expect(result!.subscriptions[0].resources).toHaveLength(1);
    expect(result!.subscriptions[0].resources[0].status).toBe('ACTIVE');
    expect(result!.subscriptions[0].resources[0].uptime.uptimePercent).toBe(100);
  });

  it("never leaks the customer's passwordHash", async () => {
    const deps = makeFakeCustomerPortalDeps({
      customers: [customer()],
      subscriptions: [],
      plans: [],
      railwayResources: [],
    });

    const result = await getCustomerDashboardData(deps, 'cust_1');

    expect(JSON.stringify(result)).not.toContain('passwordHash');
  });

  it('handles a customer with a subscription but no Railway resource mapped yet', async () => {
    const deps = makeFakeCustomerPortalDeps({
      customers: [customer()],
      subscriptions: [subscription()],
      plans: [plan()],
      railwayResources: [],
    });

    const result = await getCustomerDashboardData(deps, 'cust_1');

    expect(result!.subscriptions[0].resources).toHaveLength(0);
  });

  it('handles a customer with zero subscriptions, invoices, and domains without throwing', async () => {
    const deps = makeFakeCustomerPortalDeps({
      customers: [customer()],
      subscriptions: [],
      plans: [],
      railwayResources: [],
    });

    const result = await getCustomerDashboardData(deps, 'cust_1');

    expect(result!.subscriptions).toHaveLength(0);
    expect(result!.invoices).toHaveLength(0);
    expect(result!.domains).toHaveLength(0);
  });
});
