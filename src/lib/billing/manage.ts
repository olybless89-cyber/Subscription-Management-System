import { BillingSetupDeps } from '../db/ports';
import { addBillingCycle } from './cycle';
import { PlanRecord, SubscriptionRecord, BillingCycle } from '@/types/domain';

// ---------- createPlan ----------

export interface CreatePlanInput {
  name: string;
  amount: number; // minor units (kobo)
  currency?: string;
  billingCycle: BillingCycle;
  gracePeriodDays?: number;
}

export type CreatePlanOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT';

export interface CreatePlanResult {
  outcome: CreatePlanOutcome;
  message: string;
  plan?: PlanRecord;
}

/**
 * createPlan — spec section 9. Not privilege-sensitive the way
 * createAdmin is (any authenticated admin can define a hosting plan),
 * so the only gate is "does this admin id actually exist" — the
 * ADMIN/SUPER_ADMIN role check itself already happened at the route
 * level via hasAdminRole on the session token.
 */
export async function createPlan(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  input: CreatePlanInput
): Promise<CreatePlanResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const name = input.name?.trim();
  if (!name) {
    return { outcome: 'INVALID_INPUT', message: 'name is required' };
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return { outcome: 'INVALID_INPUT', message: 'amount must be a positive integer (minor units)' };
  }
  const gracePeriodDays = input.gracePeriodDays ?? 2;
  if (!Number.isInteger(gracePeriodDays) || gracePeriodDays < 0) {
    return { outcome: 'INVALID_INPUT', message: 'gracePeriodDays must be a non-negative integer' };
  }

  const plan = await deps.plans.create({
    name,
    amount: input.amount,
    currency: input.currency ?? 'NGN',
    billingCycle: input.billingCycle,
    gracePeriodDays,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'PLAN_CREATED',
    target: plan.id,
    metadata: { name: plan.name, amount: plan.amount, billingCycle: plan.billingCycle },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Plan created', plan };
}

// ---------- createSubscription ----------

export interface CreateSubscriptionInput {
  customerId: string;
  planId: string;
  /** Defaults to TRIAL — pass ACTIVE to skip the trial period entirely. */
  status?: 'TRIAL' | 'ACTIVE';
  /** Defaults to now. Mainly useful for backdating a subscription that
   * already existed elsewhere before being entered here. */
  startDate?: string;
}

export type CreateSubscriptionOutcome = 'CREATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';

export interface CreateSubscriptionResult {
  outcome: CreateSubscriptionOutcome;
  message: string;
  subscription?: SubscriptionRecord;
}

const ALLOWED_INITIAL_STATUSES = ['TRIAL', 'ACTIVE'] as const;

/**
 * createSubscription — spec sections 8-9. Computes the initial billing
 * period from the plan's billingCycle via the same addBillingCycle()
 * helper the webhook handler uses to extend periods later, so "how long
 * is one period" is defined in exactly one place.
 *
 * Does NOT touch Railway or create a RailwayResource — see
 * mapRailwayResource() for that, deliberately kept as its own step
 * (spec section 12): a subscription can validly exist before
 * infrastructure is provisioned for it.
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
  if (!(ALLOWED_INITIAL_STATUSES as readonly string[]).includes(status)) {
    return { outcome: 'INVALID_INPUT', message: 'status must be TRIAL or ACTIVE' };
  }

  let startDate: Date;
  if (input.startDate) {
    startDate = new Date(input.startDate);
    if (Number.isNaN(startDate.getTime())) {
      return { outcome: 'INVALID_INPUT', message: 'startDate is not a valid date' };
    }
  } else {
    startDate = new Date();
  }

  const periodEnd = addBillingCycle(startDate, plan.billingCycle);

  const subscription = await deps.subscriptions.create({
    customerId: customer.id,
    planId: plan.id,
    status,
    currentPeriodStart: startDate.toISOString(),
    currentPeriodEnd: periodEnd.toISOString(),
    nextBillingDate: periodEnd.toISOString(),
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'SUBSCRIPTION_CREATED',
    target: subscription.id,
    metadata: { customerId: customer.id, planId: plan.id, status },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Subscription created', subscription };
}
