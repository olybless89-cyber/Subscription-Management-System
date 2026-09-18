import { RenewalReminderDeps, SendRenewalReminderNowDeps, AdminManagementDeps } from '../db/ports';
import { buildRenewalUrl } from '../customers/renewal-link';

export interface RenewalReminderCronResult {
  checked: number;
  sent: number;
  skipped: number;
  errors: Array<{ subscriptionId: string; message: string }>;
}

function todayDateOnly(now: Date): string {
  // Date-only (no time-of-day) so the idempotency check below is "did we
  // already send one today", not "did we already send one in the last
  // 24 hours" — matches lastRenewalReminderSentAt's doc comment in
  // schema.prisma.
  return now.toISOString().slice(0, 10);
}

function daysUntil(now: Date, target: Date): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  // Compare date-only components (UTC) so "3 days away" means 3
  // calendar days, not a fractional 2.4 that a time-of-day difference
  // would otherwise produce.
  const nowDateOnly = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const targetDateOnly = Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate());
  return Math.round((targetDateOnly - nowDateOnly) / msPerDay);
}

function buildReminderMessage(customerName: string, planName: string, amount: number, currency: string, dueDateIso: string, customerCode: string): string {
  const majorAmount = (amount / 100).toLocaleString();
  const dueDateLabel = new Date(dueDateIso).toLocaleDateString();
  return `Hi ${customerName}, a friendly reminder that your ${planName} subscription (${currency} ${majorAmount}) renews on ${dueDateLabel}. Renew here: ${buildRenewalUrl(customerCode)}`;
}

/**
 * runRenewalReminders — the opt-in, per-subscription renewal-reminder
 * cron modeled on the Digital Web Oracle ICT CRM's cron_reminders.php.
 *
 * Deliberately independent of the existing PAYMENT_DUE/GRACE_PERIOD
 * notifications the suspend/restore engine already sends (see
 * subscription-checker.ts) — this only fires for a subscription whose
 * admin has explicitly opted it in via reminderDaysBeforeDue (see
 * SubscriptionRepository.setReminderDays), so it can never silently
 * double up with the engine's own notifications for a subscription
 * nobody configured this way.
 *
 * Idempotency: lastRenewalReminderSentAt is stamped with today's
 * date-only string after a successful send, and a candidate whose stamp
 * already matches today is skipped — re-running the cron the same day
 * (or a duplicate trigger) never double-sends. Unlike
 * runBirthdayMessages, this one DOES track "already sent today" at the
 * data layer, because unlike a birthday (which naturally only matches
 * once a year), a subscription's due date doesn't change day to day —
 * without this guard every re-run before the due date passes would
 * resend the same reminder.
 */
