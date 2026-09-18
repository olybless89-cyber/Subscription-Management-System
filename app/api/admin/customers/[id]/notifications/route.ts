// GET /api/admin/customers/:id/notifications
// The "Communication History" section on a customer's detail page —
// every automated or admin-composed notification ever sent to this
// customer (see NotificationRepository's doc comment in
// src/lib/db/ports.ts). ADMIN-only — deliberately excluding
// SUPER_ADMIN, same as every other new route in this feature set; the
// existing shared customer-detail page already renders fine for
// SUPER_ADMIN without this section (see app/dashboard/customers/[id]/page.tsx).

import { buildWebhookDeps, buildAdminWorkflowDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const scopeDeps = buildWebhookDeps();
  const customer = await scopeDeps.customers.findById(context.params.id);
  if (!customer) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, customer.id, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const deps = buildAdminWorkflowDeps();
  const notifications = await deps.notificationHistory.listByCustomerId(customer.id, 100);

  return json(200, { notifications });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
