import { describe, it, expect } from 'vitest';
import { parseCustomerCsv, importCustomersFromCsv } from '@/lib/customers/csv-import';
import { makeFakeAdminWorkflowDeps } from './fakes';
import { AdminRecord } from '@/types/domain';

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

describe('parseCustomerCsv', () => {
  it('parses a well-formed CSV with the full column set', () => {
    const csv = [
      'name,email,notificationEmail,domainName,phone,dateOfBirth,websiteType,notes',
      'Chihap Grilled Fish Bar,owner@chihap.example.com,notify@chihap.example.com,chihap.example.com,+2348012345678,1985-03-05,Restaurant,VIP customer',
    ].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.parseErrors).toHaveLength(0);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({
      rowNumber: 1,
      name: 'Chihap Grilled Fish Bar',
      email: 'owner@chihap.example.com',
      notificationEmail: 'notify@chihap.example.com',
      domainName: 'chihap.example.com',
      phone: '+2348012345678',
      dateOfBirth: '1985-03-05',
      websiteType: 'Restaurant',
      notes: 'VIP customer',
    });
  });

  it('defaults notificationEmail to email when the column is blank or missing', () => {
    const csv = ['name,email,domainName', 'Test,test@example.com,test.example.com'].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows[0].notificationEmail).toBe('test@example.com');
  });

  it('handles quoted fields containing commas', () => {
    const csv = [
      'name,email,domainName,notes',
      '"Acme, Inc.",acme@example.com,acme.example.com,"Called twice, no answer"',
    ].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows[0].name).toBe('Acme, Inc.');
    expect(result.rows[0].notes).toBe('Called twice, no answer');
  });

  it('is case-insensitive and order-independent on column headers', () => {
    const csv = ['DOMAINNAME,Email,Name', 'example.com,x@example.com,X'].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.rows[0]).toMatchObject({ name: 'X', email: 'x@example.com', domainName: 'example.com' });
  });

  it('reports a parse error for a row missing a required field, without aborting the rest', () => {
    const csv = [
      'name,email,domainName',
      'Good Row,good@example.com,good.example.com',
      'Missing Email,,missing.example.com',
      'Also Good,also@example.com,also.example.com',
    ].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows).toHaveLength(2);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0].rowNumber).toBe(2);
  });

  it('reports a single top-level parse error when required columns are missing entirely', () => {
    const csv = ['name,phone', 'Test,+123'].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows).toHaveLength(0);
    expect(result.parseErrors).toHaveLength(1);
    expect(result.parseErrors[0].message).toMatch(/name, email, and domainName/);
  });

  it('reports an error for a completely empty file', () => {
    const result = parseCustomerCsv('');

    expect(result.rows).toHaveLength(0);
    expect(result.parseErrors).toHaveLength(1);
  });

  it('skips blank lines between data rows', () => {
    const csv = [
      'name,email,domainName',
      'A,a@example.com,a.example.com',
      '',
      'B,b@example.com,b.example.com',
    ].join('\n');

    const result = parseCustomerCsv(csv);

    expect(result.rows).toHaveLength(2);
  });
});

describe('importCustomersFromCsv', () => {
  it('creates every valid row and auto-assigns each to the importing admin', async () => {
    const deps = makeFakeAdminWorkflowDeps({ admins: [admin()], customers: [], subscriptions: [], plans: [] });

    const { rows } = parseCustomerCsv(
      ['name,email,domainName', 'A,a@example.com,a.example.com', 'B,b@example.com,b.example.com'].join('\n')
    );

    const result = await importCustomersFromCsv(deps, 'admin_1', rows);

    expect(result.created).toBe(2);
    expect(result.errors).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.rows.every((r) => r.outcome === 'CREATED')).toBe(true);

    // Auto-assign mirrors createCustomer()'s existing behavior for a
    // plain (non-SUPER_ADMIN) admin creating a customer manually.
    const created = [...deps.customerStore.values()];
    expect(created).toHaveLength(2);
    for (const customer of created) {
      expect(deps.assignmentStore.get('admin_1')?.has(customer.id)).toBe(true);
    }
  });

  it('carries the notes field through to the created customer', async () => {
    const deps = makeFakeAdminWorkflowDeps({ admins: [admin()], customers: [], subscriptions: [], plans: [] });
    const { rows } = parseCustomerCsv(
      ['name,email,domainName,notes', 'A,a@example.com,a.example.com,Imported from old CRM'].join('\n')
    );

    await importCustomersFromCsv(deps, 'admin_1', rows);

    const created = [...deps.customerStore.values()][0];
    expect(created.notes).toBe('Imported from old CRM');
  });

  it('skips (does not fail the batch on) a row whose email already exists', async () => {
    const deps = makeFakeAdminWorkflowDeps({
      admins: [admin()],
      customers: [
        {
          id: 'cust_existing',
          customerCode: 'WOH-000001',
          name: 'Existing',
          email: 'dup@example.com',
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
        },
      ],
      subscriptions: [],
      plans: [],
    });

    const { rows } = parseCustomerCsv(
      ['name,email,domainName', 'Dup,dup@example.com,dup.example.com', 'New,new@example.com,new.example.com'].join(
        '\n'
      )
    );

    const result = await importCustomersFromCsv(deps, 'admin_1', rows);

    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.rows[0]).toMatchObject({ email: 'dup@example.com', outcome: 'ALREADY_EXISTS' });
  });

  it('continues past a row that fails createCustomer validation (e.g. unknown admin) rather than throwing', async () => {
    const deps = makeFakeAdminWorkflowDeps({ admins: [], customers: [], subscriptions: [], plans: [] });
    const { rows } = parseCustomerCsv(['name,email,domainName', 'A,a@example.com,a.example.com'].join('\n'));

    const result = await importCustomersFromCsv(deps, 'admin_missing', rows);

    expect(result.created).toBe(0);
    expect(result.errors).toBe(1);
    expect(result.rows[0].outcome).toBe('FORBIDDEN');
  });
});
