import { describe, it, expect, vi } from 'vitest';
import { resolvePaymentProvider, UnsupportedPaymentProviderError } from '@/lib/payments/registry';
import { initiateCheckout } from '@/lib/payments/checkout';
import { makeFakeWebhookDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, PlanRecord } from '@/types/domain';

process.env.PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY ?? 'sk_test_fake_key_for_unit_tests';

describe('resolvePaymentProvider', () => {
  it('resolves PAYSTACK to a working provider', () => {
    const provider = resolvePaymentProvider('PAYSTACK');
    expect(provider.name).toBe('paystack');
  });

  it('throws a clear, typed error for FLUTTERWAVE rather than faking success', () => {
    expect(() => resolvePaymentProvider('FLUTTERWAVE')).toThrow(UnsupportedPaymentProviderError);
  });
});

describe('initiateCheckout — provider routing by customer group', () => {
  function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
    return {
      id: 'cust_1',
      customerCode: 'WOH-000001',
      email: 'c@example.com',
      passwordHash: null,
      status: 'ACTIVE',
      automaticSuspension: true,
      paymentProvider: 'PAYSTACK',
      ...overrides,
    };
  }

  function subscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
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
      ...overrides,
    };
  }

  function plan(): PlanRecord {
    return { id: 'plan_1', name: 'Standard Hosting', amount: 1_000_000, currency: 'NGN', billingCycle: 'MONTHLY', gracePeriodDays: 2 };
  }

  it('routes a PAYSTACK-grouped customer to the Paystack provider', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer({ paymentProvider: 'PAYSTACK' })],
      subscriptions: [subscription()],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const resolver = vi.fn((name: 'PAYSTACK' | 'FLUTTERWAVE') => ({
      name: name.toLowerCase(),
      initializePayment: vi.fn(async () => ({ authorizationUrl: 'https://pay.example/x', reference: 'ref' })),
      verifyWebhookSignature: vi.fn(),
      verifyTransaction: vi.fn(),
    }));

    const result = await initiateCheckout(
      deps,
      { subscriptionId: 'sub_1', callbackUrl: 'https://portal.example.com/callback' },
      resolver
    );

    expect(resolver).toHaveBeenCalledWith('PAYSTACK');
    expect(result.outcome).toBe('INITIATED');
  });

  it('routes a FLUTTERWAVE-grouped customer to a different provider instance', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer({ paymentProvider: 'FLUTTERWAVE' })],
      subscriptions: [subscription()],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const resolver = vi.fn((name: 'PAYSTACK' | 'FLUTTERWAVE') => ({
      name: name.toLowerCase(),
      initializePayment: vi.fn(async () => ({ authorizationUrl: 'https://flutterwave.example/x', reference: 'ref' })),
      verifyWebhookSignature: vi.fn(),
      verifyTransaction: vi.fn(),
    }));

    const result = await initiateCheckout(
      deps,
      { subscriptionId: 'sub_1', callbackUrl: 'https://portal.example.com/callback' },
      resolver
    );

    expect(resolver).toHaveBeenCalledWith('FLUTTERWAVE');
    expect(result.authorizationUrl).toBe('https://flutterwave.example/x');
  });

  it('surfaces UnsupportedPaymentProviderError as a clean ERROR outcome, not a crash', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer({ paymentProvider: 'FLUTTERWAVE' })],
      subscriptions: [subscription()],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    // Use the REAL registry here (no fake resolver) since FLUTTERWAVE
    // really does throw from resolvePaymentProvider today.
    const result = await initiateCheckout(deps, {
      subscriptionId: 'sub_1',
      callbackUrl: 'https://portal.example.com/callback',
    });

    expect(result.outcome).toBe('ERROR');
    expect(result.message).toMatch(/not implemented/);
    expect(deps.paymentRows.size).toBe(0); // no payment row created for a provider that can't be used
  });
});
