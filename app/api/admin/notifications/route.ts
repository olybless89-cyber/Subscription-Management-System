// GET /api/admin/notifications
// The calling admin's own notification feed — for a SUPER_ADMIN this
// includes every customer's events; for a plain ADMIN, only events for
// customers assigned to them (that scoping happens at write time in
// notifyAdminsForCustomer, not here — this route just reads what was
// already written for this admin).

import { buildWebhookDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const notifications = await deps.adminNotifications.listForAdmin(auth.session.sub);
  return json(200, { notifications });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
