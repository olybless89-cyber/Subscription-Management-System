// POST /api/auth/change-password
// Any authenticated admin (SUPER_ADMIN or plain ADMIN) changing their
// own password. Requires the current password — see
// src/lib/admin/password.ts for why this differs from the super-admin
// reset path.

import { changeOwnPassword } from '../../../../src/lib/admin/password';
import { buildAdminManagementDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { currentPassword?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.currentPassword || !body.newPassword) {
    return json(400, { error: 'currentPassword and newPassword are required' });
  }

  const result = await changeOwnPassword(buildAdminManagementDeps(), auth.session.sub, body.currentPassword, body.newPassword);

  const httpStatus =
    result.outcome === 'CHANGED'
      ? 200
      : result.outcome === 'WRONG_CURRENT_PASSWORD'
        ? 401
        : result.outcome === 'FORBIDDEN'
          ? 403
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
