// PATCH /api/admin/hosting-accounts/:id — relabel, toggle active, or
// rotate the token. DELETE — disconnect (refused while any Railway
// resource still points at it). Both SUPER_ADMIN only.

import { buildBillingSetupDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { updateHostingAccount, deleteHostingAccount } from '../../../../../src/lib/hosting/manage';

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  let body: { label?: string; apiToken?: string; apiUrl?: string | null; isActive?: boolean };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  const result = await updateHostingAccount(buildBillingSetupDeps(), auth.session.sub, context.params.id, body);

  const httpStatus = result.outcome === 'UPDATED' ? 200 : result.outcome === 'FORBIDDEN' ? 403 : 404;
  return json(httpStatus, result);
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const result = await deleteHostingAccount(buildBillingSetupDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'DELETED' ? 200 : result.outcome === 'FORBIDDEN' ? 403 : result.outcome === 'IN_USE' ? 409 : 404;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
