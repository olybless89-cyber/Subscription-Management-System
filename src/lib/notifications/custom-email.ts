import { CustomEmailDeps } from '../db/ports';

export interface SendCustomEmailInput {
  customerId: string;
  subject: string;
  message: string;
}

export type SendCustomEmailOutcome = 'SENT' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';

export interface SendCustomEmailResult {
  outcome: SendCustomEmailOutcome;
  message: string;
}

/**
 * sendCustomEmail — the admin-composed notification feature. Goes
 * through the exact same NotificationSender.send() pipeline as every
 * automated notification (webhook, suspension, cron) — same
 * Notification-row-first, best-effort-dispatch-on-top behavior, same
 * `notificationEmail ?? email` address resolution — just with an
 * admin-supplied subject/body instead of one of the fixed event types.
 * `event` is recorded as `'CUSTOM'` so these are distinguishable from
 * automated notifications in the customer's own notification history.
 *
 * Scope check (canAccessCustomer) happens at the route layer, same
 * pattern as checkout/suspend/restore — this function only checks that
 * the requesting admin exists.
 */
export async function sendCustomEmail(
  deps: CustomEmailDeps,
  requestingAdminId: string,
  input: SendCustomEmailInput
): Promise<SendCustomEmailResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(input.customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  const subject = input.subject?.trim();
  const message = input.message?.trim();
  if (!subject) {
    return { outcome: 'INVALID_INPUT', message: 'subject is required' };
  }
  if (!message) {
    return { outcome: 'INVALID_INPUT', message: 'message is required' };
  }

  await deps.notifications.send(input.customerId, 'CUSTOM', message, subject);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOM_EMAIL_SENT',
    target: input.customerId,
    metadata: { subject },
    result: 'SUCCESS',
  });

  return { outcome: 'SENT', message: 'Email sent' };
}
