import { describe, it, expect } from 'vitest';
import { getSuspendedLandingInfo } from '@/lib/customers/public-suspended';
import { makeFakeBillingSetupDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, PlanRecord, DomainRecord } from '@/types/domain';

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000042',
    name: 'Bellinzone Acredit',
    email: 'owner@bellinzoneacredit.example.com',
    notificationEmail: null,
    phone: null,
    dateOfBirth: null,
    serviceStartDate: null,
    serviceEndDate: null,
    websiteType: null,
    passwordHash: null,
    status: 'SUSPENDED',
    automaticSuspension: true,
    paymentProvider: 'PAYSTACK',
    ...overrides,
  };
}

function plan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: 'plan_1',
    name: 'Standard Hosting',
    amount: 1_500_000,
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
    status: 'SUSPENDED',
    suspensionEnabled: true,
    suspendedAt: '2026-09-01T00:00:00.000Z',
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    nextBillingDate: '2026-09-01T00:00:00.000Z',
    gracePeriodEnd: null,
    dryRunOverride: null,
    ...overrides,
  };
}

function domain(overrides: Partial<DomainRecord> = {}): DomainRecord {
  return {
    id: 'dom_1',
    customerId: 'cust_1',
    domainName: 'bellinzoneacredit.com',
    isPrimary: true,
    subscriptionId: null,
    railwayStatus: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('getSuspendedLandingInfo', () => {
  it('returns found: false when there is no Host header at all', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [], plans: [], subscriptions: [], railwayResources: [], domains: [] });

    const result = await getSuspendedLandingInfo(deps, null);

    expect(result.found).toBe(false);
  });

  it('returns found: false for a domain not registered to any customer', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [], plans: [], subscriptions: [], railwayResources: [], domains: [] });

    const result = await getSuspendedLandingInfo(deps, 'unmapped-domain.example.com');

    expect(result.found).toBe(false);
  });

  it('resolves the customer by Host header and reports needsPayment for a suspended subscription', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      domains: [domain()],
    });

    const result = await getSuspendedLandingInfo(deps, 'bellinzoneacredit.com');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(true);
    expect(result.customerCode).toBe('WOH-000042');
    expect(result.customerName).toBe('Bellinzone Acredit');
    expect(result.amount).toBe(1_500_000);
  });

  it('is case-insensitive and strips a port from the Host header', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      domains: [domain()],
    });

    const result = await getSuspendedLandingInfo(deps, 'BellinzoneAcredit.com:443');

    expect(result.found).toBe(true);
    expect(result.customerCode).toBe('WOH-000042');
  });

  it('strips a leading "www." from the Host header before matching', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      domains: [domain()],
    });

    const result = await getSuspendedLandingInfo(deps, 'www.bellinzoneacredit.com');

    expect(result.found).toBe(true);
    expect(result.customerCode).toBe('WOH-000042');
  });

  it('reports needsPayment: false once the subscription is ACTIVE again', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer({ status: 'ACTIVE' })],
      plans: [plan()],
      subscriptions: [subscription({ status: 'ACTIVE' })],
      railwayResources: [],
      domains: [domain()],
    });

    const result = await getSuspendedLandingInfo(deps, 'bellinzoneacredit.com');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(false);
  });

  it('uses the domain\'s own linked subscription when the customer has several', async () => {
    // cust_1 has two domains, each governed by its own subscription —
    // one paid up, one overdue. Each domain's page must reflect only
    // its own subscription, never the other one.
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer({ status: 'ACTIVE' })],
      plans: [plan()],
      subscriptions: [
        subscription({ id: 'sub_active', status: 'ACTIVE' }),
        subscription({ id: 'sub_overdue', status: 'SUSPENDED' }),
      ],
      railwayResources: [],
      domains: [
        domain({ id: 'dom_active', domainName: 'active-site.com', subscriptionId: 'sub_active' }),
        domain({ id: 'dom_overdue', domainName: 'overdue-site.com', subscriptionId: 'sub_overdue' }),
      ],
    });

    const activeResult = await getSuspendedLandingInfo(deps, 'active-site.com');
    const overdueResult = await getSuspendedLandingInfo(deps, 'overdue-site.com');

    expect(activeResult.needsPayment).toBe(false);
    expect(activeResult.subscriptionId).toBe('sub_active');
    expect(overdueResult.needsPayment).toBe(true);
    expect(overdueResult.subscriptionId).toBe('sub_overdue');
  });

  it('falls back to the customer-wide heuristic when a domain has no linked subscription', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      domains: [domain({ subscriptionId: null })],
    });

    const result = await getSuspendedLandingInfo(deps, 'bellinzoneacredit.com');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(true);
    expect(result.subscriptionId).toBe('sub_1');
  });
});
