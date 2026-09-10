// GET /api/admin/plans — list all hosting plans
// POST /api/admin/plans — create one (spec section 9)
// Not privilege-sensitive like admin creation — any authenticated admin
// may define plans.

import { buildBillingSetupDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';
import { createPlan } from '../../../../src/lib/billing/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildBillingSetupDeps();
  const plans = await deps.plans.listAll();
  return json(200, { plans });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    name?: string;
    amount?: number;
    currency?: string;
    billingCycle?: 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';
    gracePeriodDays?: number;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.name || !body.amount || !body.billingCycle) {
    return json(400, { error: 'name, amount, and billingCycle are required' });
  }

  const result = await createPlan(buildBillingSetupDeps(), auth.session.sub, {
    name: body.name,
    amount: body.amount,
    currency: body.currency,
    billingCycle: body.billingCycle,
    gracePeriodDays: body.gracePeriodDays,
  });

  const httpStatus = result.outcome === 'CREATED' ? 201 : result.outcome === 'FORBIDDEN' ? 403 : 400;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
