// GET /api/public/renew/:customerCode
// Deliberately UNAUTHENTICATED — this is the API behind the public
// "your subscription is expired, renew here" page, meant to be opened
// from a link in an email/WhatsApp message by someone who isn't logged
// into anything. See src/lib/customers/public-renewal.ts for exactly
// what this does and doesn't expose.

import { buildWebhookDeps } from '../../../../../src/lib/deps-factory';
import { getRenewalInfo } from '../../../../../src/lib/customers/public-renewal';

export async function GET(
  request: Request,
  context: { params: { customerCode: string } }
): Promise<Response> {
  const info = await getRenewalInfo(buildWebhookDeps(), context.params.customerCode);

  if (!info.found) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify(info), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
