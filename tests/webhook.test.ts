import { describe, it, expect, vi } from 'vitest';
import { handlePaymentWebhook } from '@/lib/payments/webhook-handler';
import { RailwayClient } from '@/lib/railway/client';
import { PaymentProvider, VerifiedTransaction } from '@/lib/payments/provider';
import { makeFakeWebhookDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, RailwayResourceRecord, PlanRecord, PaymentRecord } from '@/types/domain';

function baseCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    email: 'customer@example.com',
    passwordHash: null,
    paymentProvider: 'PAYSTACK',
    status: 'SUSPENDED',
    automaticSuspension: true,
    ...overrides,
  };
}

function baseSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub_1',
    customerId: 'cust_1',
    planId: 'plan_1',
    status: 'SUSPENDED',
    suspensionEnabled: true,
    suspendedAt: '2026-09-03T00:00:00.000Z',
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    nextBillingDate: '2026-09-01T00:00:00.000Z',
    gracePeriodEnd: '2026-09-03T00:00:00.000Z',
    ...overrides,
  };
}

function basePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
  return {
    id: 'plan_1',
    name: 'Standard Hosting',
    amount: 2_500_000, // ₦25,000 in kobo
    currency: 'NGN',
    billingCycle: 'MONTHLY',
    gracePeriodDays: 2,
    ...overrides,
  };
}

function basePayment(overrides: Partial<PaymentRecord> = {}): PaymentRecord {
  return {
    id: 'pay_1',
    subscriptionId: 'sub_1',
    reference: 'WOH-REF-001',
    provider: 'paystack',
    amount: 2_500_000,
    currency: 'NGN',
    status: 'PENDING',
    ...overrides,
  };
}

function multiTenantResource(): RailwayResourceRecord {
  return {
    id: 'res_1',
    subscriptionId: 'sub_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    serviceId: 'svc_1',
    deploymentId: null,
    hostingMode: 'MULTI_TENANT',
    suspensionStrategy: 'APP_LEVEL',
    status: 'STOPPED',
  };
}

function fakeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: 'paystack',
    verifyWebhookSignature: vi.fn().mockReturnValue(true),
    verifyTransaction: vi.fn(async (): Promise<VerifiedTransaction> => ({
      reference: 'WOH-REF-001',
      amountMinor: 2_500_000,
      currency: 'NGN',
      status: 'success',
      raw: { ok: true },
    })),
    initializePayment: vi.fn(),
    ...overrides,
  };
}

const railway: RailwayClient = { request: vi.fn() };

function chargeSuccessBody(reference = 'WOH-REF-001') {
  return JSON.stringify({ event: 'charge.success', data: { reference } });
}

describe('handlePaymentWebhook — signature and parsing', () => {
  it('rejects an invalid signature without touching the DB', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider({ verifyWebhookSignature: vi.fn().mockReturnValue(false) });

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'bad-sig');

    expect(result.httpStatus).toBe(401);
    expect(result.outcome).toBe('INVALID_SIGNATURE');
    expect(provider.verifyTransaction).not.toHaveBeenCalled();
  });

  it('ignores non charge.success events but still acks 200', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider();

    const result = await handlePaymentWebhook(
      deps,
      provider,
      railway,
      JSON.stringify({ event: 'charge.failed', data: { reference: 'WOH-REF-001' } }),
      'sig'
    );

    expect(result.httpStatus).toBe(200);
    expect(result.outcome).toBe('IGNORED_EVENT');
  });

  it('acks unknown references with 200 rather than erroring', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.httpStatus).toBe(200);
    expect(result.outcome).toBe('UNKNOWN_REFERENCE');
  });
});

describe('handlePaymentWebhook — idempotency', () => {
  it('processing the same webhook twice only extends the subscription once', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider();

    const first = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });
    const second = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(first.outcome).toBe('PROCESSED');
    expect(second.outcome).toBe('ALREADY_PROCESSED');
    expect(provider.verifyTransaction).toHaveBeenCalledTimes(1);

    const subscription = await deps.subscriptions.findById('sub_1');
    expect(subscription!.currentPeriodEnd).toBe('2026-10-05T00:00:00.000Z');
  });
});

