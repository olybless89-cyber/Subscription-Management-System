import { describe, it, expect } from 'vitest';
import { createDomain } from '@/lib/domains/manage';
import { updateSubscription } from '@/lib/billing/manage';
import { makeFakeBillingSetupDeps } from './fakes';
import { AdminRecord, CustomerRecord, PlanRecord } from '@/types/domain';

function admin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'admin_1',
    name: 'Test Admin',
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
  return { id: 'plan_1', name: 'Standard', amount: 1000, currency: 'NGN', billingCycle: 'MONTHLY', gracePeriodDays: 2, ...overrides };
}

function sub(overrides: Partial<ReturnType<typeof baseSub>> = {}) {
  return { ...baseSub(), ...overrides };
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

describe('createDomain', () => {
  it('attaches a domain and marks it primary if it is the customer\'s first', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createDomain(deps, 'admin_1', { customerId: 'cust_1', domainName: 'chihap.com' });

    expect(result.outcome).toBe('CREATED');
    expect(result.domain?.isPrimary).toBe(true);
    const found = await deps.domains.findByCustomerId('cust_1');
    expect(found).toHaveLength(1);
  });

  it('does not force isPrimary=true for a second domain', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      domains: [{ id: 'dom_1', customerId: 'cust_1', domainName: 'first.com', isPrimary: true, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    const result = await createDomain(deps, 'admin_1', { customerId: 'cust_1', domainName: 'second.com' });

    expect(result.outcome).toBe('CREATED');
    expect(result.domain?.isPrimary).toBe(false);
  });

  it('rejects an invalid domain name', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createDomain(deps, 'admin_1', { customerId: 'cust_1', domainName: 'not a domain' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects a duplicate domain for the same customer', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      domains: [{ id: 'dom_1', customerId: 'cust_1', domainName: 'taken.com', isPrimary: true, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    const result = await createDomain(deps, 'admin_1', { customerId: 'cust_1', domainName: 'taken.com' });

    expect(result.outcome).toBe('ALREADY_EXISTS');
  });

  it('rejects a domain already attached to a DIFFERENT customer — domainName is globally unique, not per-customer', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer(), customer({ id: 'cust_2', email: 'other@example.com' })],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      domains: [{ id: 'dom_1', customerId: 'cust_1', domainName: 'shared.com', isPrimary: true, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    const result = await createDomain(deps, 'admin_1', { customerId: 'cust_2', domainName: 'shared.com' });

    expect(result.outcome).toBe('ALREADY_EXISTS');
    expect(result.message).toMatch(/different customer/);
    // Nothing new was created under cust_2.
    const cust2Domains = await deps.domains.findByCustomerId('cust_2');
    expect(cust2Domains).toHaveLength(0);
  });

  it('rejects an unknown customer', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createDomain(deps, 'admin_1', { customerId: 'nope', domainName: 'x.com' });

    expect(result.outcome).toBe('NOT_FOUND');
  });
});

describe('updateSubscription', () => {
  it('updates suspensionEnabled and is immediately reflected', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await updateSubscription(deps, 'admin_1', 'sub_1', { suspensionEnabled: false });

    expect(result.outcome).toBe('UPDATED');
    expect(result.subscription?.suspensionEnabled).toBe(false);
  });

  it('updates planId after verifying the new plan exists', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan(), plan({ id: 'plan_2', name: 'Premium' })],
      subscriptions: [sub()],
      railwayResources: [],
    });

    const result = await updateSubscription(deps, 'admin_1', 'sub_1', { planId: 'plan_2' });

    expect(result.outcome).toBe('UPDATED');
    expect(result.subscription?.planId).toBe('plan_2');
  });

  it('rejects a planId that does not exist, without applying a partial update', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await updateSubscription(deps, 'admin_1', 'sub_1', { planId: 'plan_missing' });

    expect(result.outcome).toBe('NOT_FOUND');
    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.planId).toBe('plan_1'); // unchanged
  });

  it('rejects an empty patch', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await updateSubscription(deps, 'admin_1', 'sub_1', {});

    expect(result.outcome).toBe('NO_CHANGES');
  });

  it('rejects an unknown subscription', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await updateSubscription(deps, 'admin_1', 'sub_missing', { suspensionEnabled: false });

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('the UpdateSubscriptionInput type has no status field — this is a compile-time guarantee, not just a runtime check', () => {
    // If this line ever compiles with `status` added to the object,
    // the type itself has regressed. TS would error here today.
    // @ts-expect-error status is intentionally not part of this type
    const input: import('@/lib/billing/manage').UpdateSubscriptionInput = { status: 'SUSPENDED' };
    expect(input).toBeDefined();
  });
});
