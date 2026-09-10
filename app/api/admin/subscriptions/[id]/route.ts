// GET /api/admin/subscriptions/:id — view one subscription, scoped to assignment
// PATCH /api/admin/subscriptions/:id — edit planId and/or suspensionEnabled ONLY.
// `status` is deliberately not editable here — see updateSubscription()
// in src/lib/billing/manage.ts for why. Use the suspend/restore routes
// (or the dry-run-override route) for anything status-related.

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../src/lib/auth/authorize';
import { updateSubscription } from '../../../../../src/lib/billing/manage';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const subscription = await deps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, deps.adminAssignments))) {
    return json(403, { error: 'This subscription is not assigned to you' });
  }

  return json(200, { subscription });
}

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { planId?: string; suspensionEnabled?: boolean; status?: unknown };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (body.status !== undefined) {
    return json(
      400,
      { error: 'status cannot be set via PATCH — use /suspend, /restore, or /dry-run-override instead' }
    );
  }

  const scopeDeps = buildWebhookDeps();
  const subscription = await scopeDeps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This subscription is not assigned to you' });
  }

  const result = await updateSubscription(buildBillingSetupDeps(), auth.session.sub, context.params.id, {
    planId: body.planId,
    suspensionEnabled: body.suspensionEnabled,
  });

  const httpStatus =
    result.outcome === 'UPDATED'
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
