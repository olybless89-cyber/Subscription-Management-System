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

// ---------- updateSubscription ----------

export interface UpdateSubscriptionInput {
  planId?: string;
  suspensionEnabled?: boolean;
}

export type UpdateSubscriptionOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'NO_CHANGES';

export interface UpdateSubscriptionResult {
  outcome: UpdateSubscriptionOutcome;
  message: string;
  subscription?: SubscriptionRecord;
}

/**
 * updateSubscription — spec section 39 (PATCH /api/subscriptions/:id),
 * deliberately narrow. Only `planId` (change which plan this
 * subscription bills against) and `suspensionEnabled` (the per-
 * subscription automatic-suspension toggle) are editable here.
 *
 * `status` is NOT part of this input type, on purpose — status
 * transitions only ever happen through suspendCustomer/restoreCustomer
 * (which verify against Railway before changing it) or the cron state
 * machine. A generic PATCH that could set `status` directly would let
 * someone write SUSPENDED into the database without ever actually
 * stopping the Railway deployment, or ACTIVE without ever restoring
 * it — exactly the "never report success without verification"
 * invariant the rest of this codebase is built around. If you need to
 * force a status, use the suspend/restore routes (manual: true) or the
 * dry-run-override route, not this one.
 */
export async function updateSubscription(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  subscriptionId: string,
  patch: UpdateSubscriptionInput
): Promise<UpdateSubscriptionResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  if (patch.planId === undefined && patch.suspensionEnabled === undefined) {
    return { outcome: 'NO_CHANGES', message: 'Nothing to update — provide planId and/or suspensionEnabled' };
  }

  if (patch.planId !== undefined) {
    const plan = await deps.plans.findById(patch.planId);
    if (!plan) {
      return { outcome: 'NOT_FOUND', message: 'Plan not found' };
    }
  }

  await deps.subscriptions.update(subscriptionId, patch);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'SUBSCRIPTION_UPDATED',
    target: subscriptionId,
    metadata: { ...patch },
    result: 'SUCCESS',
  });

  const updated = await deps.subscriptions.findById(subscriptionId);
  return { outcome: 'UPDATED', message: 'Subscription updated', subscription: updated ?? undefined };
}
