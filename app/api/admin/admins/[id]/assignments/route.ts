// GET/POST /api/admin/admins/:id/assignments
// GET returns the customer ids currently visible to this admin.
// POST replaces that set entirely (spec extension: "select a particular
// set of users and group them under this admin").
// Both gated by the same permission model as create-admin — see
// src/lib/admin/manage.ts.

import { setCustomerAssignments } from '../../../../../../src/lib/admin/manage';
import { buildAdminManagementDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../../src/lib/auth/authorize';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildAdminManagementDeps();
  const customerIds = await deps.adminAssignments.listCustomerIdsForAdmin(context.params.id);
  return json(200, { adminId: context.params.id, customerIds });
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { customerIds?: string[] };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }
  if (!Array.isArray(body.customerIds)) {
    return json(400, { error: 'customerIds must be an array of customer id strings' });
  }

  const result = await setCustomerAssignments(
    buildAdminManagementDeps(),
    auth.session.sub,
    context.params.id,
    body.customerIds
  );

  const httpStatus =
    result.outcome === 'UPDATED'
      ? 200
      : result.outcome === 'FORBIDDEN' || result.outcome === 'OUT_OF_SCOPE'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
