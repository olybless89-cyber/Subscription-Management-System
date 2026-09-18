// POST /api/admin/subscriptions/:id/send-reminder
// The manual "Send Reminder" button in the Reminders & Actions hub (see
// sendRenewalReminderNow's doc comment in
// src/lib/subscriptions/renewal-reminder.ts). ADMIN-only, deliberately
// excluding SUPER_ADMIN — this whole feature set is "for the other
// admins only, do not touch super admin", so a SUPER_ADMIN session gets
// a plain 403 here exactly like every other new route in this feature.

import { buildWebhookDeps, buildSendRenewalReminderNowDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../../src/lib/auth/authorize';
import { sendRenewalReminderNow } from '../../../../../../src/lib/subscriptions/renewal-reminder';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const scopeDeps = buildWebhookDeps();
  const subscription = await scopeDeps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }
  if (!(await canAccessCustomer(auth.session, subscription.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This subscription is not assigned to you' });
  }

  const result = await sendRenewalReminderNow(buildSendRenewalReminderNowDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'SENT'
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
