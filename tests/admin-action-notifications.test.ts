import { describe, it, expect } from 'vitest';
import { createCustomer } from '@/lib/customers/manage';
import { deleteCustomer } from '@/lib/customers/delete';
import { createDomain } from '@/lib/domains/manage';
import { createPlan, createSubscription, updateSubscription } from '@/lib/billing/manage';
import { createAdmin } from '@/lib/admin/manage';
import { changeOwnPassword } from '@/lib/admin/password';
import { createHostingAccount } from '@/lib/hosting/manage';
import { createCampaign } from '@/lib/campaigns/manage';
import { sendCustomEmail } from '@/lib/notifications/custom-email';
import { sendBirthdayGreetingNow } from '@/lib/customers/birthday';
import {
  makeFakeAdminManagementDeps,
  makeFakeBillingSetupDeps,
  makeFakeCampaignDeps,
  makeFakeCustomEmailDeps,
} from './fakes';
import { AdminRecord, CustomerRecord, PlanRecord } from '@/types/domain';

// This file checks one thing, everywhere it was wired in: that the
// "key admin action" super-admin notification (see notifyAdmins /
// notifyAdminsForCustomer in src/lib/notifications/admin-notify.ts)
// actually fires and lands an AdminNotification row for the SUPER_ADMIN,
// with the same event name as the audit-log entry the action already
// wrote. It is not exhaustive over every wired call site — one
// representative case per touched file is enough to catch a wiring
// mistake (wrong deps type, forgot the import, wrong customerId) in
// each of them without duplicating what each file's own test already
// covers for the action's primary behavior.

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    name: 'Super Admin',
    email: 'super@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'SUPER_ADMIN',
    canManageAdmins: true,
    ...overrides,
  };
}

function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    name: 'Test Customer',
    email: 'c@example.com',
    notificationEmail: 'c@example.com',
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
  return { id: 'plan_1', name: 'Standard', amount: 1000, currency: 'NGN', billingCycle: 'MONTHLY', customMonths: null, gracePeriodDays: 2, ...overrides };
}

describe('super-admin notifications on key admin actions', () => {
  it('createCustomer notifies the super admin (CUSTOMER_CREATED, scoped to the new customer)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'New Customer',
      email: 'new@example.com',
      notificationEmail: 'new@example.com',
      domainName: 'newcustomer.com',
    });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'CUSTOMER_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].adminId).toBe('super_1');
    expect(rows[0].customerId).toBe(result.customer?.id);
  });

  it('deleteCustomer notifies the super admin (CUSTOMER_DELETED, customerId null since the customer is gone)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await deleteCustomer(deps, 'super_1', 'cust_1');

    expect(result.outcome).toBe('DELETED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'CUSTOMER_DELETED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
    expect(rows[0].message).toContain('WOH-000001');
  });

  it('createDomain notifies the super admin (DOMAIN_CREATED)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [customer()], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createDomain(deps, 'super_1', { customerId: 'cust_1', domainName: 'chihap.com' });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'DOMAIN_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe('cust_1');
  });

  it('createPlan notifies the super admin (PLAN_CREATED, no customer to scope to)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createPlan(deps, 'super_1', { name: 'Gold', amount: 5000, billingCycle: 'MONTHLY' });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'PLAN_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
  });

  it('createSubscription (billing) notifies the super admin (SUBSCRIPTION_CREATED)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [customer()], plans: [plan()], subscriptions: [], railwayResources: [] });

    const result = await createSubscription(deps, 'super_1', { customerId: 'cust_1', planId: 'plan_1', status: 'ACTIVE' });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'SUBSCRIPTION_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe('cust_1');
  });

  it('updateSubscription notifies the super admin (SUBSCRIPTION_UPDATED) when billing dates are corrected', async () => {
    const sub = {
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
      reminderDaysBeforeDue: null,
      lastRenewalReminderSentAt: null,
    };
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [customer()], plans: [plan()], subscriptions: [sub], railwayResources: [] });

    const result = await updateSubscription(deps, 'super_1', 'sub_1', { currentPeriodEnd: '2026-03-01T00:00:00.000Z' });

    expect(result.outcome).toBe('UPDATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'SUBSCRIPTION_UPDATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe('cust_1');
  });

  it('createAdmin notifies the super admin (ADMIN_CREATED, no customer to scope to)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createAdmin(deps, 'super_1', { name: 'New Admin', email: 'newadmin@dwo.example', password: 'longenoughpassword', role: 'ADMIN', canManageAdmins: false });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'ADMIN_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
  });

  it('changeOwnPassword notifies the super admin (ADMIN_PASSWORD_CHANGED_SELF)', async () => {
    const { hashPassword } = await import('@/lib/auth/password');
    const passwordHash = await hashPassword('originalpassword');
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin({ passwordHash })], customers: [] });

    const result = await changeOwnPassword(deps, 'super_1', 'originalpassword', 'brandnewpassword');

    expect(result.outcome).toBe('CHANGED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'ADMIN_PASSWORD_CHANGED_SELF');
    expect(rows).toHaveLength(1);
  });

  it('createHostingAccount notifies the super admin (HOSTING_ACCOUNT_CONNECTED, no customer to scope to)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'super_1', { provider: 'RAILWAY', label: 'Main Railway account', apiToken: 'tok_123' });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'HOSTING_ACCOUNT_CONNECTED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
  });

  it('createCampaign notifies the super admin (CAMPAIGN_CREATED, no single customer to scope to)', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await createCampaign(deps, 'super_1', {
      name: 'September promo',
      channels: ['EMAIL'],
      subject: 'Hello',
      message: 'Hi there',
      customerIds: ['cust_1'],
    });

    expect(result.outcome).toBe('CREATED');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'CAMPAIGN_CREATED');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBeNull();
  });

  it('sendCustomEmail notifies the super admin (CUSTOM_EMAIL_SENT, scoped to the customer)', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await sendCustomEmail(deps, 'super_1', { customerId: 'cust_1', subject: 'Hi', message: 'Hello there' });

    expect(result.outcome).toBe('SENT');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'CUSTOM_EMAIL_SENT');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe('cust_1');
  });

  it('sendBirthdayGreetingNow notifies the super admin (BIRTHDAY_GREETING_SENT_MANUALLY, scoped to the customer)', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await sendBirthdayGreetingNow(deps, 'super_1', 'cust_1');

    expect(result.outcome).toBe('SENT');
    const rows = deps.adminNotificationLog.filter((n) => n.event === 'BIRTHDAY_GREETING_SENT_MANUALLY');
    expect(rows).toHaveLength(1);
    expect(rows[0].customerId).toBe('cust_1');
  });
});
