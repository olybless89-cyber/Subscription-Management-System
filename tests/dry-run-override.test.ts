import { describe, it, expect } from 'vitest';
import { setSubscriptionDryRunOverride } from '@/lib/suspension/dry-run-override';
import { makeFakeBillingSetupDeps } from './fakes';
import { AdminRecord, CustomerRecord, PlanRecord } from '@/types/domain';

function admin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'admin_1',
    name: 'Test Admin',
    email: 'admin@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'ADMIN',
    canManageAdmins: false,
    ...overrides,
  };
}

function customer(): CustomerRecord {
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
    status: 'ACTIVE',
    automaticSuspension: true,
    paymentProvider: 'PAYSTACK',
  };
}

function plan(): PlanRecord {
  return { id: 'plan_1', name: 'Test Plan', amount: 1000, currency: 'NGN', billingCycle: 'MONTHLY', gracePeriodDays: 2 };
}

function sub() {
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

describe('setSubscriptionDryRunOverride', () => {
  it('sets override to false (arms real suspend/restore for this one subscription)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await setSubscriptionDryRunOverride(deps, 'admin_1', 'sub_1', false);

    expect(result.outcome).toBe('UPDATED');
    expect(result.message).toMatch(/REAL/);
    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.dryRunOverride).toBe(false);
  });

  it('sets override to true (force-protects this subscription)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await setSubscriptionDryRunOverride(deps, 'admin_1', 'sub_1', true);

    expect(result.outcome).toBe('UPDATED');
    expect(result.message).toMatch(/never really suspend/);
  });

  it('clears the override back to null (inherit global)', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [{ ...sub(), dryRunOverride: false }],
      railwayResources: [],
    });

    const result = await setSubscriptionDryRunOverride(deps, 'admin_1', 'sub_1', null);

    expect(result.outcome).toBe('UPDATED');
    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.dryRunOverride).toBeNull();
  });

  it('rejects an unknown subscription', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await setSubscriptionDryRunOverride(deps, 'admin_1', 'sub_missing', false);

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('rejects an unknown requesting admin', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    const result = await setSubscriptionDryRunOverride(deps, 'admin_missing', 'sub_1', false);

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('logs an audit entry', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [admin()], customers: [customer()], plans: [plan()], subscriptions: [sub()], railwayResources: [] });

    await setSubscriptionDryRunOverride(deps, 'admin_1', 'sub_1', false);

    expect(deps.auditLogEntries.some((e) => e.action === 'SUBSCRIPTION_DRY_RUN_OVERRIDE_SET')).toBe(true);
  });
});
