// GET /api/admin/customers — spec section 39 (list)
// POST /api/admin/customers — spec sections 5 & 39 (create)
//
// GET returns the customers visible to the calling admin: everyone for
// SUPER_ADMIN, only assigned customers for a plain ADMIN.
//
// POST creates a customer with an auto-generated, sequential
// customerCode (WOH-000001, ...). If the creator is a plain (non-super)
// admin, they're automatically assigned to the customer they just
// created — see createCustomer() in src/lib/customers/manage.ts for why.

import { buildWebhookDeps, buildAdminManagementDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole, listVisibleCustomerIds } from '../../../../src/lib/auth/authorize';
import { createCustomer } from '../../../../src/lib/customers/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildWebhookDeps();
  const visible = await listVisibleCustomerIds(auth.session, deps.adminAssignments);

  const customers = visible === 'ALL' ? await deps.customers.listAll() : await deps.customers.findByIds(visible);

  // Never expose passwordHash over the API.
  const safe = customers.map(({ passwordHash, ...rest }) => rest);
  return json(200, { customers: safe });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    name?: string;
    email?: string;
    notificationEmail?: string;
    phone?: string;
    dateOfBirth?: string;
    serviceStartDate?: string;
    serviceEndDate?: string;
    websiteType?: 'ONLINE_BANKING' | 'INVESTMENT' | 'ECOMMERCE' | 'DELIVERY' | 'SAAS' | 'WEB_APP' | 'CORPORATE' | 'OTHER';
    domainName?: string;
    paymentProvider?: 'PAYSTACK' | 'FLUTTERWAVE';
    automaticSuspension?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.name || !body.email) {
    return json(400, { error: 'name and email are required' });
  }

  const result = await createCustomer(buildAdminManagementDeps(), auth.session.sub, {
    name: body.name,
    email: body.email,
    notificationEmail: body.notificationEmail ?? null,
    phone: body.phone ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    serviceStartDate: body.serviceStartDate ?? null,
    serviceEndDate: body.serviceEndDate ?? null,
    websiteType: body.websiteType ?? null,
    domainName: body.domainName ?? null,
    paymentProvider: body.paymentProvider,
    automaticSuspension: body.automaticSuspension,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'ALREADY_EXISTS'
          ? 409
          : 400;

  const { customer, ...rest } = result;
  const safeCustomer = customer ? (({ passwordHash, ...c }) => c)(customer) : undefined;
  return json(httpStatus, { ...rest, customer: safeCustomer });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
