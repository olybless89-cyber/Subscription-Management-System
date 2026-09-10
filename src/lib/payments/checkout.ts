import crypto from 'node:crypto';
import { WebhookDeps } from '../db/ports';
import { resolvePaymentProvider, UnsupportedPaymentProviderError } from './registry';
import { PaymentProvider } from './provider';
import { PaymentProviderName } from '@/types/domain';

export interface InitiateCheckoutInput {
  subscriptionId: string;
  callbackUrl: string;
}

export type InitiateCheckoutOutcome = 'INITIATED' | 'BLOCKED' | 'NOT_FOUND' | 'ERROR';

export interface InitiateCheckoutResult {
  outcome: InitiateCheckoutOutcome;
  message: string;
  authorizationUrl?: string;
  reference?: string;
  amountMinor?: number;
  currency?: string;
}

const SUBSCRIPTION_STATUSES_BLOCKED_FROM_CHECKOUT = ['CANCELLED', 'TERMINATED'] as const;

/**
 * initiateCheckout — spec sections 10 and 19, extended for
 * multi-provider routing. This is what backs the "PAY NOW" / "Renew"
 * button in the customer billing portal. It creates a PENDING payment
 * row up front — before ever calling out to the provider — so that
 * handlePaymentWebhook always has something to reconcile the webhook
 * against, and so an abandoned checkout (customer never completes
 * payment) leaves an auditable PENDING record rather than nothing.
 *
 * Which provider gets called is NOT a caller-supplied argument — it's
 * resolved from `customer.paymentProvider`, so the same call site
 * automatically does the right thing whether that customer is grouped
 * onto Paystack or (once implemented) something else. Pass
 * `resolveProvider` only from tests, to inject a fake without hitting
 * the real registry.
 *
 * Deliberately does NOT touch subscription/customer status or Railway —
 * this only ever produces a payment intent. Everything downstream of a
 * successful payment happens in handlePaymentWebhook, once the provider
 * confirms the charge server-side.
 */
export async function initiateCheckout(
  deps: WebhookDeps,
  input: InitiateCheckoutInput,
  resolveProvider: (name: PaymentProviderName) => PaymentProvider = resolvePaymentProvider
): Promise<InitiateCheckoutResult> {
  const subscription = await deps.subscriptions.findById(input.subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  const customer = await deps.customers.findById(subscription.customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  if (
    (SUBSCRIPTION_STATUSES_BLOCKED_FROM_CHECKOUT as readonly string[]).includes(
      subscription.status
    )
  ) {
    return {
      outcome: 'BLOCKED',
      message: `Cannot start checkout for a ${subscription.status} subscription`,
    };
  }

  const plan = await deps.plans.findById(subscription.planId);
  if (!plan) {
    return { outcome: 'NOT_FOUND', message: 'Plan not found' };
  }

  if (!input.callbackUrl.startsWith('https://')) {
    // Same guard as paystack.ts#initializePayment, checked here too so
    // the failure is attributed to checkout (with a payment row we can
    // mark FAILED) rather than surfacing as a bare thrown error.
    return {
      outcome: 'ERROR',
      message: `callbackUrl must be https:// (got: ${input.callbackUrl})`,
    };
  }

  let provider: PaymentProvider;
  try {
    provider = resolveProvider(customer.paymentProvider);
  } catch (err) {
    if (err instanceof UnsupportedPaymentProviderError) {
      return { outcome: 'ERROR', message: err.message };
    }
    throw err;
  }

  const reference = generateReference(customer.customerCode);

  const payment = await deps.payments.createPending({
    subscriptionId: subscription.id,
    reference,
    provider: provider.name,
    amount: plan.amount,
    currency: plan.currency,
  });

  try {
    const init = await provider.initializePayment({
      reference,
      amountMinor: plan.amount,
      currency: plan.currency,
      customerEmail: customer.email,
      callbackUrl: input.callbackUrl,
    });

    return {
      outcome: 'INITIATED',
      message: 'Checkout session created',
      authorizationUrl: init.authorizationUrl,
      reference: init.reference,
      amountMinor: plan.amount,
      currency: plan.currency,
    };
  } catch (err) {
    // The provider rejected/failed the initialize call — mark our side of
    // the record FAILED so it doesn't sit around looking like a live
    // PENDING payment forever, and so a retry generates a fresh reference
    // rather than reusing a dead one.
    await deps.payments.updateStatus(payment.id, 'FAILED', {
      rawPayload: JSON.stringify({ error: err instanceof Error ? err.message : String(err) }),
    });
    return {
      outcome: 'ERROR',
      message: err instanceof Error ? err.message : 'Failed to initialize payment',
    };
  }
}

function generateReference(customerCode: string): string {
  return `${customerCode}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
}
