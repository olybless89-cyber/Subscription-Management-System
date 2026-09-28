import { describe, it, expect } from 'vitest';
import { resolveBillingCycleForMonths } from '@/lib/billing/months';
import { findOrCreatePlanForMonths, activateCustomerBilling } from '@/lib/billing/manage';
import { makeFakeBillingSetupDeps } from './fakes';
import { AdminRecord, CustomerRecord, PlanRecord, SubscriptionRecord } from '@/types/domain';

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
    status: 'ACTIVE',
    automaticSuspension: true,
    paymentProvider: 'PAYSTACK',
    notes: null,
    ...overrides,
  };
}

describe('resolveBillingCycleForMonths', () => {
  it('maps months that already have a named cycle onto that cycle, with no customMonths', () => {
    expect(resolveBillingCycleForMonths(1)).toEqual({ billingCycle: 'MONTHLY', customMonths: null });
    expect(resolveBillingCycleForMonths(3)).toEqual({ billingCycle: 'QUARTERLY', customMonths: null });
    expect(resolveBillingCycleForMonths(4)).toEqual({ billingCycle: 'FOUR_MONTHS', customMonths: null });
    expect(resolveBillingCycleForMonths(6)).toEqual({ billingCycle: 'SEMI_ANNUAL', customMonths: null });
    expect(resolveBillingCycleForMonths(12)).toEqual({ billingCycle: 'YEARLY', customMonths: null });
  });

  it('falls back to CUSTOM with customMonths set for any other month count', () => {
    expect(resolveBillingCycleForMonths(2)).toEqual({ billingCycle: 'CUSTOM', customMonths: 2 });
    expect(resolveBillingCycleForMonths(5)).toEqual({ billingCycle: 'CUSTOM', customMonths: 5 });
    expect(resolveBillingCycleForMonths(7)).toEqual({ billingCycle: 'CUSTOM', customMonths: 7 });
  });
});

describe('findOrCreatePlanForMonths', () => {
  it('creates a new plan at $20/month for a fresh month count', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const plan = await findOrCreatePlanForMonths(deps, 'admin_1', 1);

    expect(plan.billingCycle).toBe('MONTHLY');
    expect(plan.customMonths).toBeNull();
    expect(plan.amount).toBe(2000);
    expect(plan.currency).toBe('USD');
  });

  it('scales the amount linearly with the number of months', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const plan = await findOrCreatePlanForMonths(deps, 'admin_1', 3);

    expect(plan.billingCycle).toBe('QUARTERLY');
    expect(plan.amount).toBe(6000); // $60
  });

  it('reuses an existing plan with the same cycle/amount/currency instead of creating a duplicate', async () => {
    const existing: PlanRecord = {
      id: 'plan_existing',
      name: '1 Month — 20.00 USD',
      amount: 2000,
      currency: 'USD',
      billingCycle: 'MONTHLY',
      customMonths: null,
      gracePeriodDays: 2,
    };
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [],
      plans: [existing],
      subscriptions: [],
      railwayResources: [],
    });

    const plan = await findOrCreatePlanForMonths(deps, 'admin_1', 1);

    expect(plan.id).toBe('plan_existing');
    expect((await deps.plans.listAll())).toHaveLength(1);
  });

  it('creates a CUSTOM plan with customMonths set for an oddball month count', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const plan = await findOrCreatePlanForMonths(deps, 'admin_1', 5);

    expect(plan.billingCycle).toBe('CUSTOM');
    expect(plan.customMonths).toBe(5);
    expect(plan.amount).toBe(10000); // $100
  });
});

describe('activateCustomerBilling', () => {
  it('activates a customer with no subscription onto a 1-month plan starting now', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const result = await activateCustomerBilling(deps, 'admin_1', 'cust_1', 1);

    expect(result.outcome).toBe('ACTIVATED');
    expect(result.subscription?.status).toBe('ACTIVE');
    expect(result.plan?.billingCycle).toBe('MONTHLY');

    const start = new Date(result.subscription!.currentPeriodStart);
    const end = new Date(result.subscription!.currentPeriodEnd);
    expect(end.getUTCMonth()).toBe((start.getUTCMonth() + 1) % 12);
  });

  it('activates a customer onto an arbitrary N-month plan with the period computed correctly', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const result = await activateCustomerBilling(deps, 'admin_1', 'cust_1', 5, {
      startDate: '2026-01-15T00:00:00.000Z',
    });

    expect(result.outcome).toBe('ACTIVATED');
    expect(result.subscription?.currentPeriodEnd).toBe('2026-06-15T00:00:00.000Z');
    expect(result.subscription?.nextBillingDate).toBe('2026-06-15T00:00:00.000Z');
  });

  it('refuses to activate a customer that already has a subscription', async () => {
    const existingSub: SubscriptionRecord = {
      id: 'sub_1',
      customerId: 'cust_1',
      planId: 'plan_1',
      status: 'ACTIVE',
      suspensionEnabled: true,
      suspendedAt: null,
      currentPeriodStart: '2026-01-01T00:00:00.000Z',
      currentPeriodEnd: '2026-02-01T00:00:00.000Z',
      nextBillingDate: '2026-02-01T00:00:00.000Z',
      gracePeriodEnd: null,
      dryRunOverride: null,
      reminderDaysBeforeDue: null,
      lastRenewalReminderSentAt: null,
    };
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [existingSub],
      railwayResources: [],
    });

    const result = await activateCustomerBilling(deps, 'admin_1', 'cust_1', 1);

    expect(result.outcome).toBe('ALREADY_HAS_SUBSCRIPTION');
  });

  it('rejects a non-positive or non-integer monthsPaid', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    expect((await activateCustomerBilling(deps, 'admin_1', 'cust_1', 0)).outcome).toBe('INVALID_INPUT');
    expect((await activateCustomerBilling(deps, 'admin_1', 'cust_1', -2)).outcome).toBe('INVALID_INPUT');
    expect((await activateCustomerBilling(deps, 'admin_1', 'cust_1', 2.5)).outcome).toBe('INVALID_INPUT');
  });

  it('returns NOT_FOUND for an unknown customer', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [admin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
    });

    const result = await activateCustomerBilling(deps, 'admin_1', 'nope', 1);

    expect(result.outcome).toBe('NOT_FOUND');
  });
});
