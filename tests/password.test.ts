import { describe, it, expect } from 'vitest';
import { changeOwnPassword, resetAdminPassword, resetCustomerPassword } from '@/lib/admin/password';
import { verifyPassword, hashPassword } from '@/lib/auth/password';
import { makeFakeAdminManagementDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

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

describe('changeOwnPassword', () => {
  it('changes the password when the current password is correct', async () => {
    const oldHash = await hashPassword('old-password-123');
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: oldHash, passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [],
    });

    const result = await changeOwnPassword(deps, 'admin_1', 'old-password-123', 'brand-new-password-456');

    expect(result.outcome).toBe('CHANGED');
    const updated = await deps.admins.findById('admin_1');
    expect(await verifyPassword('brand-new-password-456', updated!.passwordHash)).toBe(true);
    expect(updated!.passwordChangedAt).not.toBeNull();
  });

  it('rejects the wrong current password without changing anything', async () => {
    const oldHash = await hashPassword('old-password-123');
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: oldHash, passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [],
    });

    const result = await changeOwnPassword(deps, 'admin_1', 'totally-wrong', 'brand-new-password-456');

    expect(result.outcome).toBe('WRONG_CURRENT_PASSWORD');
    const unchanged = await deps.admins.findById('admin_1');
    expect(unchanged!.passwordHash).toBe(oldHash);
  });

  it('rejects a new password shorter than the minimum length', async () => {
    const oldHash = await hashPassword('old-password-123');
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: oldHash, passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [],
    });

    const result = await changeOwnPassword(deps, 'admin_1', 'old-password-123', 'short');

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('logs an ADMIN_PASSWORD_CHANGED_SELF audit entry', async () => {
    const oldHash = await hashPassword('old-password-123');
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: oldHash, passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [],
    });

    await changeOwnPassword(deps, 'admin_1', 'old-password-123', 'brand-new-password-456');

    expect(deps.auditLogEntries.some((e) => e.action === 'ADMIN_PASSWORD_CHANGED_SELF')).toBe(true);
  });
});

describe('resetAdminPassword', () => {
  function superAdmin(): AdminRecord {
    return { id: 'super_1', name: 'Super', email: 'super@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'SUPER_ADMIN', canManageAdmins: true };
  }
  function plainAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
    return { id: 'admin_1', name: 'Plain', email: 'plain@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false, ...overrides };
  }

  it('SUPER_ADMIN can reset another admin\'s password with no proof of the old one', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin(), plainAdmin()], customers: [] });

    const result = await resetAdminPassword(deps, 'super_1', 'admin_1', 'freshly-reset-password');

    expect(result.outcome).toBe('CHANGED');
    const updated = await deps.admins.findById('admin_1');
    expect(await verifyPassword('freshly-reset-password', updated!.passwordHash)).toBe(true);
  });

  it('a delegated (canManageAdmins) non-SUPER_ADMIN cannot reset another admin\'s password', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ id: 'manager_1', canManageAdmins: true }), plainAdmin({ id: 'admin_2', email: 'a2@dwo.example' })],
      customers: [],
    });

    const result = await resetAdminPassword(deps, 'manager_1', 'admin_2', 'freshly-reset-password');

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('a plain admin cannot reset their own password via this path (must use changeOwnPassword)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [plainAdmin()], customers: [] });

    const result = await resetAdminPassword(deps, 'admin_1', 'admin_1', 'freshly-reset-password');

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('rejects an unknown target admin', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await resetAdminPassword(deps, 'super_1', 'nope', 'freshly-reset-password');

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('logs an ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN audit entry naming the target', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin(), plainAdmin()], customers: [] });

    await resetAdminPassword(deps, 'super_1', 'admin_1', 'freshly-reset-password');

    const entry = deps.auditLogEntries.find((e) => e.action === 'ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN');
    expect(entry).toBeDefined();
    expect(entry?.target).toBe('admin_1');
  });
});

describe('resetCustomerPassword', () => {
  it('any admin with access can reset a customer\'s password', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [customer()],
    });

    const result = await resetCustomerPassword(deps, 'admin_1', 'cust_1', 'new-customer-password');

    expect(result.outcome).toBe('CHANGED');
    const updated = await deps.customers.findById('cust_1');
    expect(await verifyPassword('new-customer-password', updated!.passwordHash!)).toBe(true);
  });

  it('rejects an unknown customer', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [],
    });

    const result = await resetCustomerPassword(deps, 'admin_1', 'nope', 'new-customer-password');

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('rejects a new password shorter than the minimum length', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [{ id: 'admin_1', name: 'A', email: 'a@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false }],
      customers: [customer()],
    });

    const result = await resetCustomerPassword(deps, 'admin_1', 'cust_1', 'short');

    expect(result.outcome).toBe('INVALID_INPUT');
  });
});
