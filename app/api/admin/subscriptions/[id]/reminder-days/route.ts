// PUT /api/admin/subscriptions/:id/reminder-days
// The opt-in toggle for the automated renewal-reminder cron on one
// subscription (see setSubscriptionReminderDays's doc comment in
// src/lib/subscriptions/renewal-reminder.ts). ADMIN-only, deliberately
// excluding SUPER_ADMIN — see send-reminder/route.ts's comment for why.

import { buildWebhookDeps, buildSendRenewalReminderNowDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { setSubscriptionReminderDays } from '../../../../../../src/lib/subscriptions/renewal-reminder';

export async function PUT(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { days?: number | null };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }
  if (body.days !== null && typeof body.days !== 'number') {
    return json(400, { error: 'days must be a number or null' });
  }

  const scopeDeps = buildWebhookDeps();
  const subscription = await scopeDeps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This subscription is not assigned to you' });
  }

  const result = await setSubscriptionReminderDays(buildSendRenewalReminderNowDeps(), auth.session.sub, context.params.id, body.days ?? null);

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
