// POST /api/public/register
// Deliberately UNAUTHENTICATED — this is the actual public signup form.
// All the real validation and safety (password length, duplicate email,
// domain uniqueness) lives in registerCustomer() and is tested there.

import { buildRegisterCustomerDeps } from '../../../../src/lib/deps-factory';
import { registerCustomer } from '../../../../src/lib/customers/manage';

export async function POST(request: Request): Promise<Response> {
  let body: {
    name?: string;
    email?: string;
    password?: string;
    phone?: string;
    dateOfBirth?: string;
    websiteType?: 'ONLINE_BANKING' | 'INVESTMENT' | 'ECOMMERCE' | 'DELIVERY' | 'SAAS' | 'WEB_APP' | 'CORPORATE' | 'OTHER';
    domainName?: string;
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.name || !body.email || !body.password || !body.domainName) {
    return json(400, { error: 'name, email, password, and domainName are all required' });
  }

  const result = await registerCustomer(buildRegisterCustomerDeps(), {
    name: body.name,
    email: body.email,
    password: body.password,
    phone: body.phone ?? null,
    dateOfBirth: body.dateOfBirth ?? null,
    websiteType: body.websiteType ?? null,
    domainName: body.domainName,
  });

  const httpStatus = result.outcome === 'REGISTERED' ? 201 : result.outcome === 'ALREADY_EXISTS' ? 409 : 400;

  // Never return the password hash, even though registerCustomer's
  // return value carries it internally — this is the boundary where
  // that stops.
  if (result.customer) {
    const { passwordHash, ...safeCustomer } = result.customer;
    return json(httpStatus, { ...result, customer: safeCustomer });
  }

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