export async function runRenewalReminders(
  deps: RenewalReminderDeps,
  opts: { now?: Date } = {}
): Promise<RenewalReminderCronResult> {
  const now = opts.now ?? new Date();
  const today = todayDateOnly(now);

  const candidates = await deps.subscriptions.findRenewalReminderCandidates();
  const result: RenewalReminderCronResult = { checked: candidates.length, sent: 0, skipped: 0, errors: [] };

  for (const subscription of candidates) {
    if (subscription.reminderDaysBeforeDue === null) continue; // findRenewalReminderCandidates() already filters this, but stay defensive

    if (subscription.lastRenewalReminderSentAt === today) {
      result.skipped++;
      continue;
    }

    const dueDate = new Date(subscription.nextBillingDate);
    const remaining = daysUntil(now, dueDate);
    if (remaining !== subscription.reminderDaysBeforeDue) continue;

    try {
      const [customer, plan] = await Promise.all([
        deps.customers.findById(subscription.customerId),
        deps.plans.findById(subscription.planId),
      ]);
      if (!customer || !plan) continue; // FK integrity issue elsewhere — nothing to send/stamp.

      await deps.notifications.send(
        customer.id,
        'RENEWAL_REMINDER',
        buildReminderMessage(customer.name, plan.name, plan.amount, plan.currency, subscription.nextBillingDate, customer.customerCode),
        `Renewal reminder: ${plan.name}`
      );
      await deps.subscriptions.markRenewalReminderSent(subscription.id, today);
      result.sent++;
    } catch (err) {
      result.errors.push({
        subscriptionId: subscription.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}

export type SendRenewalReminderNowOutcome = 'SENT' | 'FORBIDDEN' | 'NOT_FOUND' | 'NO_CUSTOMER' | 'NO_PLAN';

export interface SendRenewalReminderNowResult {
  outcome: SendRenewalReminderNowOutcome;
  message: string;
}

/**
 * sendRenewalReminderNow — the manual "Send Reminder" button in the
 * Reminders & Actions hub (see runRenewalReminders's doc comment for the
 * automated counterpart). Sends immediately regardless of
 * reminderDaysBeforeDue/lastRenewalReminderSentAt — a manual send is a
 * deliberate one-off action, not a candidate the daily cron discovered,
 * so none of the automated cron's date-matching or idempotency guard
 * applies here. It still stamps lastRenewalReminderSentAt so the cron
 * won't ALSO send one later today for the same subscription.
 */
export async function sendRenewalReminderNow(
  deps: SendRenewalReminderNowDeps,
  requestingAdminId: string,
  subscriptionId: string
): Promise<SendRenewalReminderNowResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  const customer = await deps.customers.findById(subscription.customerId);
  if (!customer) {
    return { outcome: 'NO_CUSTOMER', message: 'Customer not found for this subscription' };
  }

  const plan = await deps.plans.findById(subscription.planId);
  if (!plan) {
    return { outcome: 'NO_PLAN', message: 'Plan not found for this subscription' };
  }

  const today = todayDateOnly(new Date());

  await deps.notifications.send(
    customer.id,
    'RENEWAL_REMINDER',
    buildReminderMessage(customer.name, plan.name, plan.amount, plan.currency, subscription.nextBillingDate, customer.customerCode),
    `Renewal reminder: ${plan.name}`
  );
  await deps.subscriptions.markRenewalReminderSent(subscription.id, today);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'RENEWAL_REMINDER_SENT_MANUALLY',
    target: subscription.id,
    metadata: { customerId: customer.id },
    result: 'SUCCESS',
  });

  return { outcome: 'SENT', message: 'Reminder sent' };
}

export type SetReminderDaysOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';

export interface SetReminderDaysResult {
  outcome: SetReminderDaysOutcome;
  message: string;
}

/**
 * setSubscriptionReminderDays — the opt-in toggle behind
 * reminderDaysBeforeDue (see schema.prisma and runRenewalReminders's
 * doc comment above). Pass days: null to turn the automated cron off
 * for this subscription — the default for every subscription until an
 * admin explicitly opts it in from the Reminders & Actions hub.
 *
 * Same shape as setSubscriptionDryRunOverride: only checks the
 * requesting admin and that the subscription exists — scope
 * (canAccessCustomer) is checked at the route layer.
 */
export async function setSubscriptionReminderDays(
  deps: Pick<AdminManagementDeps, 'admins' | 'auditLog'> & {
    subscriptions: {
      findById(id: string): Promise<{ id: string } | null>;
      setReminderDays(id: string, days: number | null): Promise<void>;
    };
  },
  requestingAdminId: string,
  subscriptionId: string,
  days: number | null
): Promise<SetReminderDaysResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  if (days !== null && (!Number.isInteger(days) || days < 0 || days > 365)) {
    return { outcome: 'INVALID_INPUT', message: 'days must be a whole number between 0 and 365, or null to turn reminders off' };
  }

  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  await deps.subscriptions.setReminderDays(subscriptionId, days);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'SUBSCRIPTION_REMINDER_DAYS_SET',
    target: subscriptionId,
    metadata: { days },
    result: 'SUCCESS',
  });

  const message =
    days === null
      ? 'Automated renewal reminders turned off for this subscription'
      : `Automated renewal reminder will send ${days} day${days === 1 ? '' : 's'} before each due date`;

  return { outcome: 'UPDATED', message };
}
