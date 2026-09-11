// POST /api/admin/customers/:id/reset-password
// Scoped to admin assignment, same as other customer actions — any
// admin with access to this customer can reset their password. See
// src/lib/admin/password.ts for why this differs from the
// SUPER_ADMIN-only admin-password-reset route.

import { resetCustomerPassword } from '../../../../../../src/lib/admin/password';
import { buildAdminManagementDeps, buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.newPassword) {
    return json(400, { error: 'newPassword is required' });
  }

  const scopeDeps = buildWebhookDeps();
  const customer = await scopeDeps.customers.findById(context.params.id);
  if (!customer) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, customer.id, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await resetCustomerPassword(buildAdminManagementDeps(), auth.session.sub, context.params.id, body.newPassword);

  const httpStatus =
    result.outcome === 'CHANGED'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
