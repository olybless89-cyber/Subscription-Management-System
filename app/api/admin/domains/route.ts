// GET /api/admin/domains — scoped listing (SUPER_ADMIN sees all,
// plain ADMIN only sees domains belonging to their assigned customers)
// POST /api/admin/domains — attach a domain to a customer, scoped to
// admin assignment via customerId

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';
import { createDomain } from '../../../../src/lib/domains/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildBillingSetupDeps();
  const scopeDeps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, scopeDeps.adminAssignments);
  const all = await deps.domains.listAll();
  let domains = visible === 'ALL' ? all : all.filter((d) => visible.includes(d.customerId));

  // Optional convenience filter — e.g. the customer/subscription detail
  // pages use this to show just that customer's domain(s) inline,
  // without a separate route. Still respects the scoping above: a plain
  // admin can't use this to peek at a customer they can't otherwise see.
  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId');
  if (customerId) {
    domains = domains.filter((d) => d.customerId === customerId);
  }

  return json(200, { domains });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: { customerId?: string; domainName?: string; isPrimary?: boolean };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.customerId || !body.domainName) {
    return json(400, { error: 'customerId and domainName are required' });
  }

  const scopeDeps = buildWebhookDeps();
  if (!(await canAccessCustomer(auth.session, body.customerId, scopeDeps.adminAssignments))) {
    return json(403, { error: 'This customer is not assigned to you' });
  }

  const result = await createDomain(buildBillingSetupDeps(), auth.session.sub, {
    customerId: body.customerId,
    domainName: body.domainName,
    isPrimary: body.isPrimary,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : result.outcome === 'ALREADY_EXISTS'
            ? 409
            : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
