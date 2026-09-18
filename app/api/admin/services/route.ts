// GET /api/admin/services — the super-admin "auto-connected services"
// view: every Railway resource currently mapped to a customer, with
// its live status as of the last sync (src/lib/cron/railway-sync.ts).
// Scoped like every other admin listing — SUPER_ADMIN sees everything,
// a plain ADMIN only sees resources for customers assigned to them.

import { buildWebhookDeps, buildPrisma } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';
import { listServicesOverview } from '../../../../src/lib/admin/services-overview';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, deps.adminAssignments);
  const services = await listServicesOverview(buildPrisma(), visible);

  return json(200, { services });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
