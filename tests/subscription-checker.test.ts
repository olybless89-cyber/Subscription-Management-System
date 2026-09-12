import { describe, it, expect, vi } from 'vitest';
import { runSubscriptionChecker } from '@/lib/cron/subscription-checker';
import { RailwayClient } from '@/lib/railway/client';
import { makeFakeWebhookDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, PlanRecord, RailwayResourceRecord } from '@/types/domain';

const NOW = new Date('2026-09-10T00:00:00.000Z');

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    name: 'Test Customer',
    email: 'c@example.com',
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
    currentPeriodStart: '2026-08-10T00:00:00.000Z',
    currentPeriodEnd: '2026-09-10T00:00:00.000Z',
    nextBillingDate: '2026-09-10T00:00:00.000Z',
    gracePeriodEnd: null,
    dryRunOverride: null,
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
    status: 'ACTIVE',
  };
}

const railway: RailwayClient = { request: vi.fn() };

describe('runSubscriptionChecker', () => {
  it('moves ACTIVE -> PAYMENT_DUE once nextBillingDate has passed', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.movedToPaymentDue).toBe(1);
    const s = await deps.subscriptions.findById('sub_1');
    expect(s!.status).toBe('PAYMENT_DUE');
    expect(deps.notificationLog[0].event).toBe('PAYMENT_DUE');
  });

  it('does not touch an ACTIVE subscription whose billing date is still in the future', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-10-01T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.skipped).toBe(1);
    expect(result.movedToPaymentDue).toBe(0);
  });

  it('creates and sends a DUE invoice when a subscription becomes payment-due', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    await runSubscriptionChecker(deps, railway, { now: NOW });

    const invoices = await deps.invoices.findByCustomerId('cust_1');
    expect(invoices).toHaveLength(1);
    expect(invoices[0].type).toBe('DUE');
    expect(invoices[0].status).toBe('PENDING');
    expect(invoices[0].dueDate).not.toBeNull();
  });

  it('notifies the assigned admin(s) so they can follow up on the due subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
      admins: [
        { id: 'super_1', name: 'Super', email: 'super@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'SUPER_ADMIN', canManageAdmins: true },
      ],
    });

    await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(deps.adminNotificationLog.length).toBeGreaterThan(0);
    expect(deps.adminNotificationLog.some((n) => n.event === 'PAYMENT_DUE' && n.customerId === 'cust_1')).toBe(true);
  });

  it('a failed invoice or admin-notify attempt never blocks the ACTIVE -> PAYMENT_DUE transition itself', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });
    deps.invoices.create = async () => {
      throw new Error('simulated invoice failure');
    };

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.movedToPaymentDue).toBe(1);
    const s = await deps.subscriptions.findById('sub_1');
    expect(s!.status).toBe('PAYMENT_DUE');
    expect(result.errors).toHaveLength(0);
  });

  it('moves PAYMENT_DUE -> GRACE_PERIOD and computes gracePeriodEnd from the plan', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'PAYMENT_DUE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan({ gracePeriodDays: 2 })],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.movedToGracePeriod).toBe(1);
    const s = await deps.subscriptions.findById('sub_1');
    expect(s!.status).toBe('GRACE_PERIOD');
    expect(s!.gracePeriodEnd).toBe('2026-09-12T00:00:00.000Z');
  });

  it('suspends once GRACE_PERIOD has expired, via suspendCustomer (MULTI_TENANT, no Railway call)', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [
        subscription({ status: 'GRACE_PERIOD', gracePeriodEnd: '2026-09-09T00:00:00.000Z' }),
      ],
      railwayResources: [multiTenantResource()],
      plans: [plan()],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.suspended).toBe(1);
    const s = await deps.subscriptions.findById('sub_1');
    const c = await deps.customers.findById('cust_1');
    expect(s!.status).toBe('SUSPENDED');
    expect(c!.status).toBe('SUSPENDED');
    expect(railway.request).not.toHaveBeenCalled();
  });

  it('does not suspend if GRACE_PERIOD has not yet expired', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [
        subscription({ status: 'GRACE_PERIOD', gracePeriodEnd: '2026-09-15T00:00:00.000Z' }),
      ],
      railwayResources: [multiTenantResource()],
      plans: [plan()],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(result.suspended).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('running twice on the same tick is idempotent — second run is a no-op for that subscription', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer()],
      subscriptions: [subscription({ status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' })],
      railwayResources: [],
      plans: [plan()],
      payments: [],
    });

    const first = await runSubscriptionChecker(deps, railway, { now: NOW });
    // Second run picks up the (now) PAYMENT_DUE subscription — since its
    // nextBillingDate is still in the past, it correctly progresses it
    // toward GRACE_PERIOD rather than re-firing PAYMENT_DUE again.
    const second = await runSubscriptionChecker(deps, railway, { now: NOW });

    expect(first.movedToPaymentDue).toBe(1);
    expect(second.movedToPaymentDue).toBe(0);
    expect(second.movedToGracePeriod).toBe(1);
    expect(deps.notificationLog.filter((n) => n.event === 'PAYMENT_DUE')).toHaveLength(1);
  });

  it('respects automaticSuspension=false when a GRACE_PERIOD subscription is due for suspension', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer({ automaticSuspension: false })],
      subscriptions: [
        subscription({ status: 'GRACE_PERIOD', gracePeriodEnd: '2026-09-09T00:00:00.000Z' }),
      ],
      railwayResources: [multiTenantResource()],
      plans: [plan()],
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    // suspendCustomer returns SKIPPED, which the checker surfaces as an
    // error entry (not a silent success) so an admin notices it needs a
    // manual decision — not left invisibly unsuspended forever.
    expect(result.suspended).toBe(0);
    expect(result.errors).toHaveLength(1);
    const s = await deps.subscriptions.findById('sub_1');
    expect(s!.status).toBe('GRACE_PERIOD');
  });

  it('processes an unrelated subscription independently even if another one in the batch has a data issue', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer(), customer({ id: 'cust_2', email: 'c2@example.com' })],
      subscriptions: [
        subscription({ id: 'sub_broken', planId: 'missing_plan', status: 'PAYMENT_DUE', nextBillingDate: '2026-09-09T00:00:00.000Z' }),
        subscription({ id: 'sub_ok', customerId: 'cust_2', status: 'ACTIVE', nextBillingDate: '2026-09-09T00:00:00.000Z' }),
      ],
      railwayResources: [],
      plans: [plan()], // note: 'missing_plan' is not seeded
      payments: [],
    });

    const result = await runSubscriptionChecker(deps, railway, { now: NOW });

    // sub_broken falls back to the default grace period (missing plan)
    // rather than throwing and aborting the batch; sub_ok is unaffected
    // either way.
    expect(result.movedToPaymentDue).toBe(1);
    const broken = await deps.subscriptions.findById('sub_broken');
    expect(broken!.status).toBe('GRACE_PERIOD');
    const ok = await deps.subscriptions.findById('sub_ok');
    expect(ok!.status).toBe('PAYMENT_DUE');
  });
});
