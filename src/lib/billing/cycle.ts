import { BillingCycle } from '@/types/domain';

/** The minimum shape addBillingCycle needs — a full PlanRecord always
 * satisfies this, but callers that only have the two relevant fields
 * (e.g. a plan being constructed, not yet persisted) can pass those
 * directly too. */
export interface CyclePlan {
  billingCycle: BillingCycle;
  /** Only read when billingCycle === 'CUSTOM'. See resolveBillingCycleForMonths. */
  customMonths?: number | null;
}

/**
 * Advances a date by one billing cycle. For CUSTOM, advances by
 * plan.customMonths (set by resolveBillingCycleForMonths for the "N
 * months paid" activation flow — see src/lib/billing/months.ts); a
 * CUSTOM plan with no customMonths set falls back to one month, the
 * same safe default this always used before customMonths existed.
 */
export function addBillingCycle(from: Date, plan: CyclePlan): Date {
  const next = new Date(from);
  switch (plan.billingCycle) {
    case 'MONTHLY':
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case 'CUSTOM': {
      const months = plan.customMonths && plan.customMonths > 0 ? plan.customMonths : 1;
      next.setUTCMonth(next.getUTCMonth() + months);
      return next;
    }
    case 'QUARTERLY':
      next.setUTCMonth(next.getUTCMonth() + 3);
      return next;
    case 'FOUR_MONTHS':
      next.setUTCMonth(next.getUTCMonth() + 4);
      return next;
    case 'SEMI_ANNUAL':
      next.setUTCMonth(next.getUTCMonth() + 6);
      return next;
    case 'YEARLY':
      next.setUTCFullYear(next.getUTCFullYear() + 1);
      return next;
  }
}

export function addDays(from: Date, days: number): Date {
  const next = new Date(from);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}
