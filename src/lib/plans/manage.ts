import { BillingSetupDeps } from '../db/ports';
import { PlanRecord, BillingCycle } from '@/types/domain';

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
 * createPlan — spec section 39. Not privilege-sensitive like admin
 * creation; any authenticated admin can define a plan, gated only by
 * being a real admin at all (checked here, not just at the route, so
 * this function is safe to call from anywhere).
 */
export async function createPlan(
  deps: Pick<BillingSetupDeps, 'admins' | 'plans' | 'auditLog'>,
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
    return { outcome: 'INVALID_INPUT', message: 'amount must be a positive integer (minor units, e.g. kobo)' };
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
    metadata: { name, amount: plan.amount, billingCycle: plan.billingCycle },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Plan created', plan };
}
