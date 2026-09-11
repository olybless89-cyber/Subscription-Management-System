// GET /api/admin/customers/:id — view one customer, scoped
// PATCH /api/admin/customers/:id — edit a narrow set of fields, scoped
// Same pattern as the subscription detail/edit route: status/email/
// customerCode are excluded from PATCH on purpose.

import { buildWebhookDeps, buildAdminManagementDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../src/lib/auth/authorize';
import { updateCustomer } from '../../../../../src/lib/customers/manage';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const customer = await deps.customers.findById(context.params.id);
  if (!customer) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, customer.id, deps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const { passwordHash, ...safe } = customer;
  return json(200, { customer: safe });
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    name?: string;
    notificationEmail?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    serviceStartDate?: string | null;
    serviceEndDate?: string | null;
    websiteType?: 'ONLINE_BANKING' | 'INVESTMENT' | 'ECOMMERCE' | 'DELIVERY' | 'SAAS' | 'WEB_APP' | 'CORPORATE' | 'OTHER' | null;
    paymentProvider?: 'PAYSTACK' | 'FLUTTERWAVE';
    automaticSuspension?: boolean;
    status?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (body.status !== undefined) {
    return json(400, {
      error:
        'status cannot be set here. Use POST /api/subscriptions/:id/suspend or /restore, which verify against Railway/payment before changing it.',
    });
  }

  const scopeDeps = buildWebhookDeps();
  const existing = await scopeDeps.customers.findById(context.params.id);
  if (!existing) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, existing.id, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await updateCustomer(buildAdminManagementDeps(), auth.session.sub, context.params.id, {
    name: body.name,
    notificationEmail: body.notificationEmail,
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    serviceStartDate: body.serviceStartDate,
    serviceEndDate: body.serviceEndDate,
    websiteType: body.websiteType,
    paymentProvider: body.paymentProvider,
    automaticSuspension: body.automaticSuspension,
  });

  const httpStatus =
    result.outcome === 'UPDATED' || result.outcome === 'NO_CHANGES'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : 400;

  if (result.customer) {
    const { passwordHash, ...safe } = result.customer;
    return json(httpStatus, { outcome: result.outcome, message: result.message, customer: safe });
  }
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
