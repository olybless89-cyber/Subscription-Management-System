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
import { notifyAdminsForCustomer } from '../../../../../src/lib/notifications/admin-notify';

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
  // The super admin hears about this EITHER way — a suspend that
  // silently didn't take is exactly the 2026-09-29 incident this app
  // already shipped a fix for (see stopDeployment's doc comment in
  // src/lib/railway/deployments.ts); notifying on failure too means
  // nobody has to notice a customer is still up by accident.
  try {
    const isFailure = result.outcome !== 'SUSPENDED' && result.outcome !== 'SKIPPED' && result.outcome !== 'DRY_RUN';
    await notifyAdminsForCustomer(
      deps,
      subscription.customerId,
      isFailure ? 'SUBSCRIPTION_SUSPEND_FAILED' : 'SUBSCRIPTION_SUSPENDED',
      isFailure
        ? `Manual suspend FAILED for this subscription (reason: ${reason}) — ${result.reason}.`
        : `This subscription was manually suspended by an admin (reason: ${reason}).`
    );
  } catch {
    // Best-effort.
  }

  // DRY_RUN is an intentional no-op (the engine logged what it *would*
  // have done and stopped there) — it is not a failure, so it must not
  // map to a 500. Before this fix, any subscription with dry-run active
  // (global SUSPENSION_DRY_RUN env, or this subscription's own
  // dryRunOverride) made a manual admin Suspend click always come back
  // as an opaque "Request failed (500)" even though nothing was wrong.
  const isSuccessLike = result.outcome === 'SUSPENDED' || result.outcome === 'SKIPPED' || result.outcome === 'DRY_RUN';
  const httpStatus = isSuccessLike ? 200 : 500;
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
