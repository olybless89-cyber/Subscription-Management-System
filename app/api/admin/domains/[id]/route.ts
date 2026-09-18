// PATCH /api/admin/domains/:id — rename, flip isPrimary, or re-link the
// governing subscription, scoped to admins who can see the domain's
// customer (same bar as attaching a domain in the first place).
// DELETE /api/admin/domains/:id — SUPER_ADMIN only, spec section 43's
// explicit permanent-teardown path (see src/lib/domains/manage.ts).

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer } from '../../../../../src/lib/auth/authorize';
import { updateDomain, deleteDomain } from '../../../../../src/lib/domains/manage';

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { domainName?: string; isPrimary?: boolean; subscriptionId?: string | null };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  const scopeDeps = buildWebhookDeps();
  const billingDeps = buildBillingSetupDeps();
  const existing = await billingDeps.domains.findById(context.params.id);
  if (!existing) {
    return json(404, { error: 'Domain not found' });
  }
  if (!(await canAccessCustomer(auth.session, existing.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await updateDomain(billingDeps, auth.session.sub, context.params.id, {
    domainName: body.domainName,
    isPrimary: body.isPrimary,
    subscriptionId: body.subscriptionId,
  });

  const httpStatus =
    result.outcome === 'UPDATED'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : result.outcome === 'ALREADY_EXISTS'
            ? 409
            : 400;

  return json(httpStatus, result);
}

export async function DELETE(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Only the super admin can permanently delete a domain' });
  }

  const result = await deleteDomain(buildBillingSetupDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'DELETED' ? 200 : result.outcome === 'FORBIDDEN' ? 403 : 404;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
