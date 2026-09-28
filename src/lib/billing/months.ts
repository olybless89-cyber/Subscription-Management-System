import { BillingCycle } from '@/types/domain';

/**
 * resolveBillingCycleForMonths — the single place that decides how a
 * plain "N months paid" number (from the admin-facing bulk-activation
 * flow, see activateCustomerBilling in ./manage.ts) maps onto the
 * fixed BillingCycle enum.
 *
 * Reuses the existing named cycles where they line up exactly (1, 3, 4,
 * 6, 12 months) so those plans stay first-class and consistent with
 * ones created any other way. Any other N (2, 5, 7, 8, 9, 10, 11, 13+)
 * falls back to CUSTOM with customMonths set to N — addBillingCycle
 * (./cycle.ts) reads that field for CUSTOM plans.
 */
export function resolveBillingCycleForMonths(months: number): {
  billingCycle: BillingCycle;
  customMonths: number | null;
} {
  switch (months) {
    case 1:
      return { billingCycle: 'MONTHLY', customMonths: null };
    case 3:
      return { billingCycle: 'QUARTERLY', customMonths: null };
    case 4:
      return { billingCycle: 'FOUR_MONTHS', customMonths: null };
    case 6:
      return { billingCycle: 'SEMI_ANNUAL', customMonths: null };
    case 12:
      return { billingCycle: 'YEARLY', customMonths: null };
    default:
      return { billingCycle: 'CUSTOM', customMonths: months };
  }
}
