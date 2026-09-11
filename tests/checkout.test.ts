import { describe, it, expect, vi } from 'vitest';
import { initiateCheckout } from '@/lib/payments/checkout';
import { PaymentProvider, InitializePaymentResult } from '@/lib/payments/provider';
import { makeFakeWebhookDeps } from './fakes';
import {
  CustomerRecord,
  SubscriptionRecord,
  PlanRecord,
} from '@/types/domain';

function baseCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    name: 'Test Customer',
    email: 'customer@example.com',
    notificationEmail: null,
    phone: null,
    dateOfBirth: null,
    serviceStartDate: null,
    serviceEndDate: null,
    websiteType: null,
    passwordHash: null,
    paymentProvider: 'PAYSTACK',
    status: 'ACTIVE',
    automaticSuspension: true,
    ...overrides,
  };
}

function baseSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub_1',
    customerId: 'cust_1',
    planId: 'plan_1',
    status: 'PAYMENT_DUE',
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

function basePlan(overrides: Partial<PlanRecord> = {}): PlanRecord {
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

function fakeProvider(overrides: Partial<PaymentProvider> = {}): PaymentProvider {
  return {
    name: 'paystack',
    verifyWebhookSignature: vi.fn(),
    verifyTransaction: vi.fn(),
    initializePayment: vi.fn(
      async (): Promise<InitializePaymentResult> => ({
        authorizationUrl: 'https://checkout.paystack.com/abc123',
        accessCode: 'abc123',
        reference: 'placeholder', // overwritten per-call in tests that care
      })
    ),
    ...overrides,
  };
}

describe('initiateCheckout — happy path', () => {
  it('creates a PENDING payment and returns the authorization URL', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.digitalweboracleict.com/billing/callback',
    }, () => provider);

    expect(result.outcome).toBe('INITIATED');
    expect(result.authorizationUrl).toBe('https://checkout.paystack.com/abc123');
    expect(result.amountMinor).toBe(2_500_000);
    expect(provider.initializePayment).toHaveBeenCalledTimes(1);

    // A PENDING payment row now exists under the reference we generated.
    expect(result.reference).toBeTruthy();
    expect(deps.paymentRows.size).toBe(1);
    const [stored] = [...deps.paymentRows.values()];
    expect(stored.status).toBe('PENDING');
    expect(stored.amount).toBe(2_500_000);
  });

  it('generates a fresh, customer-code-prefixed reference each call', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();
    const initSpy = provider.initializePayment as ReturnType<typeof vi.fn>;

    await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);
    await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    const firstRef = initSpy.mock.calls[0][0].reference as string;
    const secondRef = initSpy.mock.calls[1][0].reference as string;

    expect(firstRef).not.toBe(secondRef);
    expect(firstRef.startsWith('WOH-000001-')).toBe(true);
    expect(secondRef.startsWith('WOH-000001-')).toBe(true);
    expect(deps.paymentRows.size).toBe(2);
  });

  it('passes the plan amount/currency and customer email through to the provider', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer({ email: 'jeffrey@dwo.example' })],
      subscriptions: [baseSubscription()],
      railwayResources: [],
      plans: [basePlan({ amount: 5_000_000, currency: 'NGN' })],
      payments: [],
    });
    const provider = fakeProvider();
    const initSpy = provider.initializePayment as ReturnType<typeof vi.fn>;

    await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(initSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        amountMinor: 5_000_000,
        currency: 'NGN',
        customerEmail: 'jeffrey@dwo.example',
        callbackUrl: 'https://portal.example.com/callback',
      })
    );
  });
});

describe('initiateCheckout — guards', () => {
  it('refuses a non-https callbackUrl without creating a payment row', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'http://portal.example.com/callback', // not https
    }, () => provider);

    expect(result.outcome).toBe('ERROR');
    expect(provider.initializePayment).not.toHaveBeenCalled();
    expect(deps.paymentRows.size).toBe(0);
  });

  it('blocks checkout for a CANCELLED subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription({ status: 'CANCELLED' })],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(result.outcome).toBe('BLOCKED');
    expect(provider.initializePayment).not.toHaveBeenCalled();
  });

  it('blocks checkout for a TERMINATED subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription({ status: 'TERMINATED' })],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(result.outcome).toBe('BLOCKED');
  });

  it('allows checkout while SUSPENDED (paying to trigger restoration)', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(result.outcome).toBe('INITIATED');
  });

  it('returns NOT_FOUND for an unknown subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider();

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_missing',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(result.outcome).toBe('NOT_FOUND');
  });
});

describe('initiateCheckout — provider failure', () => {
  it('marks the pending payment FAILED if the provider rejects initialization', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [],
      plans: [basePlan()],
      payments: [],
    });
    const provider = fakeProvider({
      initializePayment: vi.fn(async () => {
        throw new Error('Paystack initialize failed: invalid key');
      }),
    });

    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    }, () => provider);

    expect(result.outcome).toBe('ERROR');
    expect(result.message).toMatch(/invalid key/);
    expect(deps.paymentRows.size).toBe(1);
    const [payment] = [...deps.paymentRows.values()];
    expect(payment.status).toBe('FAILED');
  });
});