describe('handlePaymentWebhook — verification', () => {
  it('marks the payment FAILED and does not extend on amount mismatch', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment({ amount: 2_500_000 })],
    });
    const provider = fakeProvider({
      verifyTransaction: vi.fn(async (): Promise<VerifiedTransaction> => ({
        reference: 'WOH-REF-001',
        amountMinor: 1_000_000, // wrong amount — provider truth wins over payload
        currency: 'NGN',
        status: 'success',
        raw: {},
      })),
    });

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.outcome).toBe('VERIFICATION_MISMATCH');
    const subscription = await deps.subscriptions.findById('sub_1');
    expect(subscription!.status).toBe('SUSPENDED');
  });

  it('does not extend the subscription if the provider reports the charge failed', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider({
      verifyTransaction: vi.fn(async (): Promise<VerifiedTransaction> => ({
        reference: 'WOH-REF-001',
        amountMinor: 2_500_000,
        currency: 'NGN',
        status: 'failed',
        raw: {},
      })),
    });

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.outcome).toBe('PAYMENT_NOT_SUCCESSFUL');
    const subscription = await deps.subscriptions.findById('sub_1');
    expect(subscription!.status).toBe('SUSPENDED');
  });
});

describe('handlePaymentWebhook — restoration wiring', () => {
  it('restores a MULTI_TENANT suspended customer end-to-end on successful payment', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider();

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.outcome).toBe('PROCESSED');
    const subscription = await deps.subscriptions.findById('sub_1');
    const customer = await deps.customers.findById('cust_1');
    expect(subscription!.status).toBe('ACTIVE');
    expect(customer!.status).toBe('ACTIVE');
    expect(deps.notificationLog.map((n) => n.event)).toEqual(
      expect.arrayContaining(['PAYMENT_RECEIVED', 'RESTORED'])
    );
    expect(railway.request).not.toHaveBeenCalled(); // MULTI_TENANT never touches Railway
  });

  it('extends a non-suspended (PAYMENT_DUE) subscription without calling restoreCustomer', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer({ status: 'ACTIVE' })],
      subscriptions: [baseSubscription({ status: 'PAYMENT_DUE', suspendedAt: null })],
      railwayResources: [multiTenantResource()],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider();

    const result = await handlePaymentWebhook(deps, provider, railway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.outcome).toBe('PROCESSED');
    const subscription = await deps.subscriptions.findById('sub_1');
    expect(subscription!.status).toBe('ACTIVE');
    // No suspension/restoration event should be created for a plain renewal.
    expect(deps.events).toHaveLength(0);
  });

  it('reports PROCESSED-with-caveat if payment succeeds but Railway restoration fails', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [
        {
          id: 'res_1',
          subscriptionId: 'sub_1',
          projectId: 'proj_1',
          environmentId: 'env_1',
          serviceId: 'svc_1',
          deploymentId: 'dep_1',
          hostingMode: 'DEDICATED',
          suspensionStrategy: 'STOP_DEPLOYMENT',
          status: 'STOPPED',
        },
      ],
      plans: [basePlan()],
      payments: [basePayment()],
    });
    const provider = fakeProvider();
    const flakyRailway: RailwayClient = {
      request: vi.fn(async () => {
        throw new Error('Railway unreachable');
      }),
    };

    const result = await handlePaymentWebhook(deps, provider, flakyRailway, chargeSuccessBody(), 'sig', { now: new Date('2026-09-05T00:00:00.000Z') });

    expect(result.outcome).toBe('PROCESSED');
    expect(result.message).toMatch(/restoration did not complete/);
    // Payment + billing period ARE recorded even though infra restore failed —
    // an admin retries the Railway side, they don't re-charge the customer.
    const subscription = await deps.subscriptions.findById('sub_1');
    expect(subscription!.currentPeriodEnd).toBe('2026-10-05T00:00:00.000Z');
    expect(subscription!.status).toBe('SUSPENDED'); // not falsely flipped to ACTIVE
  });
});
