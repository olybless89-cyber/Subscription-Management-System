import { WebhookDeps } from '../db/ports';

const NEEDS_PAYMENT_STATUSES = ['PAYMENT_DUE', 'GRACE_PERIOD', 'SUSPENDED'] as const;

export interface RenewalInfo {
  found: boolean;
  customerName?: string;
  needsPayment?: boolean;
  subscriptionId?: string;
  subscriptionStatus?: string;
  planName?: string;
  amount?: number;
  currency?: string;
}

/**
 * getRenewalInfo — backs the public, unauthenticated renewal page
 * (`/renew/[customerCode]`). Returns only what's needed to render that
 * page — no email, no internal ids beyond the one subscriptionId
 * needed to initiate checkout, nothing else about the customer.
 *
 * If the customer has multiple subscriptions, prefers whichever one
 * actually needs payment (PAYMENT_DUE/GRACE_PERIOD/SUSPENDED) over an
 * ACTIVE one — the whole point of the page. Falls back to their most
 * recent subscription if none currently need payment, so visiting the
 * link after already renewing shows "you're all set" rather than
 * nothing.
 */
export async function getRenewalInfo(deps: WebhookDeps, customerCode: string): Promise<RenewalInfo> {
  const customer = await deps.customers.findByCustomerCode(customerCode);
  if (!customer) {
    return { found: false };
  }

  const subscriptions = await deps.subscriptions.findByCustomerId(customer.id);
  const needsPaymentSub = subscriptions.find((s) =>
    (NEEDS_PAYMENT_STATUSES as readonly string[]).includes(s.status)
  );
  const subscription = needsPaymentSub ?? subscriptions[0];

  if (!subscription) {
    return { found: true, customerName: customer.name, needsPayment: false };
  }

  const plan = await deps.plans.findById(subscription.planId);

  return {
    found: true,
    customerName: customer.name,
    needsPayment: !!needsPaymentSub,
    subscriptionId: subscription.id,
    subscriptionStatus: subscription.status,
    planName: plan?.name,
    amount: plan?.amount,
    currency: plan?.currency,
  };
}
