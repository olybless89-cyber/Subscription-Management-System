import { RailwayClient } from '../railway/client';
import { stopDeployment } from '../railway/deployments';
import { EngineDeps } from '../db/ports';
import { assertStrategyAutomatable, ForbiddenSuspensionActionError } from './safety';
import { RailwayResourceRecord, SuspensionResult, SubscriptionRecord } from '@/types/domain';

export interface SuspendCustomerOptions {
  /** Who triggered this. Omit for the automated worker. */
  performedBy?: string | null;
  /** Overrides both the per-subscription dryRunOverride AND the global
   * SUSPENSION_DRY_RUN env for this call — used by tests / admin preview.
   * Leave undefined to let the per-subscription/global resolution apply. */
  dryRun?: boolean;
  /** Set true for admin-initiated manual suspension (bypasses automaticSuspension flag). */
  manual?: boolean;
}

export interface SuspendCustomerResult {
  outcome: 'SUSPENDED' | 'SKIPPED' | 'FAILED' | 'DRY_RUN';
  reason: string;
  resourceResults: Array<{ resourceId: string; result: SuspensionResult; detail: string }>;
}

/**
 * Precedence, highest first:
 *   1. opts.dryRun, if explicitly passed — tests/admin preview only.
 *   2. subscription.dryRunOverride, if not null — lets one subscription
 *      be tested for real (override: false) or force-protected
 *      (override: true) independent of the global switch.
 *   3. The global SUSPENSION_DRY_RUN env var.
 */
function isDryRun(opts: SuspendCustomerOptions | undefined, subscription: SubscriptionRecord): boolean {
  if (opts?.dryRun !== undefined) return opts.dryRun;
  if (subscription.dryRunOverride !== null && subscription.dryRunOverride !== undefined) {
    return subscription.dryRunOverride;
  }
  return process.env.SUSPENSION_DRY_RUN === 'true';
}

/**
 * suspendCustomer — the single entry point for taking a subscription from
 * an unsuspended state to SUSPENDED. Implements spec section 14 step by
 * step. Never throws for expected business conditions (already suspended,
 * automaticSuspension off) — those are SKIPPED outcomes, not errors.
 * Only throws for programmer errors (forbidden action reached) or lets
 * RailwayApiError bubble for the caller to log, since that's an
 * infrastructure failure that must not be swallowed (section 37).
 */
