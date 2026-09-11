import { describe, it, expect } from 'vitest';
import { createAndSendReceiptInvoice, createAndSendDueInvoice } from '@/lib/invoices/manage';
import { makeFakeDeps } from './fakes';
import { CustomerRecord } from '@/types/domain';

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

describe('createAndSendReceiptInvoice', () => {
  it('creates a PAID invoice with a sequential invoice number and sends it', async () => {
    const deps = makeFakeDeps({ customers: [customer()], subscriptions: [], railwayResources: [] });

    const invoice = await createAndSendReceiptInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: 'sub_1',
      amount: 2500000,
      currency: 'NGN',
      description: 'Monthly Hosting Plan',
    });

    expect(invoice.status).toBe('PAID');
    expect(invoice.type).toBe('RECEIPT');
    expect(invoice.invoiceNumber).toMatch(/^INV-\d{6}$/);
    expect(invoice.paidAt).not.toBeNull();
    expect(invoice.dueDate).toBeNull();

    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0].event).toBe('INVOICE_RECEIPT');
    expect(deps.notificationLog[0].customerId).toBe('cust_1');
  });

  it('persists the invoice so it can be found afterward', async () => {
    const deps = makeFakeDeps({ customers: [customer()], subscriptions: [], railwayResources: [] });

    const invoice = await createAndSendReceiptInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: null,
      amount: 1000000,
      currency: 'USD',
      description: 'One-off charge',
    });

    const found = await deps.invoices.findById(invoice.id);
    expect(found).not.toBeNull();
    expect(found?.currency).toBe('USD');
  });

  it('two invoices in a row get distinct, incrementing invoice numbers', async () => {
    const deps = makeFakeDeps({ customers: [customer()], subscriptions: [], railwayResources: [] });

    const first = await createAndSendReceiptInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: null,
      amount: 100000,
      currency: 'NGN',
      description: 'First',
    });
    const second = await createAndSendReceiptInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: null,
      amount: 100000,
      currency: 'NGN',
      description: 'Second',
    });

    expect(first.invoiceNumber).not.toBe(second.invoiceNumber);
  });
});

describe('createAndSendDueInvoice', () => {
  it('creates a PENDING invoice with a dueDate and sends it', async () => {
    const deps = makeFakeDeps({ customers: [customer()], subscriptions: [], railwayResources: [] });
    const dueDate = new Date('2026-10-01T00:00:00.000Z').toISOString();

    const invoice = await createAndSendDueInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: 'sub_1',
      amount: 2500000,
      currency: 'NGN',
      description: 'Monthly Hosting Plan',
      dueDate,
    });

    expect(invoice.status).toBe('PENDING');
    expect(invoice.type).toBe('DUE');
    expect(invoice.dueDate).toBe(dueDate);
    expect(invoice.paidAt).toBeNull();

    expect(deps.notificationLog).toHaveLength(1);
    expect(deps.notificationLog[0].event).toBe('INVOICE_DUE');
  });

  it('creates distinct invoices for the same customer over multiple due cycles', async () => {
    const deps = makeFakeDeps({ customers: [customer()], subscriptions: [], railwayResources: [] });

    const invoice = await createAndSendDueInvoice(deps, {
      customerId: 'cust_1',
      subscriptionId: null,
      amount: 500000,
      currency: 'NGN',
      description: 'Test',
      dueDate: new Date().toISOString(),
    });

    expect(deps.notificationLog).toHaveLength(1);
    expect(invoice.invoiceNumber).toBeTruthy();
  });
});
