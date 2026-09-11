// GET /api/customer/dashboard
// Requires a CUSTOMER session token (not an admin one) — a customer can
// only ever see their own data, identified from session.sub, never from
// anything the client sends. There's no customerId in this URL at all,
// on purpose: nothing to guess or tamper with.

import { authenticateFromHeader } from '../../../../src/lib/auth/authorize';
import { buildCustomerPortalDeps } from '../../../../src/lib/deps-factory';
import { getCustomerDashboardData } from '../../../../src/lib/customers/portal';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || auth.session.type !== 'customer') {
    return json(403, { error: 'Customer access required' });
  }

  const data = await getCustomerDashboardData(buildCustomerPortalDeps(), auth.session.sub);
  if (!data) {
    return json(404, { error: 'Account not found' });
  }

  return json(200, data);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
