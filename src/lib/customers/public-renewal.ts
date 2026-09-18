import { WebhookDeps } from '../db/ports';

/** buildRenewalInfo only ever reads subscriptions + plans — narrowed to
 * exactly that so callers with a different (but overlapping) deps bag,
 * like getSuspendedLandingInfo's BillingSetupDeps, can share it without
 * having to satisfy WebhookDeps' much larger shape. */
export type RenewalInfoDeps = Pick<WebhookDeps, 'subscriptions' | 'plans'>;
import { CustomerRecord } from '@/types/domain';

const NEEDS_PAYMENT_STATUSES = ['PAYMENT_DUE', 'GRACE_PERIOD', 'SUSPENDED'] as const;

export interface RenewalInfo {
  found: boolean;
  customerCode?: string;
  customerName?: string;
  needsPayment?: boolean;
  subscriptionId?: string;
  subscriptionStatus?: string;
  planName?: string;
  amount?: number;
  currency?: string;
}

/**
 * buildRenewalInfo — the shared "does this customer need to pay, and for
 * how much" lookup behind both the customerCode-based renewal page
 * (`/renew/[customerCode]`) and the domain-based suspended-service page
 * (`/suspended`, see public-suspended.ts). Kept as one function so the
 * two pages can never quietly drift in what counts as "needs payment".
 *
 * If the customer has multiple subscriptions, prefers whichever one
 * actually needs payment (PAYMENT_DUE/GRACE_PERIOD/SUSPENDED) over an
 * ACTIVE one — the whole point of these pages. Falls back to their most
 * recent subscription if none currently need payment, so visiting the
 * link after already renewing shows "you're all set" rather than
 * nothing.
 */
export async function buildRenewalInfo(deps: RenewalInfoDeps, customer: CustomerRecord): Promise<RenewalInfo> {
  const subscriptions = await deps.subscriptions.findByCustomerId(customer.id);
  const needsPaymentSub = subscriptions.find((s) =>
    (NEEDS_PAYMENT_STATUSES as readonly string[]).includes(s.status)
  );
  const subscription = needsPaymentSub ?? subscriptions[0];

  if (!subscription) {
    return { found: true, customerCode: customer.customerCode, customerName: customer.name, needsPayment: false };
  }

  const plan = await deps.plans.findById(subscription.planId);

  return {
    found: true,
    customerCode: customer.customerCode,
    customerName: customer.name,
    needsPayment: !!needsPaymentSub,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    planName: plan?.name,
    amount: plan?.amount,
    currency: plan?.currency,
  };
}

/**
 * getRenewalInfo — backs the public, unauthenticated renewal page
 * (`/renew/[customerCode]`). Returns only what's needed to render that
 * page — no email, no internal ids beyond the one subscriptionId
 * needed to initiate checkout, nothing else about the customer.
 */
export async function getRenewalInfo(deps: WebhookDeps, customerCode: string): Promise<RenewalInfo> {
  const customer = await deps.customers.findByCustomerCode(customerCode);
  if (!customer) {
    return { found: false };
  }
  return buildRenewalInfo(deps, customer);
}
