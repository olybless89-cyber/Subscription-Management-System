// POST /api/subscriptions/:id/restore
// Admin-only, AND scoped to admin assignment (same rule as suspend) —
// e.g. "customer paid via bank transfer, not through Paystack, restore
// them manually." Passes paymentVerified: true only because a human
// admin, not client input, is asserting it after (presumably) checking
// their bank statement; this is exactly the kind of manual override
// spec section 20 anticipates alongside the payment-webhook-driven path.

import { restoreCustomer } from '../../../../../src/lib/suspension/restoration';
import { buildWebhookDeps, buildRailwayClient, buildAuditLogRepository } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../src/lib/auth/authorize';
import { recordAuditLog } from '../../../../../src/lib/audit/log';

export async function POST(
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

  const result = await restoreCustomer(deps, buildRailwayClient(), context.params.id, {
    manual: true,
    paymentVerified: true,
    performedBy: auth.session.sub,
  });

  await recordAuditLog(buildAuditLogRepository(), {
    actor: auth.session.sub,
    action: 'CUSTOMER_RESTORED',
    target: context.params.id,
    metadata: { outcome: result.outcome },
    result: result.outcome === 'RESTORED' ? 'SUCCESS' : 'FAILED',
  });

  const httpStatus = result.outcome === 'RESTORED' ? 200 : result.outcome === 'SKIPPED' ? 200 : 500;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
