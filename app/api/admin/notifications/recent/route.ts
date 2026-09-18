// GET /api/admin/notifications/recent
// The "Recent Communications" feed on the ADMIN dashboard widget (and
// the Reminders & Actions hub) — every notification sent to any
// customer this admin can see, newest first. ADMIN-only, deliberately
// excluding SUPER_ADMIN (see NotificationRepository's doc comment in
// src/lib/db/ports.ts and AdminWorkflowDeps's doc comment for why this
// whole feature set stays off the super-admin's shared views).

import { buildAdminWorkflowDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, listVisibleCustomerIds } from '../../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const url = new URL(request.url);
  const limitParam = Number(url.searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, 100) : 20;

  const deps = buildAdminWorkflowDeps();
  const customerIds = await listVisibleCustomerIds(auth.session, deps.adminAssignments);
  const notifications = await deps.notificationHistory.listRecentForCustomerIds(customerIds, limit);

  return json(200, { notifications });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
