import { describe, it, expect } from 'vitest';
import { notifyAdminsForCustomer } from '@/lib/notifications/admin-notify';
import { makeFakeWebhookDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function customer(id: string): CustomerRecord {
  return {
    id,
    customerCode: `WOH-${id}`,
    name: 'Test Customer',
    email: `${id}@example.com`,
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

function admin(overrides: Partial<AdminRecord>): AdminRecord {
  return {
    id: 'a',
    name: 'Test Admin',
    email: 'a@dwo.example',
    passwordHash: 'x',
    role: 'ADMIN',
    canManageAdmins: false,
    ...overrides,
  };
}

describe('notifyAdminsForCustomer', () => {
  it('notifies every SUPER_ADMIN regardless of assignment', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer('cust_1')],
      subscriptions: [],
      railwayResources: [],
      plans: [],
      payments: [],
      admins: [admin({ id: 'super_1', role: 'SUPER_ADMIN' })],
      assignments: [],
    });

    await notifyAdminsForCustomer(deps, 'cust_1', 'PAYMENT_RECEIVED', 'test message');

    expect(deps.adminNotificationLog).toHaveLength(1);
    expect(deps.adminNotificationLog[0].adminId).toBe('super_1');
  });

  it('notifies an ADMIN only if assigned to this specific customer', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer('cust_1'), customer('cust_2')],
      subscriptions: [],
      railwayResources: [],
      plans: [],
      payments: [],
      admins: [admin({ id: 'admin_1' }), admin({ id: 'admin_2', email: 'a2@dwo.example' })],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_1' }],
    });

    await notifyAdminsForCustomer(deps, 'cust_1', 'PAYMENT_RECEIVED', 'payment for cust_1');

    const recipientIds = deps.adminNotificationLog.map((n) => n.adminId);
    expect(recipientIds).toContain('admin_1');
    expect(recipientIds).not.toContain('admin_2'); // not assigned to cust_1
  });

  it('an admin assigned to a DIFFERENT customer gets nothing for this event', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer('cust_1'), customer('cust_2')],
      subscriptions: [],
      railwayResources: [],
      plans: [],
      payments: [],
      admins: [admin({ id: 'admin_1' })],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_2' }], // assigned to cust_2, not cust_1
    });

    await notifyAdminsForCustomer(deps, 'cust_1', 'PAYMENT_RECEIVED', 'payment for cust_1');

    expect(deps.adminNotificationLog).toHaveLength(0);
  });

  it('deduplicates a SUPER_ADMIN who also holds an explicit assignment row', async () => {
    const deps = makeFakeWebhookDeps({
      customers: [customer('cust_1')],
      subscriptions: [],
      railwayResources: [],
      plans: [],
      payments: [],
      admins: [admin({ id: 'super_1', role: 'SUPER_ADMIN' })],
      assignments: [{ adminId: 'super_1', customerId: 'cust_1' }],
    });

    await notifyAdminsForCustomer(deps, 'cust_1', 'PAYMENT_RECEIVED', 'test');

    expect(deps.adminNotificationLog).toHaveLength(1); // not 2
  });
});
