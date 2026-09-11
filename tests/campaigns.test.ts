import { describe, it, expect } from 'vitest';
import { createCampaign, sendCampaign } from '@/lib/campaigns/manage';
import { makeFakeCampaignDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

function superAdmin(): AdminRecord {
  return { id: 'super_1', name: 'Super', email: 'super@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'SUPER_ADMIN', canManageAdmins: true };
}
function plainAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return { id: 'admin_1', name: 'Plain', email: 'plain@dwo.example', passwordHash: 'x', passwordChangedAt: null, role: 'ADMIN', canManageAdmins: false, ...overrides };
}
function customer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    name: 'Test Customer',
    email: 'customer@example.com',
    notificationEmail: null,
    phone: '+2348012345678',
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

describe('createCampaign', () => {
  it('creates a DRAFT campaign with one recipient row per customer per channel', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [superAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
    });

    const result = await createCampaign(deps, 'super_1', {
      name: 'September promo',
      channels: ['EMAIL', 'WHATSAPP'],
      subject: 'A special offer',
      message: 'Renew this month and save.',
      customerIds: ['cust_1', 'cust_2'],
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.campaign?.status).toBe('DRAFT');
    const recipients = [...deps.recipientStore.values()];
    expect(recipients).toHaveLength(4);
  });

  it('requires a subject when EMAIL is one of the channels', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['EMAIL'],
      message: 'hi',
      customerIds: ['cust_1'],
    });

    expect(result.outcome).toBe('INVALID_INPUT');
    expect(result.message).toMatch(/subject/);
  });

  it('does not require a subject for a WHATSAPP-only campaign', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1'],
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.campaign?.subject).toBeNull();
  });

  it('rejects an unknown customer id', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1', 'nope'],
    });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('a plain admin cannot target a customer outside their own scope', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [plainAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_1' }],
    });

    const result = await createCampaign(deps, 'admin_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1', 'cust_2'],
    });

    expect(result.outcome).toBe('OUT_OF_SCOPE');
  });

  it('a plain admin CAN target customers within their own scope', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [plainAdmin()],
      customers: [customer()],
      assignments: [{ adminId: 'admin_1', customerId: 'cust_1' }],
    });

    const result = await createCampaign(deps, 'admin_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1'],
    });

    expect(result.outcome).toBe('CREATED');
  });

  it('SUPER_ADMIN is exempt from the scope check', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });

    const result = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1'],
    });

    expect(result.outcome).toBe('CREATED');
  });
});

describe('sendCampaign', () => {
  it('sends to every recipient and marks the campaign SENT', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [superAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
    });
    const created = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['EMAIL', 'WHATSAPP'],
      subject: 'Hi',
      message: 'Hello there',
      customerIds: ['cust_1', 'cust_2'],
    });

    const result = await sendCampaign(deps, 'super_1', created.campaign!.id);

    expect(result.outcome).toBe('SENT');
    expect(result.sent).toBe(4);
    expect(result.failed).toBe(0);
    expect(deps.notificationLog).toHaveLength(2);
    expect(deps.whatsappLog).toHaveLength(2);
    const campaign = await deps.campaigns.findById(created.campaign!.id);
    expect(campaign!.status).toBe('SENT');
  });

  it('one recipient failure never stops the rest, and is recorded as FAILED', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [superAdmin()],
      customers: [customer({ id: 'cust_1' }), customer({ id: 'cust_2', email: 'c2@example.com' })],
    });
    const created = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'Hello',
      customerIds: ['cust_1', 'cust_2'],
    });
    let callCount = 0;
    deps.whatsapp.send = async () => {
      callCount++;
      if (callCount === 1) throw new Error('simulated WhatsApp failure');
    };

    const result = await sendCampaign(deps, 'super_1', created.campaign!.id);

    expect(result.sent).toBe(1);
    expect(result.failed).toBe(1);
    const recipients = [...deps.recipientStore.values()];
    expect(recipients.some((r) => r.status === 'FAILED')).toBe(true);
    expect(recipients.some((r) => r.status === 'SENT')).toBe(true);
  });

  it('only the creator or SUPER_ADMIN can send a campaign', async () => {
    const deps = makeFakeCampaignDeps({
      admins: [superAdmin(), plainAdmin({ id: 'other_admin', email: 'other@dwo.example' })],
      customers: [customer()],
    });
    const created = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1'],
    });

    const result = await sendCampaign(deps, 'other_admin', created.campaign!.id);

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('rejects sending an already-sent campaign twice', async () => {
    const deps = makeFakeCampaignDeps({ admins: [superAdmin()], customers: [customer()] });
    const created = await createCampaign(deps, 'super_1', {
      name: 'X',
      channels: ['WHATSAPP'],
      message: 'hi',
      customerIds: ['cust_1'],
    });
    await sendCampaign(deps, 'super_1', created.campaign!.id);

    const secondAttempt = await sendCampaign(deps, 'super_1', created.campaign!.id);

    expect(secondAttempt.outcome).toBe('ALREADY_SENT');
  });
});
