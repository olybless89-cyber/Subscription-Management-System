// GET /api/admin/invoices
// Scoped exactly like GET /api/admin/domains: SUPER_ADMIN sees every
// invoice, a plain admin only sees invoices for customers assigned to
// them. Optional ?customerId= filter for the customer detail page.

import { buildWebhookDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, deps.adminAssignments);
  const all = await deps.invoices.listAll();
  let invoices = visible === 'ALL' ? all : all.filter((i) => visible.includes(i.customerId));

  const url = new URL(request.url);
  const customerId = url.searchParams.get('customerId');
  if (customerId) {
    invoices = invoices.filter((i) => i.customerId === customerId);
  }

  return json(200, { invoices });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
