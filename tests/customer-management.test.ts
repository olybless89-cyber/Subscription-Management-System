import { describe, it, expect } from 'vitest';
import { createCustomer, updateCustomer } from '@/lib/customers/manage';
import { sendCustomEmail } from '@/lib/notifications/custom-email';
import { makeFakeAdminManagementDeps, makeFakeCustomEmailDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    name: 'Test Admin',
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
    name: 'Test Customer',
    email: 'customer@example.com',
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
          name: 'Test Customer',
          email: 'taken@example.com',
          notificationEmail: null,
          phone: null,
          dateOfBirth: null,
          serviceStartDate: null,
          serviceEndDate: null,
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

  it('accepts notificationEmail, phone, dateOfBirth, serviceStartDate, serviceEndDate', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'Full Fields',
      email: 'login@example.com',
      notificationEmail: 'notify@example.com',
      phone: '+2348012345678',
      dateOfBirth: '1990-05-15',
      serviceStartDate: '2026-01-01',
      serviceEndDate: '2027-01-01',
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.customer?.notificationEmail).toBe('notify@example.com');
    expect(result.customer?.phone).toBe('+2348012345678');
    expect(result.customer?.dateOfBirth).toBe('1990-05-15');
  });

  it('rejects an invalid notificationEmail', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'X',
      email: 'x@example.com',
      notificationEmail: 'not-an-email',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects an unparseable date field', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'X',
      email: 'x@example.com',
      dateOfBirth: 'not-a-date',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
    expect(result.message).toMatch(/dateOfBirth/);
  });

  it('rejects serviceEndDate before serviceStartDate', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await createCustomer(deps, 'super_1', {
      name: 'X',
      email: 'x@example.com',
      serviceStartDate: '2027-01-01',
      serviceEndDate: '2026-01-01',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });
});

describe('updateCustomer', () => {
  it('updates the requested fields and leaves others untouched', async () => {
    const deps = makeFakeAdminManagementDeps({
      admins: [superAdmin()],
      customers: [customer({ phone: '+1000' })],
    });

    const result = await updateCustomer(deps, 'super_1', 'cust_1', {
      notificationEmail: 'new@example.com',
    });

    expect(result.outcome).toBe('UPDATED');
    expect(result.customer?.notificationEmail).toBe('new@example.com');
    expect(result.customer?.phone).toBe('+1000'); // untouched
  });

  it('rejects an unknown customer', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [] });

    const result = await updateCustomer(deps, 'super_1', 'nope', { name: 'X' });

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('returns NO_CHANGES for an empty patch rather than a false success', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await updateCustomer(deps, 'super_1', 'cust_1', {});

    expect(result.outcome).toBe('NO_CHANGES');
  });

  it('rejects an invalid date on update the same as on create', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await updateCustomer(deps, 'super_1', 'cust_1', { serviceStartDate: 'garbage' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('logs a CUSTOMER_UPDATED audit entry naming which fields changed', async () => {
    const deps = makeFakeAdminManagementDeps({ admins: [superAdmin()], customers: [customer()] });

    await updateCustomer(deps, 'super_1', 'cust_1', { phone: '+2340000000' });

    const entry = deps.auditLogEntries.find((e) => e.action === 'CUSTOMER_UPDATED');
    expect(entry).toBeDefined();
    expect((entry?.metadata as { fields: string[] })?.fields).toContain('phone');
  });
});

describe('sendCustomEmail', () => {
  it('sends through the notification pipeline with the admin-supplied subject', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [plainAdmin()], customers: [customer()] });

    const result = await sendCustomEmail(deps, 'admin_1', {
      customerId: 'cust_1',
      subject: 'Special offer just for you',
      message: 'Renew this month and get 10% off.',
    });

    expect(result.outcome).toBe('SENT');
    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0]).toMatchObject({
      customerId: 'cust_1',
      event: 'CUSTOM',
      message: 'Renew this month and get 10% off.',
      subject: 'Special offer just for you',
    });
  });

  it('rejects an empty subject or message', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [plainAdmin()], customers: [customer()] });

    const noSubject = await sendCustomEmail(deps, 'admin_1', { customerId: 'cust_1', subject: '  ', message: 'hi' });
    const noMessage = await sendCustomEmail(deps, 'admin_1', { customerId: 'cust_1', subject: 'hi', message: '  ' });

    expect(noSubject.outcome).toBe('INVALID_INPUT');
    expect(noMessage.outcome).toBe('INVALID_INPUT');
    expect(deps.notificationLog).toHaveLength(0);
  });

  it('rejects an unknown customer', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [plainAdmin()], customers: [] });

    const result = await sendCustomEmail(deps, 'admin_1', { customerId: 'nope', subject: 'hi', message: 'hi' });

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('logs a CUSTOM_EMAIL_SENT audit entry', async () => {
    const deps = makeFakeCustomEmailDeps({ admins: [plainAdmin()], customers: [customer()] });

    await sendCustomEmail(deps, 'admin_1', { customerId: 'cust_1', subject: 'Hi', message: 'Hello there' });

    expect(deps.auditLogEntries.some((e) => e.action === 'CUSTOM_EMAIL_SENT')).toBe(true);
  });
});
