// POST /api/subscriptions/:id/suspend
// Admin-only. Manual suspension bypasses the customer's
// automaticSuspension=false override (that override only protects
// against the automated cron worker, not an admin who's decided to
// suspend anyway) but still runs through the exact same safety-checked
// suspendCustomer engine as the cron path — there is no separate,
// less-safe "admin suspend" code path to accidentally reach a forbidden
// action through.

import { suspendCustomer } from '../../../../../src/lib/suspension/engine';
import { buildWebhookDeps, buildRailwayClient, buildAuditLogRepository } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { recordAuditLog } from '../../../../../src/lib/audit/log';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = body.reason?.trim() || 'MANUAL_ADMIN_SUSPENSION';

  const deps = buildWebhookDeps();
  const result = await suspendCustomer(deps, buildRailwayClient(), context.params.id, reason, {
    manual: true,
    performedBy: auth.session.sub,
  });

  await recordAuditLog(buildAuditLogRepository(), {
    actor: auth.session.sub,
    action: 'CUSTOMER_SUSPENDED',
    target: context.params.id,
    metadata: { reason, outcome: result.outcome },
    result: result.outcome === 'SUSPENDED' ? 'SUCCESS' : 'FAILED',
  });

  const httpStatus = result.outcome === 'SUSPENDED' ? 200 : result.outcome === 'SKIPPED' ? 200 : 500;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
