import { describe, it, expect } from 'vitest';
import { deleteCustomer } from '@/lib/customers/delete';
import { makeFakeAdminManagementDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    name: 'Test Super Admin',
    email: 'super@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'SUPER_ADMIN',
    canManageAdmins: true,
    ...overrides,
  };
}

function plainAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
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
    ...overrides,
  };
}

describe('deleteCustomer', () => {
  it('SUPER_ADMIN can permanently delete a customer', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [customer()],
    });

    const result = await deleteCustomer(deps, 'super_1', 'cust_1');

    expect(result.outcome).toBe('DELETED');
    expect(result.message).toContain('WOH-000001');
    const stored = await deps.customers.findById('cust_1');
    expect(stored).toBeNull();
  });

  it('writes an audit log entry recording who deleted which customer', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [customer()],
    });

    await deleteCustomer(deps, 'super_1', 'cust_1');

    const entry = deps.auditLogEntries.find((e) => e.action === 'CUSTOMER_DELETED');
    expect(entry).toBeDefined();
    expect(entry?.actor).toBe('super_1');
    expect(entry?.target).toBe('cust_1');
  });

  it('cascades: deleting a customer also removes their domains', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [customer()],
      domains: [
        { id: 'dom_1', customerId: 'cust_1', domainName: 'chihap.com', isPrimary: true, subscriptionId: null, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' },
        { id: 'dom_2', customerId: 'cust_2', domainName: 'other.com', isPrimary: true, subscriptionId: null, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' },
      ],
    });

    await deleteCustomer(deps, 'super_1', 'cust_1');

    expect(await deps.domains.findById('dom_1')).toBeNull();
    // A different customer's domain is untouched.
    expect(await deps.domains.findById('dom_2')).not.toBeNull();
  });

  it('cascades: deleting a customer also removes their admin assignments', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin()],
      customers: [customer()],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_1' }],
    });

    await deleteCustomer(deps, 'super_1', 'cust_1');

    expect(await deps.adminAssignments.isAssigned('admin_1', 'cust_1')).toBe(false);
  });

  it('a plain ADMIN cannot delete a customer', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin()],
      customers: [customer()],
    });

    const result = await deleteCustomer(deps, 'admin_1', 'cust_1');

    expect(result.outcome).toBe('FORBIDDEN');
    const stored = await deps.customers.findById('cust_1');
    expect(stored).not.toBeNull();
  });

  it('returns NOT_FOUND for an unknown customer', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [],
    });

    const result = await deleteCustomer(deps, 'super_1', 'cust_missing');

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('returns FORBIDDEN for an unknown requesting admin', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [],
      customers: [customer()],
    });

    const result = await deleteCustomer(deps, 'admin_missing', 'cust_1');

    expect(result.outcome).toBe('FORBIDDEN');
  });
});
