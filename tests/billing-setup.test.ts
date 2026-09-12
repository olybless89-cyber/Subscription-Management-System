import { describe, it, expect } from 'vitest';
import { createPlan, createSubscription } from '@/lib/billing/manage';
import { mapRailwayResource } from '@/lib/railway/mapping';
import { makeFakeBillingSetupDeps } from './fakes';
import { AdminRecord, CustomerRecord, PlanRecord } from '@/types/domain';

function admin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'admin_1',
    email: 'admin@dwo.example',
    passwordHash: 'x',
    role: 'ADMIN',
    canManageAdmins: false,
    ...overrides,
  };
}

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

function baseSub() {
  return {
    id: 'sub_1',
    customerId: 'cust_1',
    planId: 'plan_1',
    status: 'ACTIVE' as const,
    suspensionEnabled: true,
    suspendedAt: null,
    currentPeriodStart: '2026-01-01T00:00:00.000Z',
    currentPeriodEnd: '2026-02-01T00:00:00.000Z',
    nextBillingDate: '2026-02-01T00:00:00.000Z',
    gracePeriodEnd: null,
    dryRunOverride: null,
  };
}

describe('createPlan', () => {
  it('creates a plan and it is immediately findable', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createPlan(deps, 'admin_1', {
      name: 'Starter Hosting',
      amount: 2_500_000,
      billingCycle: 'MONTHLY',
    });

    expect(result.outcome).toBe('CREATED');
    // The exact bug class this guards against: create() writing to a
    // different store than findById() reads from.
    const found = await deps.plans.findById(result.plan!.id);
    expect(found).not.toBeNull();
    expect(found?.name).toBe('Starter Hosting');
    expect(found?.currency).toBe('NGN'); // default applied
  });

  it('rejects a non-positive amount', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createPlan(deps, 'admin_1', { name: 'Bad', amount: 0, billingCycle: 'MONTHLY' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects a missing name', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createPlan(deps, 'admin_1', { name: '  ', amount: 1000, billingCycle: 'MONTHLY' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('logs a PLAN_CREATED audit entry', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    await createPlan(deps, 'admin_1', { name: 'X', amount: 1000, billingCycle: 'YEARLY' });

    expect(deps.auditLogEntries.some((e) => e.action === 'PLAN_CREATED')).toBe(true);
  });
});

describe('createSubscription', () => {
  it('creates a subscription with a computed period matching the plan billing cycle', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan({ billingCycle: 'MONTHLY' })],
      subscriptions: [],
      railwayResources: [],
    });

    const start = '2026-09-10T00:00:00.000Z';
    const result = await createSubscription(deps, 'admin_1', {
      customerId: 'cust_1',
      planId: 'plan_1',
      startDate: start,
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.subscription?.currentPeriodStart).toBe(start);
    expect(result.subscription?.currentPeriodEnd).toBe('2026-10-10T00:00:00.000Z');
    expect(result.subscription?.nextBillingDate).toBe('2026-10-10T00:00:00.000Z');
    expect(result.subscription?.status).toBe('TRIAL'); // default

    // Immediately findable — same class of bug as the plan test above.
    const found = await deps.subscriptions.findById(result.subscription!.id);
    expect(found).not.toBeNull();
  });

  it('respects an explicit ACTIVE status (skip trial)', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [],
      railwayResources: [],
    });

    const result = await createSubscription(deps, 'admin_1', {
      customerId: 'cust_1',
      planId: 'plan_1',
      status: 'ACTIVE',
    });

    expect(result.subscription?.status).toBe('ACTIVE');
  });

  it('computes different period lengths for QUARTERLY vs YEARLY plans', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan({ id: 'plan_q', billingCycle: 'QUARTERLY' }), plan({ id: 'plan_y', billingCycle: 'YEARLY' })],
      subscriptions: [],
      railwayResources: [],
    });

    const start = '2026-01-01T00:00:00.000Z';
    const quarterly = await createSubscription(deps, 'admin_1', { customerId: 'cust_1', planId: 'plan_q', startDate: start });
    const yearly = await createSubscription(deps, 'admin_1', { customerId: 'cust_1', planId: 'plan_y', startDate: start });

    expect(quarterly.subscription?.currentPeriodEnd).toBe('2026-04-01T00:00:00.000Z');
    expect(yearly.subscription?.currentPeriodEnd).toBe('2027-01-01T00:00:00.000Z');
  });

  it('rejects an unknown customer', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [plan()], subscriptions: [], railwayResources: [] });

    const result = await createSubscription(deps, 'admin_1', { customerId: 'nope', planId: 'plan_1' });

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('rejects an unknown plan', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createSubscription(deps, 'admin_1', { customerId: 'cust_1', planId: 'nope' });

    expect(result.outcome).toBe('NOT_FOUND');
  });
});

describe('mapRailwayResource', () => {
  it('creates a DEDICATED/STOP_DEPLOYMENT mapping and it is immediately findable', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [baseSub()],
      railwayResources: [],
    });

    const result = await mapRailwayResource(deps, 'admin_1', {
      subscriptionId: 'sub_1',
      projectId: 'proj_abc',
      environmentId: 'env_production',
      serviceId: 'svc_abc-web',
      hostingMode: 'DEDICATED',
      suspensionStrategy: 'STOP_DEPLOYMENT',
    });

    expect(result.outcome).toBe('CREATED');
    const found = await deps.railwayResources.findBySubscriptionId('sub_1');
    expect(found).toHaveLength(1);
    expect(found[0].hostingMode).toBe('DEDICATED');
  });

  it('rejects MULTI_TENANT paired with STOP_DEPLOYMENT — the exact unsafe combination spec section 16 forbids', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [baseSub()],
      railwayResources: [],
    });

    const result = await mapRailwayResource(deps, 'admin_1', {
      subscriptionId: 'sub_1',
      projectId: 'proj_shared',
      environmentId: 'env_production',
      serviceId: 'svc_shared-app',
      hostingMode: 'MULTI_TENANT',
      suspensionStrategy: 'STOP_DEPLOYMENT',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
    expect(deps.railwayResourceStore).toHaveLength(0); // nothing saved
  });

  it('accepts MULTI_TENANT paired with APP_LEVEL', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [baseSub()],
      railwayResources: [],
    });

    const result = await mapRailwayResource(deps, 'admin_1', {
      subscriptionId: 'sub_1',
      projectId: 'proj_shared',
      environmentId: 'env_production',
      serviceId: 'svc_shared-app',
      hostingMode: 'MULTI_TENANT',
      suspensionStrategy: 'APP_LEVEL',
    });

    expect(result.outcome).toBe('CREATED');
  });

  it('rejects APP_LEVEL paired with a non-MULTI_TENANT hosting mode', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [baseSub()],
      railwayResources: [],
    });

    const result = await mapRailwayResource(deps, 'admin_1', {
      subscriptionId: 'sub_1',
      projectId: 'proj_abc',
      environmentId: 'env_production',
      serviceId: 'svc_abc-web',
      hostingMode: 'DEDICATED',
      suspensionStrategy: 'APP_LEVEL',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects an unknown subscription', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await mapRailwayResource(deps, 'admin_1', {
      subscriptionId: 'sub_missing',
      projectId: 'p',
      environmentId: 'e',
      serviceId: 's',
      hostingMode: 'DEDICATED',
      suspensionStrategy: 'STOP_DEPLOYMENT',
    });

    expect(result.outcome).toBe('NOT_FOUND');
  });
});
