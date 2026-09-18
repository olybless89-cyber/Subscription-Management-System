// POST /api/admin/customers/:id/send-birthday-greeting
// The manual "Greet" button in the Reminders & Actions hub (see
// sendBirthdayGreetingNow's doc comment in
// src/lib/customers/birthday.ts). ADMIN-only, deliberately excluding
// SUPER_ADMIN — see send-reminder/route.ts's comment for why.

import { buildWebhookDeps, buildCustomEmailDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { sendBirthdayGreetingNow } from '../../../../../../src/lib/customers/birthday';

export async function POST(
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

  const result = await sendBirthdayGreetingNow(buildCustomEmailDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'SENT'
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
