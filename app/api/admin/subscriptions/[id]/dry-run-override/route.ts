// POST /api/admin/subscriptions/:id/dry-run-override
// Body: { "override": true | false | null }
// Scoped to admin assignment, same as suspend/restore — a plain ADMIN
// can only set this on a subscription assigned to them.

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { setSubscriptionDryRunOverride } from '../../../../../../src/lib/suspension/dry-run-override';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { override?: boolean | null };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }
  if (body.override !== true && body.override !== false && body.override !== null) {
    return json(400, { error: 'override must be true, false, or null' });
  }

  const scopeDeps = buildWebhookDeps();
  const subscription = await scopeDeps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This subscription is not assigned to you' });
  }

  const result = await setSubscriptionDryRunOverride(
    buildBillingSetupDeps(),
    auth.session.sub,
    context.params.id,
    body.override
  );

  const httpStatus = result.outcome === 'UPDATED' ? 200 : result.outcome === 'FORBIDDEN' ? 403 : 404;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
