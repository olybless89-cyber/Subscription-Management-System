import { describe, it, expect } from 'vitest';
import { createCustomer } from '@/lib/customers/manage';
import { makeFakeAdminManagementDeps } from './fakes';
import { AdminRecord } from '@/types/domain';

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    email: 'super@dwo.example',
    passwordHash: 'x',
    role: 'SUPER_ADMIN',
    canManageAdmins: true,
    ...overrides,
  };
}

function plainAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'admin_1',
    email: 'admin@dwo.example',
    passwordHash: 'x',
    role: 'ADMIN',
    canManageAdmins: false,
    ...overrides,
  };
}

describe('createCustomer', () => {
  it('creates a customer with defaults (PAYSTACK, automaticSuspension true)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'Chihap Grilled Fish Bar',
      email: 'chihap@example.com',
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.customer?.paymentProvider).toBe('PAYSTACK');
    expect(result.customer?.automaticSuspension).toBe(true);
    expect(result.customer?.customerCode).toMatch(/^WOH-\d{6}$/);
  });

  it('respects an explicit paymentProvider and automaticSuspension', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'Enterprise Client',
      email: 'enterprise@example.com',
      paymentProvider: 'FLUTTERWAVE',
      automaticSuspension: false,
    });

    expect(result.customer?.paymentProvider).toBe('FLUTTERWAVE');
    expect(result.customer?.automaticSuspension).toBe(false);
  });

  it('rejects a duplicate email', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [
        {
          id: 'cust_existing',
          customerCode: 'WOH-000001',
          email: 'taken@example.com',
          passwordHash: null,
          status: 'ACTIVE',
          automaticSuspension: true,
          paymentProvider: 'PAYSTACK',
        },
      ],
    });

    const result = await createCustomer(deps, 'super_1', {
      name: 'Dup',
      email: 'taken@example.com',
    });

    expect(result.outcome).toBe('ALREADY_EXISTS');
  });

  it('rejects missing name/email', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const noName = await createCustomer(deps, 'super_1', { name: '', email: 'x@example.com' });
    const badEmail = await createCustomer(deps, 'super_1', { name: 'X', email: 'not-an-email' });

    expect(noName.outcome).toBe('INVALID_INPUT');
    expect(badEmail.outcome).toBe('INVALID_INPUT');
  });

  it('auto-assigns a scoped (non-super) admin to the customer they created', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [plainAdmin()], customers: [] });

    const result = await createCustomer(deps, 'admin_1', {
      name: 'Mabfaro Nigeria Limited',
      email: 'mabfaro@example.com',
    });

    expect(result.outcome).toBe('CREATED');
    expect(deps.assignmentStore.get('admin_1')?.has(result.customer!.id)).toBe(true);
  });

  it('does NOT create a redundant assignment row for a SUPER_ADMIN (they see everyone anyway)', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'Some Customer',
      email: 'some@example.com',
    });

    expect(deps.assignmentStore.get('super_1')).toBeUndefined();
    expect(result.outcome).toBe('CREATED');
  });

  it('logs a CUSTOMER_CREATED audit entry', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    await createCustomer(deps, 'super_1', { name: 'Audit Me', email: 'audit@example.com' });

    expect(deps.auditLogEntries.some((e) => e.action === 'CUSTOMER_CREATED')).toBe(true);
  });
});
