// GET /api/admin/subscriptions/:id/railway-resource — view mappings, SUPER_ADMIN only
// POST /api/admin/subscriptions/:id/railway-resource — spec section 12
// SUPER_ADMIN only — same policy as suspend/restore. Railway
// infrastructure access belongs solely to the super admin; plain admins
// (regardless of which customers are assigned to them) have no ability
// to view or map Railway resources at all.

import { buildBillingSetupDeps, buildWebhookDeps } from '../../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../../src/lib/auth/authorize';
import { mapRailwayResource } from '../../../../../../src/lib/railway/mapping';

export async function GET(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Only the super admin can view Railway resource mappings' });
  }

  const deps = buildWebhookDeps();
  const subscription = await deps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }

  const resources = await deps.railwayResources.findBySubscriptionId(context.params.id);
  return json(200, { resources });
}

export async function POST(
  request: Request,
  context: { params: { id: string } }
): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Only the super admin can map Railway resources' });
  }

  let body: {
    projectId?: string;
    environmentId?: string;
    serviceId?: string;
    deploymentId?: string | null;
    hostingMode?: 'DEDICATED' | 'SHARED_SERVICE' | 'MULTI_TENANT';
    suspensionStrategy?: 'STOP_DEPLOYMENT' | 'APP_LEVEL' | 'REDIRECT' | 'MANUAL';
  };
  try {
    body = await request.json();
  } catch {
    return json(400, { error: 'Malformed JSON body' });
  }

  if (!body.projectId || !body.environmentId || !body.serviceId || !body.hostingMode || !body.suspensionStrategy) {
    return json(400, {
      error: 'projectId, environmentId, serviceId, hostingMode, and suspensionStrategy are all required',
    });
  }

  const scopeDeps = buildWebhookDeps();
  const subscription = await scopeDeps.subscriptions.findById(context.params.id);
  if (!subscription) {
    return json(404, { error: 'Subscription not found' });
  }

  const result = await mapRailwayResource(buildBillingSetupDeps(), auth.session.sub, {
    subscriptionId: context.params.id,
    projectId: body.projectId,
    environmentId: body.environmentId,
    serviceId: body.serviceId,
    deploymentId: body.deploymentId ?? null,
    hostingMode: body.hostingMode,
    suspensionStrategy: body.suspensionStrategy,
  });

  const httpStatus =
    result.outcome === 'CREATED'
      ? 201
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
