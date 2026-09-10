import { RailwayClient } from '../railway/client';
import { WebhookDeps } from '../db/ports';
import { PaymentProvider } from './provider';
import { addBillingCycle } from '../billing/cycle';
import { restoreCustomer } from '../suspension/restoration';

export type WebhookOutcome =
  | 'PROCESSED'
  | 'ALREADY_PROCESSED'
  | 'IGNORED_EVENT'
  | 'INVALID_SIGNATURE'
  | 'UNKNOWN_REFERENCE'
  | 'VERIFICATION_MISMATCH'
  | 'PAYMENT_NOT_SUCCESSFUL'
  | 'ERROR';

export interface WebhookResult {
  /** HTTP status the caller's route handler should respond with. */
  httpStatus: number;
  outcome: WebhookOutcome;
  message: string;
}

/**
 * handlePaymentWebhook — spec sections 10 and 24.
 *
 * Flow: verify signature -> parse -> idempotency check on payment
 * reference -> re-verify the transaction server-side (never trust the
 * webhook body) -> record SUCCESS -> extend subscription -> restore
 * service if it was suspended -> notify customer.
 *
 * Transport-agnostic on purpose: takes the raw body string and signature
 * header directly rather than a framework Request object, so it can be
 * called from a Next.js route handler, a test, or any other transport
 * without change. See app/api/webhooks/payment/route.ts for the Next.js
 * wrapper.
 */
export async function handlePaymentWebhook(
  deps: WebhookDeps,
  provider: PaymentProvider,
  railway: RailwayClient,
  rawBody: string,
  signatureHeader: string | null,
  opts: { now?: Date } = {}
): Promise<WebhookResult> {
  // 1. Verify signature.
  if (!provider.verifyWebhookSignature(rawBody, signatureHeader)) {
    return { httpStatus: 401, outcome: 'INVALID_SIGNATURE', message: 'Invalid webhook signature' };
  }

  // Parse body.
  let body: { event?: string; data?: { reference?: string } };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { httpStatus: 400, outcome: 'ERROR', message: 'Malformed JSON body' };
  }

  // We only act on successful-charge events; everything else is ack'd and
  // ignored so the provider doesn't keep retrying.
  if (body.event !== 'charge.success') {
    return { httpStatus: 200, outcome: 'IGNORED_EVENT', message: `Ignored event: ${body.event}` };
  }

  const reference = body.data?.reference;
  if (!reference) {
    return { httpStatus: 400, outcome: 'ERROR', message: 'Missing transaction reference' };
  }

  // Idempotency anchor: find the payment we created at checkout time.
  const payment = await deps.payments.findByReference(reference);
  if (!payment) {
    // Nothing in our system maps to this reference — cannot safely act.
    // Ack with 200 so the provider stops retrying; this needs a human to
    // investigate, not an automated retry storm.
    return {
      httpStatus: 200,
      outcome: 'UNKNOWN_REFERENCE',
      message: `No payment record for reference ${reference}`,
    };
  }

  // 3/24. Already processed — same webhook delivered twice (or Paystack's
  // own retry). Must not extend the subscription again.
  if (payment.status === 'SUCCESS') {
    return { httpStatus: 200, outcome: 'ALREADY_PROCESSED', message: 'Payment already processed' };
  }

  // Re-verify server-side. Never trust the webhook payload's own amount/status.
  let verified;
  try {
    verified = await provider.verifyTransaction(reference);
  } catch (err) {
    // Transient provider-side issue — return 5xx so the provider retries
    // the webhook later rather than us guessing at the outcome.
    return {
      httpStatus: 502,
      outcome: 'ERROR',
      message: err instanceof Error ? err.message : 'Transaction verification failed',
    };
  }

  if (verified.status !== 'success') {
    await deps.payments.updateStatus(payment.id, 'FAILED', {
      rawPayload: JSON.stringify(verified.raw),
    });
    return { httpStatus: 200, outcome: 'PAYMENT_NOT_SUCCESSFUL', message: `Transaction status: ${verified.status}` };
  }

  if (verified.amountMinor !== payment.amount) {
    // Amount mismatch is a data-integrity problem, not a retryable one —
    // mark failed and surface it for manual review rather than silently
    // extending a subscription for the wrong amount.
    await deps.payments.updateStatus(payment.id, 'FAILED', {
      rawPayload: JSON.stringify(verified.raw),
    });
    return {
      httpStatus: 200,
      outcome: 'VERIFICATION_MISMATCH',
      message: `Verified amount ${verified.amountMinor} does not match expected ${payment.amount}`,
    };
  }

  const now = opts.now ?? new Date();

  await deps.payments.updateStatus(payment.id, 'SUCCESS', {
    rawPayload: JSON.stringify(verified.raw),
    processedAt: now.toISOString(),
  });

  const subscription = await deps.subscriptions.findById(payment.subscriptionId);
  if (!subscription) {
    // Payment is correctly recorded even though we can't extend anything —
    // this shouldn't happen (FK integrity), but fail loud rather than throw
    // mid-webhook.
    return {
      httpStatus: 200,
      outcome: 'ERROR',
      message: `Payment ${payment.id} recorded, but subscription ${payment.subscriptionId} not found`,
    };
  }

  const plan = await deps.plans.findById(subscription.planId);
  if (!plan) {
    return {
      httpStatus: 200,
      outcome: 'ERROR',
      message: `Payment ${payment.id} recorded, but plan ${subscription.planId} not found`,
    };
  }

  // Extend the billing period from whichever is later: now, or the
  // existing period end (covers early renewal without losing paid-for time).
  const currentPeriodEnd = new Date(subscription.currentPeriodEnd);
  const base = currentPeriodEnd.getTime() > now.getTime() ? currentPeriodEnd : now;
  const newPeriodEnd = addBillingCycle(base, plan.billingCycle);

  await deps.subscriptions.extendPeriod(subscription.id, {
    currentPeriodStart: base.toISOString(),
    currentPeriodEnd: newPeriodEnd.toISOString(),
    nextBillingDate: newPeriodEnd.toISOString(),
  });

  await deps.notifications.send(
    subscription.customerId,
    'PAYMENT_RECEIVED',
    'Payment received. Your service is being restored.'
  );

  if (subscription.status === 'SUSPENDED') {
    // Let restoreCustomer own the ACTIVE transition — it only flips status
    // after Railway confirms the service is actually back up.
    const restoration = await restoreCustomer(deps, railway, subscription.id, {
      paymentVerified: true,
    });
    if (restoration.outcome !== 'RESTORED') {
      return {
        httpStatus: 200,
        outcome: 'PROCESSED',
        message: `Payment recorded and subscription extended, but restoration did not complete: ${restoration.reason}. An admin retry is needed.`,
      };
    }
  } else {
    // Not suspended (e.g. renewing from PAYMENT_DUE/GRACE_PERIOD/TRIAL) —
    // no Railway action needed, just clear the status.
    await deps.subscriptions.updateStatus(subscription.id, 'ACTIVE', { suspendedAt: null });
  }

  return { httpStatus: 200, outcome: 'PROCESSED', message: 'Payment processed and subscription extended' };
}
