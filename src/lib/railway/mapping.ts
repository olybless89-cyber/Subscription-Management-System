import { BillingSetupDeps } from '../db/ports';
import { RailwayResourceRecord, HostingMode, SuspensionStrategyValue } from '@/types/domain';

export interface MapRailwayResourceInput {
  subscriptionId: string;
  projectId: string;
  environmentId: string;
  serviceId: string;
  deploymentId?: string | null;
  hostingMode: HostingMode;
  suspensionStrategy: SuspensionStrategyValue;
}

export type MapRailwayResourceOutcome = 'CREATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT';

export interface MapRailwayResourceResult {
  outcome: MapRailwayResourceOutcome;
  message: string;
  resource?: RailwayResourceRecord;
}

/**
 * mapRailwayResource — spec section 12. Deliberately a separate step
 * from createSubscription (spec sections 8-9): a subscription can exist
 * before infrastructure is provisioned, and this is the step that wires
 * it to a real Railway project/service.
 *
 * The one piece of business logic worth calling out: hostingMode and
 * suspensionStrategy aren't independently free-form — MULTI_TENANT can
 * ONLY pair with APP_LEVEL (spec section 16: "Never stop the Railway
 * service" for multi-tenant resources). This is enforced here, at
 * data-entry time, not just inside suspendCustomer at suspension time —
 * so a bad pairing can't even get saved, rather than silently sitting in
 * the database until the day it's suspended and something goes wrong.
 * DEDICATED/SHARED_SERVICE are compatible with STOP_DEPLOYMENT, REDIRECT,
 * or MANUAL — any of those are safe for a resource that CAN be
 * individually stopped.
 */
export async function mapRailwayResource(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  input: MapRailwayResourceInput
): Promise<MapRailwayResourceResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const subscription = await deps.subscriptions.findById(input.subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  if (!input.projectId?.trim() || !input.environmentId?.trim() || !input.serviceId?.trim()) {
    return { outcome: 'INVALID_INPUT', message: 'projectId, environmentId, and serviceId are all required' };
  }

  if (input.hostingMode === 'MULTI_TENANT' && input.suspensionStrategy !== 'APP_LEVEL') {
    return {
      outcome: 'INVALID_INPUT',
      message:
        'MULTI_TENANT resources must use APP_LEVEL suspension — any strategy that could stop the shared Railway service would take down every other customer on it too.',
    };
  }
  if (input.hostingMode !== 'MULTI_TENANT' && input.suspensionStrategy === 'APP_LEVEL') {
    return {
      outcome: 'INVALID_INPUT',
      message: `APP_LEVEL suspension only makes sense for MULTI_TENANT — a ${input.hostingMode} resource should use STOP_DEPLOYMENT, REDIRECT, or MANUAL instead.`,
    };
  }

  const resource = await deps.railwayResources.create({
    subscriptionId: input.subscriptionId,
    projectId: input.projectId.trim(),
    environmentId: input.environmentId.trim(),
    serviceId: input.serviceId.trim(),
    deploymentId: input.deploymentId ?? null,
    hostingMode: input.hostingMode,
    suspensionStrategy: input.suspensionStrategy,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'RAILWAY_RESOURCE_MAPPED',
    target: resource.id,
    metadata: {
      subscriptionId: input.subscriptionId,
      hostingMode: resource.hostingMode,
      suspensionStrategy: resource.suspensionStrategy,
    },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Railway resource mapped', resource };
}
