import { describe, it, expect } from 'vitest';
import { getRenewalInfo } from '@/lib/customers/public-renewal';
import { makeFakeWebhookDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, PlanRecord } from '@/types/domain';

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

describe('getRenewalInfo', () => {
  it('returns found: false for an unknown customer code', async () => {
    const deps = makeFakeWebhookDeps({ customers: [], subscriptions: [], railwayResources: [], plans: [], payments: [] });

    const result = await getRenewalInfo(deps, 'WOH-999999');

    expect(result.found).toBe(false);
  });

  it('returns plan/amount details and needsPayment: true for a SUSPENDED subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const result = await getRenewalInfo(deps, 'WOH-000042');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(true);
    expect(result.customerName).toBe('Chihap Grilled Fish Bar');
    expect(result.planName).toBe('Standard Hosting');
    expect(result.amount).toBe(2_500_000);
    expect(result.currency).toBe('NGN');
    expect(result.subscriptionId).toBe('sub_1');
  });

  it('returns needsPayment: false for an ACTIVE subscription (already renewed)', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer({ status: 'ACTIVE' })],
      subscriptions: [subscription({ status: 'ACTIVE' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const result = await getRenewalInfo(deps, 'WOH-000042');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(false);
  });

  it('prefers a subscription that needs payment over an ACTIVE one when the customer has both', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [
        subscription({ id: 'sub_active', status: 'ACTIVE' }),
        subscription({ id: 'sub_due', status: 'PAYMENT_DUE' }),
      ],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const result = await getRenewalInfo(deps, 'WOH-000042');

    expect(result.subscriptionId).toBe('sub_due');
    expect(result.needsPayment).toBe(true);
  });

  it('handles a customer with no subscriptions at all without throwing', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [],
      railwayResources: [],
      plans: [],
      payments: [],
    });

    const result = await getRenewalInfo(deps, 'WOH-000042');

    expect(result.found).toBe(true);
    expect(result.needsPayment).toBe(false);
    expect(result.subscriptionId).toBeUndefined();
  });
});
