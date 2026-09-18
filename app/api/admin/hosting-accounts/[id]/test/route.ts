// POST /api/admin/hosting-accounts/:id/test — a cheap, read-only check
// that the stored credential is valid and reachable. SUPER_ADMIN only.

import { buildBillingSetupDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../../src/lib/auth/authorize';
import { testHostingAccount } from '../../../../../../src/lib/hosting/manage';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const result = await testHostingAccount(buildBillingSetupDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'OK'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : 502;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
