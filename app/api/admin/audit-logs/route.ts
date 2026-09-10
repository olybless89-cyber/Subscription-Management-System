// GET /api/admin/audit-logs
// Strictly SUPER_ADMIN — not the usual canManageOtherAdmins() delegation
// used elsewhere. This shows every admin's actions system-wide, which is
// more sensitive than the admin list itself. "All activities... seen by
// the super admin" was explicit in the request this feature came from —
// a delegated admin-manager does not get this view.

import { buildAuditLogRepository } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const url = new URL(request.url);
  const limitParam = url.searchParams.get('limit');
  const limit = limitParam ? Math.min(Number(limitParam) || 50, 200) : 50;

  const entries = await buildAuditLogRepository().listRecent(limit);
  return json(200, { entries });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
