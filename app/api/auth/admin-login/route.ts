// POST /api/auth/admin-login
// Body: { email, password } -> { token } on success.
// Logic (authenticateAdmin) is tested in tests/auth.test.ts independent
// of Next.js/Prisma.

import { authenticateAdmin } from '../../../../src/lib/auth/authenticate';
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

  const result = await authenticateAdmin(buildAuthDeps(), body.email, body.password);

  if (result.outcome !== 'SUCCESS') {
    // Same 401 + generic message regardless of *why* — see the comment
    // in authenticate.ts about not leaking which emails exist.
    return json(401, { error: 'Invalid email or password' });
  }

  return json(200, { token: result.token, role: result.record.role });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
