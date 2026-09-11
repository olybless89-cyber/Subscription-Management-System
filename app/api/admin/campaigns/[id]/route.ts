// GET /api/admin/campaigns/:id — a campaign plus every recipient's
// delivery status.

import { buildCampaignDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['ADMIN', 'SUPER_ADMIN'])) {
    return json(403, { error: 'Admin access required' });
  }

  const deps = buildCampaignDeps();
  const campaign = await deps.campaigns.findById(context.params.id);
  if (!campaign) {
    return json(404, { error: 'Campaign not found' });
  }
  if (auth.session.role !== 'SUPER_ADMIN' && campaign.createdBy !== auth.session.sub) {
    return json(403, { error: 'Only the campaign creator or the super admin can view it' });
  }

  const recipients = await deps.campaigns.findRecipientsByCampaignId(context.params.id);
  return json(200, { campaign, recipients });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
