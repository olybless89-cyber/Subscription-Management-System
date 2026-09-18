import { describe, it, expect } from 'vitest';
import { runRenewalReminders, sendRenewalReminderNow, setSubscriptionReminderDays } from '@/lib/subscriptions/renewal-reminder';
import { makeFakeRenewalReminderDeps, makeFakeSendRenewalReminderNowDeps } from './fakes';
import { AdminRecord, CustomerRecord, SubscriptionRecord, PlanRecord } from '@/types/domain';

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
    email: 'customer@example.com',
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
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    nextBillingDate: '2026-09-01T00:00:00.000Z',
    gracePeriodEnd: null,
    dryRunOverride: null,
    reminderDaysBeforeDue: null,
    lastRenewalReminderSentAt: null,
    ...overrides,
  };
}

describe('runRenewalReminders', () => {
  it('sends when today is exactly reminderDaysBeforeDue days before nextBillingDate', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ nextBillingDate: '2026-09-10T00:00:00.000Z', reminderDaysBeforeDue: 5 })],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.checked).toBe(1);
    expect(result.sent).toBe(1);
    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0]).toMatchObject({ customerId: 'cust_1', event: 'RENEWAL_REMINDER' });

    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.lastRenewalReminderSentAt).toBe('2026-09-05');
  });

  it('does not send when the remaining days do not match reminderDaysBeforeDue', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ nextBillingDate: '2026-09-10T00:00:00.000Z', reminderDaysBeforeDue: 5 })],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-03T07:00:00.000Z') });

    expect(result.sent).toBe(0);
    expect(deps.notificationLog).toHaveLength(0);
  });

  it('excludes subscriptions with reminderDaysBeforeDue not set at all', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ nextBillingDate: '2026-09-10T00:00:00.000Z', reminderDaysBeforeDue: null })],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.checked).toBe(0); // findRenewalReminderCandidates() already excludes it
    expect(result.sent).toBe(0);
  });

  it('excludes subscriptions that are not ACTIVE, even with reminderDaysBeforeDue set', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [
        subscription({ status: 'SUSPENDED', nextBillingDate: '2026-09-10T00:00:00.000Z', reminderDaysBeforeDue: 5 }),
      ],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.checked).toBe(0);
    expect(result.sent).toBe(0);
  });

  it('is idempotent: skips (does not re-send) a subscription already reminded today', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [
        subscription({
          nextBillingDate: '2026-09-10T00:00:00.000Z',
          reminderDaysBeforeDue: 5,
          lastRenewalReminderSentAt: '2026-09-05',
        }),
      ],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.sent).toBe(0);
    expect(result.skipped).toBe(1);
    expect(deps.notificationLog).toHaveLength(0);
  });

  it('sends again the next day after a previous reminder (stamp only blocks the same day)', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [customer()],
      plans: [plan()],
      subscriptions: [
        subscription({
          nextBillingDate: '2026-09-10T00:00:00.000Z',
          reminderDaysBeforeDue: 5,
          lastRenewalReminderSentAt: '2026-09-04',
        }),
      ],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.sent).toBe(1);
  });

  it('sends to multiple matching subscriptions in one run and reports the count checked', async () => {
    const deps = makeFakeRenewalReminderDeps({
      customers: [
        customer({ id: 'cust_1', email: 'a@example.com' }),
        customer({ id: 'cust_2', email: 'b@example.com' }),
      ],
      plans: [plan()],
      subscriptions: [
        subscription({
          id: 'sub_1',
          customerId: 'cust_1',
          nextBillingDate: '2026-09-10T00:00:00.000Z',
          reminderDaysBeforeDue: 5,
        }),
        subscription({
          id: 'sub_2',
          customerId: 'cust_2',
          nextBillingDate: '2026-09-06T00:00:00.000Z',
          reminderDaysBeforeDue: 1,
        }),
      ],
    });

    const result = await runRenewalReminders(deps, { now: new Date('2026-09-05T07:00:00.000Z') });

    expect(result.checked).toBe(2);
    expect(result.sent).toBe(2);
  });
});

describe('sendRenewalReminderNow', () => {
  it('sends immediately regardless of reminderDaysBeforeDue/lastRenewalReminderSentAt', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [
        subscription({ reminderDaysBeforeDue: null, lastRenewalReminderSentAt: null }),
      ],
    });

    const result = await sendRenewalReminderNow(deps, 'admin_1', 'sub_1');

    expect(result.outcome).toBe('SENT');
    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0]).toMatchObject({ customerId: 'cust_1', event: 'RENEWAL_REMINDER' });
  });

  it('stamps lastRenewalReminderSentAt so the automated cron will not also send one later today', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription()],
    });

    await sendRenewalReminderNow(deps, 'admin_1', 'sub_1');

    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.lastRenewalReminderSentAt).not.toBeNull();
  });

  it('logs an audit entry', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription()],
    });

    await sendRenewalReminderNow(deps, 'admin_1', 'sub_1');

    expect(deps.auditLogEntries.some((e) => e.action === 'RENEWAL_REMINDER_SENT_MANUALLY')).toBe(true);
  });

  it('rejects an unknown requesting admin', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription()],
    });

    const result = await sendRenewalReminderNow(deps, 'admin_missing', 'sub_1');

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('rejects an unknown subscription', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [],
    });

    const result = await sendRenewalReminderNow(deps, 'admin_1', 'sub_missing');

    expect(result.outcome).toBe('NOT_FOUND');
  });
});

describe('setSubscriptionReminderDays', () => {
  it('sets the reminder-days value on a subscription', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ reminderDaysBeforeDue: null })],
    });

    const result = await setSubscriptionReminderDays(deps, 'admin_1', 'sub_1', 5);

    expect(result.outcome).toBe('UPDATED');
    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.reminderDaysBeforeDue).toBe(5);
  });

  it('clears the reminder-days value back to null (turns reminders off)', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription({ reminderDaysBeforeDue: 5 })],
    });

    await setSubscriptionReminderDays(deps, 'admin_1', 'sub_1', null);

    const stored = await deps.subscriptions.findById('sub_1');
    expect(stored?.reminderDaysBeforeDue).toBeNull();
  });

  it('rejects a negative or non-integer value', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription()],
    });

    const result = await setSubscriptionReminderDays(deps, 'admin_1', 'sub_1', -1);

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects an unknown subscription', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [admin()],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [],
    });

    const result = await setSubscriptionReminderDays(deps, 'admin_1', 'sub_missing', 5);

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('rejects an unknown requesting admin', async () => {
    const deps = makeFakeSendRenewalReminderNowDeps({
      admins: [],
      customers: [customer()],
      plans: [plan()],
      subscriptions: [subscription()],
    });

    const result = await setSubscriptionReminderDays(deps, 'admin_missing', 'sub_1', 5);

    expect(result.outcome).toBe('FORBIDDEN');
  });
});
