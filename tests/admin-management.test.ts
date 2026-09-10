import { describe, it, expect } from 'vitest';
import { createAdmin, setCustomerAssignments } from '@/lib/admin/manage';
import { makeFakeAdminManagementDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    name: 'Test Admin',
    email: 'super@dwo.example',
    passwordHash: 'irrelevant-for-these-tests',
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
    passwordHash: 'irrelevant-for-these-tests',
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
    passwordHash: null,
    status: 'ACTIVE',
    automaticSuspension: true,
    paymentProvider: 'PAYSTACK',
    ...overrides,
  };
}

describe('createAdmin', () => {
  it('SUPER_ADMIN can create a plain admin', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createAdmin(deps, 'super_1', {
      name: 'New Admin',
      email: 'new@dwo.example',
      password: 'a-strong-password-123',
      role: 'ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.admin?.email).toBe('new@dwo.example');
    expect(deps.auditLogEntries).toHaveLength(1);
    expect(deps.auditLogEntries[0].action).toBe('ADMIN_CREATED');
  });

  it('SUPER_ADMIN can create another SUPER_ADMIN', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createAdmin(deps, 'super_1', {
      name: 'Second Super',
      email: 'super2@dwo.example',
      password: 'a-strong-password-123',
      role: 'SUPER_ADMIN',
      canManageAdmins: true,
    });

    expect(result.outcome).toBe('CREATED');
  });

  it('a plain admin with no delegated permission cannot create any admin', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ canManageAdmins: false })],
      customers: [],
    });

    const result = await createAdmin(deps, 'admin_1', {
      name: 'Nope',
      email: 'nope@dwo.example',
      password: 'a-strong-password-123',
      role: 'ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('a delegated admin (canManageAdmins=true) CAN create a plain admin...', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ canManageAdmins: true })],
      customers: [],
    });

    const result = await createAdmin(deps, 'admin_1', {
      name: 'Junior Admin',
      email: 'junior@dwo.example',
      password: 'a-strong-password-123',
      role: 'ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('CREATED');
  });

  it('...but CANNOT create a SUPER_ADMIN, even with canManageAdmins=true', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ canManageAdmins: true })],
      customers: [],
    });

    const result = await createAdmin(deps, 'admin_1', {
      name: 'Trying to escalate',
      email: 'escalate@dwo.example',
      password: 'a-strong-password-123',
      role: 'SUPER_ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('...and CANNOT grant canManageAdmins=true to a new admin either', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ canManageAdmins: true })],
      customers: [],
    });

    const result = await createAdmin(deps, 'admin_1', {
      name: 'Trying to spread privilege',
      email: 'spread@dwo.example',
      password: 'a-strong-password-123',
      role: 'ADMIN',
      canManageAdmins: true,
    });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('rejects a duplicate email', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin({ email: 'taken@dwo.example' })],
      customers: [],
    });

    const result = await createAdmin(deps, 'super_1', {
      name: 'Dup',
      email: 'taken@dwo.example',
      password: 'a-strong-password-123',
      role: 'ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('ALREADY_EXISTS');
  });

  it('rejects a weak password', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createAdmin(deps, 'super_1', {
      name: 'Weak',
      email: 'weak@dwo.example',
      password: 'short',
      role: 'ADMIN',
      canManageAdmins: false,
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });
});

describe('setCustomerAssignments', () => {
  it('SUPER_ADMIN can assign a valid set of customers to an admin', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
    });

    const result = await setCustomerAssignments(deps, 'super_1', 'admin_1', ['cust_1', 'cust_2']);

    expect(result.outcome).toBe('UPDATED');
    expect(deps.assignmentStore.get('admin_1')).toEqual(new Set(['cust_1', 'cust_2']));
    expect(deps.auditLogEntries.some((e) => e.action === 'ADMIN_ASSIGNMENTS_UPDATED')).toBe(true);
  });

  it('rejects unknown customer ids without partially applying the assignment', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin()],
      customers: [customer({ id: 'cust_1' })],
    });

    const result = await setCustomerAssignments(deps, 'super_1', 'admin_1', ['cust_1', 'cust_does_not_exist']);

    expect(result.outcome).toBe('INVALID_CUSTOMER_IDS');
    expect(deps.assignmentStore.get('admin_1')).toBeUndefined();
  });

  it('replaces the assignment set rather than adding to it', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_1' }],
    });

    await setCustomerAssignments(deps, 'super_1', 'admin_1', ['cust_2']);

    expect(deps.assignmentStore.get('admin_1')).toEqual(new Set(['cust_2']));
  });

  it('a plain admin without delegated permission cannot change assignments', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [plainAdmin({ id: 'admin_1', canManageAdmins: false }), plainAdmin({ id: 'admin_2', email: 'a2@dwo.example' })],
      customers: [customer()],
    });

    const result = await setCustomerAssignments(deps, 'admin_1', 'admin_2', ['cust_1']);

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('a delegated (non-SUPER_ADMIN) admin-manager cannot grant visibility into a customer they cannot see themselves', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [
        plainAdmin({ id: 'manager_1', canManageAdmins: true }),
        plainAdmin({ id: 'sub_admin_1', email: 'sub@dwo.example' }),
      ],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
      // manager_1 can only see cust_1, NOT cust_2.
      assignments: [{ adminId: 'manager_1', customerId: 'cust_1' }],
    });

    const result = await setCustomerAssignments(deps, 'manager_1', 'sub_admin_1', ['cust_2']);

    expect(result.outcome).toBe('OUT_OF_SCOPE');
    // Nothing was applied — not even the customer the manager COULD see.
    expect(deps.assignmentStore.get('sub_admin_1')).toBeUndefined();
  });

  it('a delegated admin-manager CAN grant visibility into a customer within their own scope', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [
        plainAdmin({ id: 'manager_1', canManageAdmins: true }),
        plainAdmin({ id: 'sub_admin_1', email: 'sub@dwo.example' }),
      ],
      customers: [customer({ id: 'cust_1' })],
      assignments: [{ adminId: 'manager_1', customerId: 'cust_1' }],
    });

    const result = await setCustomerAssignments(deps, 'manager_1', 'sub_admin_1', ['cust_1']);

    expect(result.outcome).toBe('UPDATED');
    expect(deps.assignmentStore.get('sub_admin_1')).toEqual(new Set(['cust_1']));
  });

  it('SUPER_ADMIN is exempt from the scope check — can assign any customer regardless of their own assignment rows', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin(), plainAdmin()],
      customers: [customer({ id: 'cust_1' })],
      // super_1 has NO explicit assignment rows at all (doesn't need any).
      assignments: [],
    });

    const result = await setCustomerAssignments(deps, 'super_1', 'admin_1', ['cust_1']);

    expect(result.outcome).toBe('UPDATED');
  });
});
