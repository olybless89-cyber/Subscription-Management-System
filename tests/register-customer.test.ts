import { describe, it, expect } from 'vitest';
import { registerCustomer } from '@/lib/customers/manage';
import { verifyPassword } from '@/lib/auth/password';
import { makeFakeRegisterCustomerDeps } from './fakes';
import { AdminRecord } from '@/types/domain';

function superAdmin(): AdminRecord {
  return { id: 'super_1', name: 'Super', email: 'super@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'SUPER_ADMIN', canManageAdmins: true };
}

describe('registerCustomer', () => {
  it('creates a customer with a real, verifiable password and no admin assignment', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    const result = await registerCustomer(deps, {
      name: 'Chihap Grilled Fish Bar',
      email: 'owner@chihap.example.com',
      password: 'a-real-password-123',
      domainName: 'chihap.com',
    });

    expect(result.outcome).toBe('REGISTERED');
    expect(result.customer?.customerCode).toMatch(/^WOH-\d{6}$/);
    expect(await verifyPassword('a-real-password-123', result.customer!.passwordHash!)).toBe(true);
  });

  it('rejects a password shorter than the minimum length', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    const result = await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'short',
      domainName: 'x.example.com',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects a missing domainName', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    const result = await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: '',
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects a duplicate email', async () => {
    const deps = makeFakeRegisterCustomerDeps({
      admins: [superAdmin()],
      customers: [
        {
          id: 'cust_existing',
          customerCode: 'WOH-000001',
          name: 'Existing',
          email: 'taken@example.com',
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
        },
      ],
    });

    const result = await registerCustomer(deps, {
      name: 'Dup',
      email: 'taken@example.com',
      password: 'a-real-password-123',
      domainName: 'dup.example.com',
    });

    expect(result.outcome).toBe('ALREADY_EXISTS');
  });

  it('defaults notificationEmail to the login email (no separate field in a public form)', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    const result = await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: 'x.example.com',
    });

    expect(result.customer?.notificationEmail).toBe('x@example.com');
  });

  it('attaches the domain, and still registers the customer even if that domain is already taken elsewhere', async () => {
    const deps = makeFakeRegisterCustomerDeps({
      admins: [superAdmin()],
      customers: [],
      domains: [{ id: 'dom_1', customerId: 'some_other_customer', domainName: 'taken.com', isPrimary: true, railwayStatus: null, createdAt: '2026-01-01T00:00:00.000Z' }],
    });

    const result = await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: 'taken.com',
    });

    expect(result.outcome).toBe('REGISTERED');
    expect(result.domainOutcome).toBe('ALREADY_EXISTS');
  });

  it('sends a WELCOME notification to the new customer', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: 'x.example.com',
    });

    expect(deps.notificationLog.some((n) => n.event === 'WELCOME')).toBe(true);
  });

  it('notifies the super admin that a new customer self-registered', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: 'x.example.com',
    });

    expect(deps.adminNotificationLog.some((n) => n.event === 'CUSTOMER_REGISTERED' && n.adminId === 'super_1')).toBe(true);
  });

  it('logs a CUSTOMER_SELF_REGISTERED audit entry attributed to SYSTEM', async () => {
    const deps = makeFakeRegisterCustomerDeps({ admins: [superAdmin()], customers: [] });

    await registerCustomer(deps, {
      name: 'X',
      email: 'x@example.com',
      password: 'a-real-password-123',
      domainName: 'x.example.com',
    });

    const entry = deps.auditLogEntries.find((e) => e.action === 'CUSTOMER_SELF_REGISTERED');
    expect(entry).toBeDefined();
    expect(entry?.actor).toBe('SYSTEM');
  });
});
