import { BillingSetupDeps } from '../db/ports';
import { addBillingCycle } from '../billing/cycle';
import { SubscriptionRecord } from '@/types/domain';

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  /** Defaults to TRIAL. ACTIVE starts real billing immediately. */
  status?: 'TRIAL' | 'ACTIVE';
  /** Defaults to now. */
  startDate?: string;
}

export type CreateSubscriptionOutcome = 'CREATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';

export interface CreateSubscriptionResult {
  outcome: CreateSubscriptionOutcome;
  message: string;
  subscription?: SubscriptionRecord;
}

/**
 * createSubscription — spec section 39. Links an existing customer to an
 * existing plan and computes the first billing period from the plan's
 * billingCycle, using the same addBillingCycle() the webhook handler
 * uses to extend periods later — one date-math implementation, not two
 * that could quietly drift apart.
 */
export async function createSubscription(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  input: CreateSubscriptionInput
): Promise<CreateSubscriptionResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(input.customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  const plan = await deps.plans.findById(input.planId);
  if (!plan) {
    return { outcome: 'NOT_FOUND', message: 'Plan not found' };
  }

  const status = input.status ?? 'TRIAL';
  const start = input.startDate ? new Date(input.startDate) : new Date();
  if (Number.isNaN(start.getTime())) {
    return { outcome: 'INVALID_INPUT', message: 'startDate is not a valid date' };
  }

  const periodEnd = addBillingCycle(start, plan.billingCycle);

  const subscription = await deps.subscriptions.create({
    customerId: input.customerId,
    planId: input.planId,
    status,
    currentPeriodStart: start.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    nextBillingDate: periodEnd.toISOString(),
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'SUBSCRIPTION_CREATED',
    target: subscription.id,
    metadata: { customerId: input.customerId, planId: input.planId, status },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Subscription created', subscription };
}
