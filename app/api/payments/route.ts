// POST /api/payments
//
// Backs the "PAY NOW" / "Renew" button in the customer billing portal
// (spec section 19). Same caveats as app/api/webhooks/payment/route.ts:
// not included in this sandbox's typecheck/test run (needs `next` +
// generated Prisma client). All real logic lives in initiateCheckout and
// authenticateFromHeader/canAccessCustomer, which ARE tested — see
// tests/checkout.test.ts, tests/auth.test.ts, and
// tests/payment-routing.test.ts.
//
// initiateCheckout no longer takes a provider argument — it resolves the
// right one (Paystack, or whatever this customer is grouped onto) from
// customer.paymentProvider itself. See src/lib/payments/registry.ts.

import { initiateCheckout } from '../../../src/lib/payments/checkout';
import { buildWebhookDeps } from '../../../src/lib/deps-factory';
import { authenticateFromHeader, canAccessCustomer } from '../../../src/lib/auth/authorize';

export async function POST(request: Request): Promise<Response> {
  let body: { subscriptionId?: string; callbackUrl?: string };
  try {
    body = await request.json();
  } catch {
    return jsonResponse(400, { error: 'Malformed JSON body' });
  }

  if (!body.subscriptionId || !body.callbackUrl) {
    return jsonResponse(400, { error: 'subscriptionId and callbackUrl are required' });
  }

  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated) {
    return jsonResponse(401, { error: 'Not authenticated' });
  }

  const deps = buildWebhookDeps();

  const subscription = await deps.subscriptions.findById(body.subscriptionId);
  if (!subscription) {
    return jsonResponse(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, deps.adminAssignments))) {
    return jsonResponse(403, { error: 'Not authorized for this subscription' });
  }

  const result = await initiateCheckout(deps, {
    subscriptionId: body.subscriptionId,
    callbackUrl: body.callbackUrl,
  });

  const httpStatus =
    result.outcome === 'INITIATED'
      ? 200
      : result.outcome === 'NOT_FOUND'
        ? 404
        : result.outcome === 'BLOCKED'
          ? 409
          : 400;

  return jsonResponse(httpStatus, result);
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
