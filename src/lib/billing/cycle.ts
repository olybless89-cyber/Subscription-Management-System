import { BillingCycle } from '@/types/domain';

/**
 * Advances a date by one billing cycle. CUSTOM is treated as MONTHLY here
 * as a safe default — plans using CUSTOM billing should extend this with
 * their own interval field before going live; this function deliberately
 * does not guess at an arbitrary custom interval.
 */
export function addBillingCycle(from: Date, cycle: BillingCycle): Date {
  const next = new Date(from);
  switch (cycle) {
    case 'MONTHLY':
    case 'CUSTOM':
      next.setUTCMonth(next.getUTCMonth() + 1);
      return next;
    case 'QUARTERLY':
      next.setUTCMonth(next.getUTCMonth() + 3);
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
