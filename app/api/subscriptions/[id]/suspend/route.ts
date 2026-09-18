// POST /api/subscriptions/:id/suspend
// SUPER_ADMIN only. Per an explicit policy decision: Railway
// infrastructure and the power to suspend a customer's service belong
// solely to the super admin — plain admins (however many are created)
// have no suspend/restore/Railway access at all, regardless of which
// customers are assigned to them. Manual suspension bypasses the
// customer's automaticSuspension=false override (that override only
// protects against the automated cron worker, not an admin who's
// decided to suspend anyway) but still runs through the exact same
// safety-checked suspendCustomer engine as the cron path — there is no
// separate, less-safe "admin suspend" code path to accidentally reach a
// forbidden action through.

import { suspendCustomer } from '../../../../../src/lib/suspension/engine';
import { buildWebhookDeps, buildAuditLogRepository } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { recordAuditLog } from '../../../../../src/lib/audit/log';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Only the super admin can suspend a subscription' });
  }

  const deps = buildWebhookDeps();

  const subscription = await deps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }

  let body: { reason?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const reason = body.reason?.trim() || 'MANUAL_ADMIN_SUSPENSION';

  const result = await suspendCustomer(deps, context.params.id, reason, {
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
  return json(httpStatus, httpStatus >= 400 ? { ...result, error: buildFailureMessage(result) } : result);
}

// Surface *why* a suspend failed instead of a bare 500. `result.reason` is
// the engine-level summary ("One or more Railway resources failed to
// suspend"); the first FAILED resourceResults[].detail carries the actual
// cause (e.g. a missing hostingAccountId, a Railway API error) that the
// admin needs to act on. Without this, the client's generic
// "Request failed (500)" fallback was the only thing ever shown.
function buildFailureMessage(result: {
  reason: string;
  resourceResults: Array<{ resourceId: string; result: string; detail: string }>;
}): string {
  const firstFailure = result.resourceResults.find((r) => r.result === 'FAILED');
  return firstFailure ? `${result.reason} — ${firstFailure.detail}` : result.reason;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
