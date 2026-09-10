// GET /api/admin/customers
// Returns the customers visible to the calling admin: everyone for
// SUPER_ADMIN, only assigned customers for a plain ADMIN. This is the
// route a "my customers" dashboard view would call.

import { buildWebhookDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, deps.adminAssignments);

  const customers = visible === 'ALL' ? await deps.customers.listAll() : await deps.customers.findByIds(visible);

  // Never expose passwordHash over the API.
  const safe = customers.map(({ passwordHash, ...rest }) => rest);
  return json(200, { customers: safe });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
