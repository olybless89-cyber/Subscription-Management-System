// POST /api/webhooks/payment
//
// This is the thin Next.js App Router wrapper around handlePaymentWebhook.
// It is NOT included in this sandbox's `npm run typecheck`/`npm test` —
// it needs the `next` package (for the route-handler contract, though it
// only uses the plain Web Fetch API Request/Response types) and a
// generated Prisma client (see src/lib/db/prisma-repository.ts), neither
// of which this sandbox can install/generate. All the logic it calls
// into (handlePaymentWebhook) IS tested — see tests/webhook.test.ts.
//
// Protect this route at the infra layer too (e.g. Paystack's fixed
// webhook IPs) in addition to the signature check inside the handler.

import { handlePaymentWebhook } from '../../../../src/lib/payments/webhook-handler';
import {
  buildWebhookDeps,
  buildPaystackProvider,
  buildRailwayClient,
} from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  const signatureHeader = request.headers.get('x-paystack-signature');

  const result = await handlePaymentWebhook(
    buildWebhookDeps(),
    buildPaystackProvider(),
    buildRailwayClient(),
    rawBody,
    signatureHeader
  );

  return new Response(JSON.stringify({ outcome: result.outcome, message: result.message }), {
    status: result.httpStatus,
    headers: { 'Content-Type': 'application/json' },
  });
}
