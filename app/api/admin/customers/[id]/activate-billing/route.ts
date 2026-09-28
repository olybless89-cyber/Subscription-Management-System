// POST /api/admin/customers/:id/activate-billing
// Body: { monthsPaid: number }
// Scoped to admin assignment, same as reset-password — any admin with
// access to this customer can activate their billing. Used both by the
// per-customer "Months paid" control on the Customers page and (for a
// batch of already-imported customers) scripts/activate-imported-customers.mjs.
//
// Creates a plan for however many months were paid for (at the flat
// $20/month rate — see DEFAULT_MONTHLY_RATE_MINOR_UNITS in
// src/lib/billing/manage.ts), reusing an existing plan with the same
// cycle/amount/currency, and an ACTIVE subscription starting now.
// Refuses a customer that already has a subscription — this route is
// for onboarding a customer that doesn't have one yet, not for
// changing an existing plan (see PATCH /api/subscriptions/:id).

import { activateCustomerBilling } from '../../../../../../src/lib/billing/manage';
import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { monthsPaid?: number };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!Number.isInteger(body.monthsPaid) || (body.monthsPaid as number) < 1) {
    return json(400, { error: 'monthsPaid must be a positive whole number of months' });
  }

  const scopeDeps = buildWebhookDeps();
  const customer = await scopeDeps.customers.findById(context.params.id);
  if (!customer) {
    return json(404, { error: 'Customer not found' });
  }
  if (!(await canAccessCustomer(auth.session, customer.id, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await activateCustomerBilling(
    buildBillingSetupDeps(),
    auth.session.sub,
    context.params.id,
    body.monthsPaid as number
  );

  const httpStatus =
    result.outcome === 'ACTIVATED'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : result.outcome === 'ALREADY_HAS_SUBSCRIPTION'
            ? 409
            : 400;

  return json(httpStatus, httpStatus >= 400 ? { ...result, error: result.message } : result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
