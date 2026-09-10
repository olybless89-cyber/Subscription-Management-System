// POST /api/auth/customer-login
// Body: { email, password } -> { token } on success.

import { authenticateCustomer } from '../../../../src/lib/auth/authenticate';
import { buildAuthDeps } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }
  if (!body.email || !body.password) {
    return json(400, { error: 'email and password are required' });
  }

  const result = await authenticateCustomer(buildAuthDeps(), body.email, body.password);

  if (result.outcome === 'ACCOUNT_NOT_USABLE') {
    return json(403, { error: result.reason });
  }
  if (result.outcome !== 'SUCCESS') {
    return json(401, { error: 'Invalid email or password' });
  }

  return json(200, { token: result.token });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
