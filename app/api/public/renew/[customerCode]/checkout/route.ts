// POST /api/public/renew/:customerCode/checkout
// Deliberately UNAUTHENTICATED, same reasoning as the sibling GET route
// — but re-derives which subscription needs payment itself rather than
// trusting anything from the client, and reuses initiateCheckout's own
// safety checks (blocks CANCELLED/TERMINATED, requires https callback).
// A stranger initiating checkout for someone else's subscription isn't
// a real risk here — the worst case is someone pays on a customer's
// behalf, which is harmless — but this still only ever acts on whatever
// subscription getRenewalInfo() itself determines actually needs
// payment, not an arbitrary id supplied by the caller.

import { buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { getRenewalInfo } from '../../../../../../src/lib/customers/public-renewal';
import { initiateCheckout } from '../../../../../../src/lib/payments/checkout';

export async function POST(
  request: Request,
  context: { params: { customerCode: string } }
): Promise<Response> {
  const deps = buildWebhookDeps();
  const info = await getRenewalInfo(deps, context.params.customerCode);

  if (!info.found || !info.subscriptionId) {
    return json(404, { error: 'Nothing to pay for this customer right now' });
  }

  const appUrl = process.env.APP_URL?.replace(/\/$/, '');
  if (!appUrl) {
    return json(500, { error: 'APP_URL is not configured on the server' });
  }

  const result = await initiateCheckout(deps, {
    subscriptionId: info.subscriptionId,
    callbackUrl: `${appUrl}/renew/${encodeURIComponent(context.params.customerCode)}?paid=1`,
  });

  const httpStatus =
    result.outcome === 'INITIATED'
      ? 200
      : result.outcome === 'NOT_FOUND'
        ? 404
        : result.outcome === 'BLOCKED'
          ? 409
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
