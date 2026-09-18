// GET /api/admin/hosting-accounts — list connected hosting accounts,
// safe shape only (no credentials). SUPER_ADMIN only — same bar as
// every other Railway-infrastructure route, and higher: this lists
// which accounts EXIST, and existence + label is still sensitive even
// without the token attached.
// POST /api/admin/hosting-accounts — connect a new account.

import { buildBillingSetupDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';
import { createHostingAccount } from '../../../../src/lib/hosting/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const deps = buildBillingSetupDeps();
  const accounts = await deps.hostingAccounts.listAll();
  return json(200, { accounts });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  let body: { provider?: string; label?: string; apiToken?: string; apiUrl?: string | null };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.provider || !body.label || !body.apiToken) {
    return json(400, { error: 'provider, label, and apiToken are all required' });
  }

  const result = await createHostingAccount(buildBillingSetupDeps(), auth.session.sub, {
    provider: body.provider as 'RAILWAY' | 'DIGITALOCEAN' | 'AWS' | 'VERCEL',
    label: body.label,
    apiToken: body.apiToken,
    apiUrl: body.apiUrl,
  });

  const httpStatus = result.outcome === 'CREATED' ? 201 : result.outcome === 'FORBIDDEN' ? 403 : 400;
  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
