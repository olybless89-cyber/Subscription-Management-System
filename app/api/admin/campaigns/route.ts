// GET /api/admin/campaigns — list campaigns. SUPER_ADMIN sees every
// campaign; a plain admin only sees campaigns they created themselves.
// POST /api/admin/campaigns — create a DRAFT campaign. Does not send
// anything — see the separate /send route for that.

import { buildCampaignDeps } from '../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../src/lib/auth/authorize';
import { createCampaign } from '../../../../src/lib/campaigns/manage';

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildCampaignDeps();
  const campaigns =
    auth.session.role === 'SUPER_ADMIN'
      ? await deps.campaigns.listAll()
      : await deps.campaigns.listByCreator(auth.session.sub);

  return json(200, { campaigns });
}

export async function POST(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  let body: {
    name?: string;
    channels?: Array<'EMAIL' | 'WHATSAPP'>;
    subject?: string;
    message?: string;
    customerIds?: string[];
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.name || !body.channels || !body.message || !body.customerIds) {
    return json(400, { error: 'name, channels, message, and customerIds are all required' });
  }

  const result = await createCampaign(buildCampaignDeps(), auth.session.sub, {
    name: body.name,
    channels: body.channels,
    subject: body.subject,
    message: body.message,
    customerIds: body.customerIds,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'OUT_OF_SCOPE'
          ? 403
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