export async function suspendCustomer(
  deps: EngineDeps,
  railway: RailwayClient,
  subscriptionId: string,
  reason: string,
  opts: SuspendCustomerOptions = {}
): Promise<SuspendCustomerResult> {
  // 1-2. Load subscription, verify exists.
  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'FAILED', reason: 'Subscription not found', resourceResults: [] };
  }

  // 3. Verify customer.
  const customer = await deps.customers.findById(subscription.customerId);
  if (!customer) {
    return { outcome: 'FAILED', reason: 'Customer not found', resourceResults: [] };
  }

  // 4. Already suspended? Idempotent no-op.
  if (subscription.status === 'SUSPENDED') {
    return { outcome: 'SKIPPED', reason: 'Subscription already SUSPENDED', resourceResults: [] };
  }

  // 5. Automatic suspension disabled, and this isn't a manual/admin call.
  if (!opts.manual && (!subscription.suspensionEnabled || !customer.automaticSuspension)) {
    return {
      outcome: 'SKIPPED',
      reason: 'Automatic suspension disabled for this customer/subscription',
      resourceResults: [],
    };
  }

  const dryRun = isDryRun(opts, subscription);

  // 6. Load Railway resources for this subscription.
  const resources = await deps.railwayResources.findBySubscriptionId(subscriptionId);

  const resourceResults: SuspendCustomerResult['resourceResults'] = [];

  for (const resource of resources) {
    // 7-8. hosting mode + strategy come straight from the resource record.
    try {
      assertStrategyAutomatable(resource.suspensionStrategy);
    } catch (err) {
      if (err instanceof ForbiddenSuspensionActionError) {
        resourceResults.push({
          resourceId: resource.id,
          result: 'SKIPPED',
          detail: `Strategy ${resource.suspensionStrategy} requires manual admin action`,
        });
        continue;
      }
      throw err;
    }

    if (dryRun) {
      resourceResults.push({
        resourceId: resource.id,
        result: 'SKIPPED',
        detail: `DRY RUN — would suspend via ${resource.suspensionStrategy} (service ${resource.serviceId})`,
      });
      continue;
    }

    // 9-10. Execute the safe action for this hosting mode, then verify.
    const outcome = await executeSuspensionForResource(railway, resource);
    resourceResults.push(outcome);

    // 11. Reflect verified Railway state locally — never assume success.
    await deps.railwayResources.updateStatus(
      resource.id,
      outcome.result === 'SUCCESS' ? 'STOPPED' : 'ERROR',
      { lastError: outcome.result === 'SUCCESS' ? null : outcome.detail }
    );
  }

  const anyHardFailure = resourceResults.some((r) => r.result === 'FAILED');

  if (dryRun) {
    return { outcome: 'DRY_RUN', reason, resourceResults };
  }

  if (anyHardFailure) {
    // 13. Log the failure event, but do NOT flip subscription/customer to
    // SUSPENDED if we couldn't verify the underlying resource was stopped —
    // reporting SUSPENDED without verification is exactly what section 13
    // (failure handling) forbids.
    await deps.suspensionEvents.create({
      subscriptionId,
      action: 'SERVICE_STOPPED',
      reason,
      strategy: resources[0]?.suspensionStrategy ?? 'MANUAL',
      result: 'FAILED',
      errorMessage: resourceResults.find((r) => r.result === 'FAILED')?.detail,
      performedBy: opts.performedBy ?? null,
      dryRun: false,
    });
    return { outcome: 'FAILED', reason: 'One or more Railway resources failed to suspend', resourceResults };
  }

  // 12-13. Update subscription + customer status, log success event.
  await deps.subscriptions.updateStatus(subscriptionId, 'SUSPENDED', {
    suspendedAt: new Date().toISOString(),
  });
  await deps.customers.updateStatus(customer.id, 'SUSPENDED');

  const action = resources.some((r) => r.hostingMode === 'MULTI_TENANT')
    ? 'APP_SUSPENDED'
    : 'SERVICE_STOPPED';

  await deps.suspensionEvents.create({
    subscriptionId,
    action: opts.manual ? 'MANUAL_SUSPENSION' : action,
    reason,
    strategy: resources[0]?.suspensionStrategy ?? 'APP_LEVEL',
    result: 'SUCCESS',
    performedBy: opts.performedBy ?? null,
    dryRun: false,
  });

  // 14. Notify customer.
  await deps.notifications.send(
    customer.id,
    'SUSPENDED',
    'Your hosting service has been temporarily suspended due to non-payment.'
  );

  return { outcome: 'SUSPENDED', reason, resourceResults };
}

/**
 * Dispatches to the correct, mode-specific suspension action. This is the
 * only function in the engine that touches Railway directly, and it only
 * ever calls stopDeployment — never a delete/teardown mutation.
 */
async function executeSuspensionForResource(
  railway: RailwayClient,
  resource: RailwayResourceRecord
): Promise<{ resourceId: string; result: SuspensionResult; detail: string }> {
  switch (resource.hostingMode) {
    case 'MULTI_TENANT':
      // Section 16: never call Railway. Subscription-status-only suspension;
      // application middleware (subscriptionGuard) enforces access.
      return { resourceId: resource.id, result: 'SUCCESS', detail: 'App-level suspension (no Railway call)' };

    case 'DEDICATED':
    case 'SHARED_SERVICE': {
      // Section 15/16: stop only this customer's deployment/service, never
      // the whole project.
      if (!resource.deploymentId) {
        return {
          resourceId: resource.id,
          result: 'FAILED',
          detail: 'No deploymentId on record — cannot verify what to stop',
        };
      }
      try {
        const { success, status } = await stopDeployment(railway, resource.deploymentId);
        return {
          resourceId: resource.id,
          result: success ? 'SUCCESS' : 'FAILED',
          detail: `stopDeployment -> Railway status ${status}`,
        };
      } catch (err) {
        return {
          resourceId: resource.id,
          result: 'FAILED',
          detail: err instanceof Error ? err.message : 'Unknown Railway error',
        };
      }
    }

    default:
      return { resourceId: resource.id, result: 'FAILED', detail: `Unknown hosting mode ${resource.hostingMode}` };
  }
}
