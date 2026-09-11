import { describe, it, expect } from 'vitest';
import { runBirthdayMessages } from '@/lib/customers/birthday';
import { makeFakeCustomEmailDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function admin(): AdminRecord {
  return {
    id: 'admin_1',
    name: 'Test Admin',
    email: 'admin@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'ADMIN',
    canManageAdmins: false,
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

describe('runBirthdayMessages', () => {
  it("sends to a customer whose birthday month/day matches today, regardless of birth year", async () => {
    const deps = makeFakeCustomEmailDeps({
      admins: [admin()],
      customers: [customer({ id: 'cust_1', dateOfBirth: '1985-03-05T00:00:00.000Z' })],
    });

    const result = await runBirthdayMessages(deps, { now: new Date('2026-03-05T07:00:00.000Z') });

    expect(result.sent).toBe(1);
    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0]).toMatchObject({ customerId: 'cust_1', event: 'BIRTHDAY' });
  });

  it('does not send to a customer whose birthday is a different day', async () => {
    const deps = makeFakeCustomEmailDeps({
      admins: [admin()],
      customers: [customer({ id: 'cust_1', dateOfBirth: '1985-03-06T00:00:00.000Z' })],
    });

    const result = await runBirthdayMessages(deps, { now: new Date('2026-03-05T07:00:00.000Z') });

    expect(result.sent).toBe(0);
    expect(deps.notificationLog).toHaveLength(0);
  });

  it('skips customers with no dateOfBirth set at all', async () => {
    const deps = makeFakeCustomEmailDeps({
      admins: [admin()],
      customers: [customer({ id: 'cust_1', dateOfBirth: null })],
    });

    const result = await runBirthdayMessages(deps, { now: new Date('2026-03-05T07:00:00.000Z') });

    expect(result.checked).toBe(0); // findWithBirthday() already excludes it
    expect(result.sent).toBe(0);
  });

  it('sends to multiple matching customers in one run and reports the count checked', async () => {
    const deps = makeFakeCustomEmailDeps({
      admins: [admin()],
      customers: [
        customer({ id: 'cust_1', email: 'a@example.com', dateOfBirth: '1990-07-04T00:00:00.000Z' }),
        customer({ id: 'cust_2', email: 'b@example.com', dateOfBirth: '2000-07-04T00:00:00.000Z' }),
        customer({ id: 'cust_3', email: 'c@example.com', dateOfBirth: '1990-07-05T00:00:00.000Z' }),
      ],
    });

    const result = await runBirthdayMessages(deps, { now: new Date('2026-07-04T07:00:00.000Z') });

    expect(result.checked).toBe(3);
    expect(result.sent).toBe(2);
  });
});
