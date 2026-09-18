// GET /api/public/suspended-lookup
// Deliberately UNAUTHENTICATED, and deliberately takes no query params —
// this is the API behind the public "/suspended" landing page that a
// customer's own domain gets manually repointed at while their service
// is stopped (see middleware.ts). It identifies who's asking purely
// from the request's own Host header, never from client-supplied input,
// so there's nothing here for a visitor to spoof their way into seeing
// someone else's billing status with.

import { buildBillingSetupDeps } from '../../../../src/lib/deps-factory';
import { getSuspendedLandingInfo } from '../../../../src/lib/customers/public-suspended';

export async function GET(request: Request): Promise<Response> {
  const info = await getSuspendedLandingInfo(buildBillingSetupDeps(), request.headers.get('host'));

  return new Response(JSON.stringify(info), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
