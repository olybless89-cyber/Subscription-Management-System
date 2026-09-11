import { CronDeps } from '../db/ports';
import { RailwayClient } from '../railway/client';
import { suspendCustomer } from '../suspension/engine';
import { addDays } from '../billing/cycle';
import { notifyAdminsForCustomer } from '../notifications/admin-notify';
import { createAndSendDueInvoice } from '../invoices/manage';

export interface SubscriptionCheckerOptions {
  now?: Date;
  dryRun?: boolean;
}

export interface SubscriptionCheckerResult {
  checked: number;
  movedToPaymentDue: number;
  movedToGracePeriod: number;
  suspended: number;
  skipped: number;
  errors: Array<{ subscriptionId: string; message: string }>;
}

/**
 * runSubscriptionChecker — spec sections 21 (hourly cron) and 22 (the
 * transition rules). Idempotent by construction: each branch only fires
 * if the subscription is still in the state it's checking for, so
 * running this twice on the same tick just re-confirms "nothing to do"
 * the second time rather than double-transitioning anything.
 *
 * Does not call Railway directly — GRACE_PERIOD -> SUSPENDED delegates to
 * suspendCustomer, which owns all the safety/verification behavior.
 */
export async function runSubscriptionChecker(
  deps: CronDeps,
  railway: RailwayClient,
  opts: SubscriptionCheckerOptions = {}
): Promise<SubscriptionCheckerResult> {
  const now = opts.now ?? new Date();
  const candidates = await deps.subscriptions.findBillingCheckCandidates();

  const result: SubscriptionCheckerResult = {
    checked: candidates.length,
    movedToPaymentDue: 0,
    movedToGracePeriod: 0,
    suspended: 0,
    skipped: 0,
    errors: [],
  };

  for (const subscription of candidates) {
    try {
      if (subscription.status === 'ACTIVE') {
        if (new Date(subscription.nextBillingDate).getTime() > now.getTime()) {
          result.skipped++;
          continue;
        }
        await deps.subscriptions.updateStatus(subscription.id, 'PAYMENT_DUE');
        await deps.notifications.send(
          subscription.customerId,
          'PAYMENT_DUE',
          'Your Web Oracle Host subscription is now due.'
        );

        // Auto-generate a DUE invoice and remind whichever admin(s) own
        // this customer to follow up — both best-effort, same principle
        // as everywhere else: neither can be allowed to undo the status
        // transition that already happened above.
        const plan = await deps.plans.findById(subscription.planId);
        if (plan) {
          const graceDays = plan.gracePeriodDays ?? 2;
          const invoiceDueDate = addDays(now, graceDays).toISOString();
          try {
            await createAndSendDueInvoice(deps, {
              customerId: subscription.customerId,
              subscriptionId: subscription.id,
              amount: plan.amount,
              currency: plan.currency,
              description: plan.name,
              dueDate: invoiceDueDate,
            });
          } catch {
            // Deliberately swallowed — see comment above.
          }
        }
        try {
          const customer = await deps.customers.findById(subscription.customerId);
          await notifyAdminsForCustomer(
            deps,
            subscription.customerId,
            'PAYMENT_DUE',
            `${customer?.customerCode ?? subscription.customerId}'s subscription is now due — follow up if needed.`
          );
        } catch {
          // Deliberately swallowed — see comment above.
        }

        result.movedToPaymentDue++;
        continue;
      }

      if (subscription.status === 'PAYMENT_DUE') {
        if (new Date(subscription.nextBillingDate).getTime() > now.getTime()) {
          result.skipped++;
          continue;
        }
        const plan = await deps.plans.findById(subscription.planId);
        const graceDays = plan?.gracePeriodDays ?? 2;
        const gracePeriodEnd = addDays(now, graceDays).toISOString();
        await deps.subscriptions.startGracePeriod(subscription.id, gracePeriodEnd);
        await deps.notifications.send(
          subscription.customerId,
          'GRACE_PERIOD',
          'Your hosting subscription is overdue. Please renew to avoid service interruption.'
        );
        result.movedToGracePeriod++;
        continue;
      }

      if (subscription.status === 'GRACE_PERIOD') {
        if (!subscription.gracePeriodEnd || new Date(subscription.gracePeriodEnd).getTime() > now.getTime()) {
          result.skipped++;
          continue;
        }
        const suspension = await suspendCustomer(deps, railway, subscription.id, 'NON_PAYMENT', {
          dryRun: opts.dryRun,
        });
        if (suspension.outcome === 'SUSPENDED' || suspension.outcome === 'DRY_RUN') {
          result.suspended++;
        } else {
          result.errors.push({
            subscriptionId: subscription.id,
            message: `Suspension did not complete: ${suspension.outcome} — ${suspension.reason}`,
          });
        }
        continue;
      }

      result.skipped++;
    } catch (err) {
      result.errors.push({
        subscriptionId: subscription.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}
