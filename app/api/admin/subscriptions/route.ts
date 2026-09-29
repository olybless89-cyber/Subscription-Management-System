// GET /api/admin/subscriptions — scoped listing (SUPER_ADMIN sees all,
// plain ADMIN only sees subscriptions belonging to their assigned
// customers)
// POST /api/admin/subscriptions — spec sections 8-9
// Scoped: a plain ADMIN can only create a subscription for a customer
// assigned to them; SUPER_ADMIN can for anyone. Does NOT create Railway
// infrastructure — see the separate
// /api/admin/subscriptions/:id/railway-resource route for that step.

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';
import { createSubscription, findOrCreatePlanForMonths } from '../../../../src/lib/billing/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, deps.adminAssignments);
  const all = await deps.subscriptions.listAll();
  const subscriptions = visible === 'ALL' ? all : all.filter((s) => visible.includes(s.customerId));

  return json(200, { subscriptions });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    customerId?: string;
    planId?: string;
    /** Alternative to planId — "N months at the standard $20/month
     * rate," resolved via findOrCreatePlanForMonths (same helper the
     * per-customer "Months paid" activation flow uses) instead of
     * requiring a Plan row to already exist. Ignored if planId is
     * also present. */
    monthsPaid?: number;
    status?: 'TRIAL' | 'ACTIVE';
    startDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.customerId || !(body.planId || body.monthsPaid)) {
    return json(400, { error: 'customerId and either planId or monthsPaid are required' });
  }

  // Scoped-visibility check happens here (route layer), same pattern as
  // checkout/suspend/restore — the business-logic function itself stays
  // authorization-agnostic.
  const scopeDeps = buildWebhookDeps();
  if (!(await canAccessCustomer(auth.session, body.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const billingDeps = buildBillingSetupDeps();

  let planId = body.planId;
  if (!planId) {
    if (!Number.isInteger(body.monthsPaid) || (body.monthsPaid as number) < 1) {
      return json(400, { error: 'monthsPaid must be a positive whole number of months' });
    }
    const plan = await findOrCreatePlanForMonths(billingDeps, auth.session.sub, body.monthsPaid as number);
    planId = plan.id;
  }

  const result = await createSubscription(billingDeps, auth.session.sub, {
    customerId: body.customerId,
    planId,
    status: body.status,
    startDate: body.startDate,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
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
