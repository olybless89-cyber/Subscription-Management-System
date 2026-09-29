// POST /api/subscriptions/:id/restore
// SUPER_ADMIN only — same policy as suspend, see that route's comment.
// e.g. "customer paid via bank transfer, not through Paystack, restore
// them manually." Passes paymentVerified: true only because a human
// admin, not client input, is asserting it after (presumably) checking
// their bank statement; this is exactly the kind of manual override
// spec section 20 anticipates alongside the payment-webhook-driven path.

import { restoreCustomer } from '../../../../../src/lib/suspension/restoration';
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
    return json(403, { error: 'Only the super admin can restore a subscription' });
  }

  const deps = buildWebhookDeps();

  const subscription = await deps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }

  const result = await restoreCustomer(deps, context.params.id, {
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
  // Notify either way — see the identical comment in the suspend route.
  // This is exactly the scenario from the 2026-09-29 incident: an admin
  // clicked Restore, believed it worked, and the super admin had no way
  // to find out otherwise that it hadn't.
  try {
    const isFailure = result.outcome !== 'RESTORED' && result.outcome !== 'SKIPPED';
    await notifyAdminsForCustomer(
      deps,
      subscription.customerId,
      isFailure ? 'SUBSCRIPTION_RESTORE_FAILED' : 'SUBSCRIPTION_RESTORED',
      isFailure
        ? `Manual restore FAILED for this subscription — ${result.reason}.`
        : `This subscription was manually restored by an admin.`
    );
  } catch {
    // Best-effort.
  }

  const httpStatus = result.outcome === 'RESTORED' ? 200 : result.outcome === 'SKIPPED' ? 200 : 500;
  return json(httpStatus, httpStatus >= 400 ? { ...result, error: buildFailureMessage(result) } : result);
}

// Surface *why* a restore failed instead of a bare 500 — mirrors the same
// fix in the suspend route. See that file's comment for rationale.
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
