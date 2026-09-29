import { BillingSetupDeps } from '../db/ports';
import { addBillingCycle } from './cycle';
import { resolveBillingCycleForMonths } from './months';
import { PlanRecord, SubscriptionRecord, BillingCycle } from '@/types/domain';

// ---------- createPlan ----------

export interface CreatePlanInput {
  name: string;
  amount: number; // minor units (kobo)
  currency?: string;
  billingCycle: BillingCycle;
  /** Required when billingCycle is 'CUSTOM' — the exact number of
   * months this plan covers. Ignored (stored as null) for every other
   * cycle, which already has a fixed month count of its own. */
  customMonths?: number | null;
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
  if (input.billingCycle === 'CUSTOM' && (!Number.isInteger(input.customMonths) || (input.customMonths as number) < 1)) {
    return { outcome: 'INVALID_INPUT', message: 'customMonths must be a positive integer when billingCycle is CUSTOM' };
  }

  const plan = await deps.plans.create({
    name,
    amount: input.amount,
    currency: input.currency ?? 'NGN',
    billingCycle: input.billingCycle,
    customMonths: input.billingCycle === 'CUSTOM' ? (input.customMonths as number) : null,
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

  const periodEnd = addBillingCycle(startDate, plan);

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
  /** Corrects the billing period's start date — most commonly used on
   * a bulk-imported subscription whose real start predates when it
   * was entered here (see scripts/activate-imported-customers.mjs,
   * which has no way to know the customer's actual original date and
   * just uses "now"). ISO 8601 string. */
  currentPeriodStart?: string;
  /** Corrects the billing period's end date. ISO 8601 string.
   * nextBillingDate is always moved to match — see the doc comment
   * below on why those two fields are never allowed to diverge. */
  currentPeriodEnd?: string;
}

export type UpdateSubscriptionOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'NO_CHANGES';

export interface UpdateSubscriptionResult {
  outcome: UpdateSubscriptionOutcome;
  message: string;
  subscription?: SubscriptionRecord;
}

/**
 * updateSubscription — spec section 39 (PATCH /api/subscriptions/:id),
 * deliberately narrow. `planId` (change which plan this subscription
 * bills against), `suspensionEnabled` (the per-subscription automatic-
 * suspension toggle), and currentPeriodStart/currentPeriodEnd (correct
 * the billing dates, e.g. after a bulk import guessed them) are the
 * only fields editable here.
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
 *
 * currentPeriodEnd and nextBillingDate are treated as one concept
 * everywhere else in this codebase (createSubscription sets them equal;
 * the payment webhook's extendPeriod always moves them together) — so
 * editing currentPeriodEnd here always carries nextBillingDate along
 * with it, rather than exposing nextBillingDate as a separately
 * editable field that could quietly drift out of sync.
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

  if (
    patch.planId === undefined &&
    patch.suspensionEnabled === undefined &&
    patch.currentPeriodStart === undefined &&
    patch.currentPeriodEnd === undefined
  ) {
    return {
      outcome: 'NO_CHANGES',
      message: 'Nothing to update — provide planId, suspensionEnabled, currentPeriodStart, and/or currentPeriodEnd',
    };
  }

  if (patch.planId !== undefined) {
    const plan = await deps.plans.findById(patch.planId);
    if (!plan) {
      return { outcome: 'NOT_FOUND', message: 'Plan not found' };
    }
  }

  let periodStart: Date | undefined;
  if (patch.currentPeriodStart !== undefined) {
    periodStart = new Date(patch.currentPeriodStart);
    if (Number.isNaN(periodStart.getTime())) {
      return { outcome: 'INVALID_INPUT', message: 'currentPeriodStart is not a valid date' };
    }
  }

  let periodEnd: Date | undefined;
  if (patch.currentPeriodEnd !== undefined) {
    periodEnd = new Date(patch.currentPeriodEnd);
    if (Number.isNaN(periodEnd.getTime())) {
      return { outcome: 'INVALID_INPUT', message: 'currentPeriodEnd is not a valid date' };
    }
  }

  // Whichever of the two wasn't just supplied still has to make sense
  // against the OTHER one's new value (if it changed) or its existing
  // stored value (if it didn't) — never let start end up on or after end.
  const effectiveStart = periodStart ?? new Date(subscription.currentPeriodStart);
  const effectiveEnd = periodEnd ?? new Date(subscription.currentPeriodEnd);
  if ((periodStart || periodEnd) && effectiveStart.getTime() >= effectiveEnd.getTime()) {
    return { outcome: 'INVALID_INPUT', message: 'currentPeriodStart must be before currentPeriodEnd' };
  }

  const dbPatch: Parameters<typeof deps.subscriptions.update>[1] = {
    planId: patch.planId,
    suspensionEnabled: patch.suspensionEnabled,
    ...(periodStart ? { currentPeriodStart: periodStart.toISOString() } : {}),
    // nextBillingDate always mirrors currentPeriodEnd — see doc comment above.
    ...(periodEnd ? { currentPeriodEnd: periodEnd.toISOString(), nextBillingDate: periodEnd.toISOString() } : {}),
  };

  await deps.subscriptions.update(subscriptionId, dbPatch);

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

// ---------- activateCustomerBilling ----------

/**
 * Flat per-month rate used by the "N months paid" bulk-activation flow
 * (activateCustomerBilling below) to compute a plan's amount from
 * however many months the admin says were paid for — $20/month, stored
 * in minor units (cents) since Plan.amount is minor-units throughout.
 * Change this one constant if the flat rate ever changes; it has no
 * other effect on plans created any other way (the Plans page still
 * lets an admin set any amount directly).
 */
export const DEFAULT_MONTHLY_RATE_MINOR_UNITS = 2000; // $20.00
export const DEFAULT_MONTHLY_RATE_CURRENCY = 'USD';

/**
 * findOrCreatePlanForMonths — resolves "N months paid, at $20/month" to
 * a concrete Plan, reusing an existing one with the same cycle/amount/
 * currency instead of creating a duplicate every time an admin enters
 * the same N again (e.g. every customer who paid for 1 month shares one
 * "1 Month — $20.00" plan, not one row each).
 */
export async function findOrCreatePlanForMonths(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  months: number,
  ratePerMonthMinorUnits: number = DEFAULT_MONTHLY_RATE_MINOR_UNITS,
  currency: string = DEFAULT_MONTHLY_RATE_CURRENCY
): Promise<PlanRecord> {
  const { billingCycle, customMonths } = resolveBillingCycleForMonths(months);
  const amount = ratePerMonthMinorUnits * months;

  const existingPlans = await deps.plans.listAll();
  const existing = existingPlans.find(
    (p) =>
      p.billingCycle === billingCycle &&
      p.customMonths === customMonths &&
      p.amount === amount &&
      p.currency === currency
  );
  if (existing) {
    return existing;
  }

  const label = months === 1 ? '1 Month' : `${months} Months`;
  const displayAmount = (amount / 100).toFixed(2);
  const created = await createPlan(deps, requestingAdminId, {
    name: `${label} — ${displayAmount} ${currency}`,
    amount,
    currency,
    billingCycle,
    customMonths,
    gracePeriodDays: 2,
  });

  // createPlan only fails here on FORBIDDEN (bad requestingAdminId) or an
  // INVALID_INPUT the validation above already ruled out — surfaced as a
  // thrown error rather than threaded through another result type, since
  // every caller of this helper already validated requestingAdminId via
  // its own createPlan/createSubscription call in the same flow.
  if (created.outcome !== 'CREATED' || !created.plan) {
    throw new Error(`Failed to create plan for ${months} month(s): ${created.message}`);
  }
  return created.plan;
}

export type ActivateCustomerBillingOutcome =
  | 'ACTIVATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'INVALID_INPUT'
  | 'ALREADY_HAS_SUBSCRIPTION';

export interface ActivateCustomerBillingResult {
  outcome: ActivateCustomerBillingOutcome;
  message: string;
  subscription?: SubscriptionRecord;
  plan?: PlanRecord;
}

/**
 * activateCustomerBilling — the "admin enters how many months this
 * customer already paid for" action. Used both by the per-customer
 * Activate control on the Customers page (for one-off future imports)
 * and by scripts/activate-imported-customers.mjs (for a batch of
 * already-imported customers with no subscription yet).
 *
 * Deliberately refuses a customer that already has ANY subscription
 * (even a cancelled/terminated one) rather than guessing which one to
 * touch — activating billing is a one-time "onboard this customer"
 * action, not a plan change (that's updateSubscription).
 */
export async function activateCustomerBilling(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  customerId: string,
  monthsPaid: number,
  opts: { startDate?: string } = {}
): Promise<ActivateCustomerBillingResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  if (!Number.isInteger(monthsPaid) || monthsPaid < 1) {
    return { outcome: 'INVALID_INPUT', message: 'monthsPaid must be a positive whole number of months' };
  }

  const existingSubscriptions = await deps.subscriptions.findByCustomerId(customerId);
  if (existingSubscriptions.length > 0) {
    return {
      outcome: 'ALREADY_HAS_SUBSCRIPTION',
      message: 'This customer already has a subscription — change their plan from the Subscriptions page instead of activating again.',
    };
  }

  const plan = await findOrCreatePlanForMonths(deps, requestingAdminId, monthsPaid);

  const created = await createSubscription(deps, requestingAdminId, {
    customerId,
    planId: plan.id,
    status: 'ACTIVE',
    startDate: opts.startDate,
  });

  if (created.outcome !== 'CREATED' || !created.subscription) {
    return {
      outcome: created.outcome === 'FORBIDDEN' ? 'FORBIDDEN' : 'INVALID_INPUT',
      message: created.message,
    };
  }

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOMER_BILLING_ACTIVATED',
    target: customerId,
    metadata: { monthsPaid, planId: plan.id, subscriptionId: created.subscription.id },
    result: 'SUCCESS',
  });

  return {
    outcome: 'ACTIVATED',
    message: `Activated on a ${monthsPaid}-month plan (${(plan.amount / 100).toFixed(2)} ${plan.currency})`,
    subscription: created.subscription,
    plan,
  };
}
