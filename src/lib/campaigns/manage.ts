import { CampaignDeps } from '../db/ports';
import { CampaignRecord, CampaignChannel } from '@/types/domain';

export interface CreateCampaignInput {
  name: string;
  channels: CampaignChannel[];
  subject?: string;
  message: string;
  customerIds: string[];
}

export type CreateCampaignOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'OUT_OF_SCOPE';

export interface CreateCampaignResult {
  outcome: CreateCampaignOutcome;
  message: string;
  campaign?: CampaignRecord;
}

/**
 * createCampaign — manual recipient selection only (a checkbox list of
 * customers), not a saved segment/filter query — an explicit decision
 * to keep this predictable. Creates the Campaign as DRAFT plus one
 * CampaignRecipient row per (customer, channel) pair — a customer on an
 * ["EMAIL","WHATSAPP"] campaign gets two rows, so per-channel delivery
 * can be tracked independently later. Does NOT send anything — see
 * sendCampaign for that, a deliberately separate step so a
 * long/expensive recipient list can be reviewed before committing.
 *
 * Scope: same as customer creation — any admin can create a campaign,
 * but every customerId must be one they can already see. SUPER_ADMIN
 * can target anyone.
 */
export async function createCampaign(
  deps: CampaignDeps,
  requestingAdminId: string,
  input: CreateCampaignInput
): Promise<CreateCampaignResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const name = input.name?.trim();
  if (!name) {
    return { outcome: 'INVALID_INPUT', message: 'name is required' };
  }
  if (!input.channels || input.channels.length === 0) {
    return { outcome: 'INVALID_INPUT', message: 'At least one channel (EMAIL or WHATSAPP) is required' };
  }
  if (input.channels.includes('EMAIL') && !input.subject?.trim()) {
    return { outcome: 'INVALID_INPUT', message: 'subject is required when EMAIL is one of the channels' };
  }
  const message = input.message?.trim();
  if (!message) {
    return { outcome: 'INVALID_INPUT', message: 'message is required' };
  }
  const customerIds = [...new Set(input.customerIds ?? [])];
  if (customerIds.length === 0) {
    return { outcome: 'INVALID_INPUT', message: 'Select at least one customer' };
  }

  const foundCustomers = await deps.customers.findByIds(customerIds);
  if (foundCustomers.length !== customerIds.length) {
    const foundIds = new Set(foundCustomers.map((c) => c.id));
    const missing = customerIds.filter((id) => !foundIds.has(id));
    return { outcome: 'INVALID_INPUT', message: `Unknown customer id(s): ${missing.join(', ')}` };
  }

  if (requester.role !== 'SUPER_ADMIN') {
    const visible = new Set(await deps.adminAssignments.listCustomerIdsForAdmin(requestingAdminId));
    const outOfScope = customerIds.filter((id) => !visible.has(id));
    if (outOfScope.length > 0) {
      return {
        outcome: 'OUT_OF_SCOPE',
        message: `You can only send campaigns to customers you can see yourself. Not visible to you: ${outOfScope.join(', ')}`,
      };
    }
  }

  const campaign = await deps.campaigns.create({
    name,
    channels: input.channels,
    subject: input.channels.includes('EMAIL') ? input.subject!.trim() : null,
    message,
    createdBy: requestingAdminId,
  });

  const recipients = customerIds.flatMap((customerId) =>
    input.channels.map((channel) => ({ customerId, channel }))
  );
  await deps.campaigns.addRecipients(campaign.id, recipients);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CAMPAIGN_CREATED',
    target: campaign.id,
    metadata: { name, channels: input.channels, recipientCount: customerIds.length },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Campaign created', campaign };
}

export type SendCampaignOutcome = 'SENT' | 'FORBIDDEN' | 'NOT_FOUND' | 'ALREADY_SENT';

export interface SendCampaignResult {
  outcome: SendCampaignOutcome;
  message: string;
  sent: number;
  failed: number;
}

/**
 * sendCampaign — dispatches every recipient of a DRAFT campaign, one at
 * a time, synchronously within this call (no background job queue
 * exists in this codebase — acceptable for a small-to-medium customer
 * list, but a genuinely large one could hit a request timeout; flagged
 * in the README rather than silently assumed away). Each recipient's
 * send is wrapped individually — one failure never stops the rest of
 * the list, and never undoes recipients already sent.
 *
 * Only the campaign's creator or a SUPER_ADMIN can send it.
 */
export async function sendCampaign(
  deps: CampaignDeps,
  requestingAdminId: string,
  campaignId: string
): Promise<SendCampaignResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found', sent: 0, failed: 0 };
  }

  const campaign = await deps.campaigns.findById(campaignId);
  if (!campaign) {
    return { outcome: 'NOT_FOUND', message: 'Campaign not found', sent: 0, failed: 0 };
  }

  if (requester.role !== 'SUPER_ADMIN' && campaign.createdBy !== requestingAdminId) {
    return { outcome: 'FORBIDDEN', message: 'Only the campaign creator or the super admin can send it', sent: 0, failed: 0 };
  }

  if (campaign.status !== 'DRAFT') {
    return { outcome: 'ALREADY_SENT', message: `Campaign is already ${campaign.status}`, sent: 0, failed: 0 };
  }

  await deps.campaigns.updateStatus(campaignId, 'SENDING');

  const recipients = await deps.campaigns.findRecipientsByCampaignId(campaignId);
  let sent = 0;
  let failed = 0;

  for (const recipient of recipients) {
    try {
      if (recipient.channel === 'EMAIL') {
        await deps.notifications.send(recipient.customerId, 'CAMPAIGN', campaign.message, campaign.subject ?? undefined);
      } else {
        await deps.whatsapp.send(recipient.customerId, campaign.message);
      }
      await deps.campaigns.updateRecipientStatus(recipient.id, 'SENT', { sentAt: new Date().toISOString() });
      sent++;
    } catch (err) {
      await deps.campaigns.updateRecipientStatus(recipient.id, 'FAILED', {
        error: err instanceof Error ? err.message : 'Unknown error',
      });
      failed++;
    }
  }

  await deps.campaigns.updateStatus(campaignId, 'SENT', { sentAt: new Date().toISOString() });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CAMPAIGN_SENT',
    target: campaignId,
    metadata: { sent, failed },
    result: 'SUCCESS',
  });

  return { outcome: 'SENT', message: `Sent to ${sent} recipient(s), ${failed} failed`, sent, failed };
}
