import { AdminManagementDeps } from '../db/ports';

export type SetDryRunOverrideOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface SetDryRunOverrideResult {
  outcome: SetDryRunOverrideOutcome;
  message: string;
}

/**
 * setSubscriptionDryRunOverride — lets an admin test real
 * suspend/restore against ONE subscription (override: false) without
 * touching the global SUSPENSION_DRY_RUN env var that protects every
 * other customer, or force-protect one subscription (override: true)
 * independent of the global switch. Pass override: null to go back to
 * inheriting the global default.
 *
 * Deliberately requires the caller to already be looking at the
 * subscription (route layer checks canAccessCustomer before calling
 * this, same pattern as suspend/restore) — this function itself only
 * checks that the subscription exists, since it doesn't touch Railway
 * or money and isn't privilege-sensitive the way createAdmin is.
 */
export async function setSubscriptionDryRunOverride(
  deps: Pick<AdminManagementDeps, 'admins' | 'auditLog'> & {
    subscriptions: { findById(id: string): Promise<{ id: string } | null>; setDryRunOverride(id: string, override: boolean | null): Promise<void> };
  },
  requestingAdminId: string,
  subscriptionId: string,
  override: boolean | null
): Promise<SetDryRunOverrideResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const subscription = await deps.subscriptions.findById(subscriptionId);
  if (!subscription) {
    return { outcome: 'NOT_FOUND', message: 'Subscription not found' };
  }

  await deps.subscriptions.setDryRunOverride(subscriptionId, override);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'SUBSCRIPTION_DRY_RUN_OVERRIDE_SET',
    target: subscriptionId,
    metadata: { override },
    result: 'SUCCESS',
  });

  const message =
    override === null
      ? 'Dry-run override cleared — this subscription now follows the global SUSPENSION_DRY_RUN setting'
      : override
        ? 'Dry-run override set to TRUE — this subscription will never really suspend/restore, regardless of the global setting'
        : 'Dry-run override set to FALSE — suspend/restore on this subscription will be REAL, regardless of the global setting';

  return { outcome: 'UPDATED', message };
}
