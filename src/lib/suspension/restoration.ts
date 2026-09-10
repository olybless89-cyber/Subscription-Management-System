import { RailwayClient } from '../railway/client';
import { redeployService, verifyDeploymentReachesStatus } from '../railway/deployments';
import { EngineDeps } from '../db/ports';
import { RailwayResourceRecord, SuspensionResult } from '@/types/domain';

export interface RestoreCustomerOptions {
  performedBy?: string | null;
  manual?: boolean;
  /** Set true once the caller has independently verified payment. Restoration
   * must never run off client-side confirmation (spec section 10). */
  paymentVerified: boolean;
}

export interface RestoreCustomerResult {
  outcome: 'RESTORED' | 'SKIPPED' | 'FAILED';
  reason: string;
  resourceResults: Array<{ resourceId: string; result: SuspensionResult; detail: string }>;
}

/**
 * restoreCustomer — spec section 20. Mirrors suspendCustomer's structure:
 * verify preconditions, act per hosting mode, verify the result before
 * ever reporting ACTIVE.
 */
export async function restoreCustomer(
  deps: EngineDeps,
  railway: RailwayClient,
  subscriptionId: string,
  opts: RestoreCustomerOptions
): Promise<RestoreCustomerResult> {
  if (!opts.paymentVerified && !opts.manual) {
    return {
      outcome: 'FAILED',
      reason: 'Refusing to restore: payment not verified server-side',
      resourceResults: [],
    };
  }

  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'FAILED', reason: 'Subscription not found', resourceResults: [] };
  }

  const customer = await deps.customers.findById(subscription.customerId);
  if (!customer) {
    return { outcome: 'FAILED', reason: 'Customer not found', resourceResults: [] };
  }

  if (subscription.status !== 'SUSPENDED') {
    return {
      outcome: 'SKIPPED',
      reason: `Subscription is ${subscription.status}, not SUSPENDED — nothing to restore`,
      resourceResults: [],
    };
  }

  const resources = await deps.railwayResources.findBySubscriptionId(subscriptionId);
  const resourceResults: RestoreCustomerResult['resourceResults'] = [];

  for (const resource of resources) {
    const outcome = await executeRestorationForResource(railway, resource);
    resourceResults.push(outcome);

    await deps.railwayResources.updateStatus(
      resource.id,
      outcome.result === 'SUCCESS' ? 'ACTIVE' : 'ERROR',
      {
        deploymentId: outcome.newDeploymentId ?? undefined,
        lastError: outcome.result === 'SUCCESS' ? null : outcome.detail,
      }
    );
  }

  const anyHardFailure = resourceResults.some((r) => r.result === 'FAILED');

  if (anyHardFailure) {
    await deps.suspensionEvents.create({
      subscriptionId,
      action: 'RESTORED',
      reason: 'Restoration attempt',
      strategy: resources[0]?.suspensionStrategy ?? 'APP_LEVEL',
      result: 'FAILED',
      errorMessage: resourceResults.find((r) => r.result === 'FAILED')?.detail,
      performedBy: opts.performedBy ?? null,
      dryRun: false,
    });
    // Never flip subscription/customer to ACTIVE without verified restoration.
    return { outcome: 'FAILED', reason: 'One or more Railway resources failed to restore', resourceResults };
  }

  await deps.subscriptions.updateStatus(subscriptionId, 'ACTIVE', { suspendedAt: null });
  await deps.customers.updateStatus(customer.id, 'ACTIVE');

  await deps.suspensionEvents.create({
    subscriptionId,
    action: opts.manual ? 'MANUAL_RESTORATION' : 'RESTORED',
    reason: 'Payment verified — service restored',
    strategy: resources[0]?.suspensionStrategy ?? 'APP_LEVEL',
    result: 'SUCCESS',
    performedBy: opts.performedBy ?? null,
    dryRun: false,
  });

  await deps.notifications.send(
    customer.id,
    'RESTORED',
    'Your Web Oracle Host service has been successfully restored.'
  );

  return { outcome: 'RESTORED', reason: 'Payment verified — service restored', resourceResults };
}

async function executeRestorationForResource(
  railway: RailwayClient,
  resource: RailwayResourceRecord
): Promise<{
  resourceId: string;
  result: SuspensionResult;
  detail: string;
  newDeploymentId?: string;
}> {
  if (resource.hostingMode === 'MULTI_TENANT') {
    // Section 20: access restored immediately, no Railway call — the
    // service was never stopped for MULTI_TENANT in the first place.
    return { resourceId: resource.id, result: 'SUCCESS', detail: 'Access restored (subscription status only)' };
  }

  // DEDICATED / SHARED_SERVICE — redeploy this customer's service only.
  try {
    const { deploymentId } = await redeployService(railway, resource.serviceId, resource.environmentId);
    if (!deploymentId) {
      return { resourceId: resource.id, result: 'FAILED', detail: 'Redeploy did not return a deployment id' };
    }

    const { reached, finalStatus } = await verifyDeploymentReachesStatus(railway, deploymentId, [
      'SUCCESS',
      'ACTIVE',
    ]);

    return {
      resourceId: resource.id,
      result: reached ? 'SUCCESS' : 'FAILED',
      detail: `redeployService -> deployment ${deploymentId} status ${finalStatus}`,
      newDeploymentId: deploymentId,
    };
  } catch (err) {
    return {
      resourceId: resource.id,
      result: 'FAILED',
      detail: err instanceof Error ? err.message : 'Unknown Railway error',
    };
  }
}
