// POST /api/admin/customers/:id/send-email
// The custom-email composer. Scoped to admin assignment, same pattern
// as suspend/restore/checkout.

import { buildWebhookDeps, buildCustomEmailDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { sendCustomEmail } from '../../../../../../src/lib/notifications/custom-email';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { subject?: string; message?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }
  if (!body.subject || !body.message) {
    return json(400, { error: 'subject and message are required' });
  }

  const scopeDeps = buildWebhookDeps();
  const customer = await scopeDeps.customers.findById(context.params.id);
  if (!customer) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, customer.id, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await sendCustomEmail(buildCustomEmailDeps(), auth.session.sub, {
    customerId: context.params.id,
    subject: body.subject,
    message: body.message,
  });

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
