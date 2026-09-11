// POST /api/admin/campaigns/:id/send
// Dispatches every recipient of a DRAFT campaign. Only the campaign's
// creator or a SUPER_ADMIN can trigger this — see
// src/lib/campaigns/manage.ts for the full contract (per-recipient
// failure isolation, no re-sending an already-sent campaign).

import { buildCampaignDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../../src/lib/auth/authorize';
import { sendCampaign } from '../../../../../../src/lib/campaigns/manage';

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const result = await sendCampaign(buildCampaignDeps(), auth.session.sub, context.params.id);

  const httpStatus =
    result.outcome === 'SENT'
      ? 200
      : result.outcome === 'FORBIDDEN'
        ? 403
        : result.outcome === 'NOT_FOUND'
          ? 404
          : 400;

  return json(httpStatus, result);
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
