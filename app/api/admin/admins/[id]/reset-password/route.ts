// POST /api/admin/admins/:id/reset-password
// SUPER_ADMIN only — see src/lib/admin/password.ts for why this is
// stricter than the canManageOtherAdmins() delegation used for
// createAdmin/setCustomerAssignments elsewhere.

import { resetAdminPassword } from '../../../../../../src/lib/admin/password';
import { buildAdminManagementDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../../src/lib/auth/authorize';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: "Only the super admin can reset another admin's password" });
  }

  let body: { newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.newPassword) {
    return json(400, { error: 'newPassword is required' });
  }

  const result = await resetAdminPassword(buildAdminManagementDeps(), auth.session.sub, context.params.id, body.newPassword);

  const httpStatus =
    result.outcome === 'CHANGED'
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
