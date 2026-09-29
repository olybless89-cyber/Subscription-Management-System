import { AdminRepository, AdminAssignmentRepository, AdminNotificationRepository } from '../db/ports';

export interface AdminNotifyDeps {
  admins: AdminRepository;
  adminAssignments: AdminAssignmentRepository;
  adminNotifications: AdminNotificationRepository;
}

/**
 * notifyAdminsForCustomer — fans out a customer-scoped event (a
 * customer's own subscription/domain/billing changing, or an admin
 * action taken against a specific customer) to whichever admins should
 * know about it: every SUPER_ADMIN (they see everything, by design —
 * see canAdminAccessCustomer), plus any plain ADMIN specifically
 * assigned to this customer. A plain admin with no assignment to this
 * customer gets nothing, on purpose — that's the entire point of scoped
 * visibility.
 *
 * Deduplicates so a SUPER_ADMIN who also happens to hold an assignment
 * row doesn't get two notification rows for the same event.
 *
 * customerId is nullable for an account-level event with no single
 * customer to point at (a new plan, a new admin, a campaign sent to
 * many customers at once) — in that case only SUPER_ADMINs are
 * notified, since there's no "assigned admin" to look up.
 *
 * Every call site MUST wrap this in try/catch (or accept the promise
 * rejecting) and never let a failure here undo the action that already
 * succeeded — same rule sendEmail's own doc comment states. Writing the
 * AdminNotification row and (from there) emailing the recipient is
 * itself best-effort at the repository layer (see
 * PrismaAdminNotificationRepository.create in prisma-repository.ts) —
 * this function's only remaining failure mode is the DB write itself.
 */
export async function notifyAdminsForCustomer(
  deps: AdminNotifyDeps,
  customerId: string | null,
  event: string,
  message: string
): Promise<void> {
  const [superAdmins, assignedAdminIds] = await Promise.all([
    deps.admins.listSuperAdmins(),
    customerId ? deps.adminAssignments.listAdminIdsForCustomer(customerId) : Promise.resolve([]),
  ]);

  const recipientIds = new Set<string>([
    ...superAdmins.map((a) => a.id),
    ...assignedAdminIds,
  ]);

  await Promise.all(
    [...recipientIds].map((adminId) =>
      deps.adminNotifications.create({ adminId, customerId, event, message })
    )
  );
}

/**
 * notifyAdmins — alias for notifyAdminsForCustomer with the arguments
 * in "event first" order, for call sites that have no customer at all
 * (createPlan, createAdmin, a campaign send) and would otherwise read
 * oddly passing `null` positionally where a customerId usually goes.
 * Identical behavior — every SUPER_ADMIN, plus any admin assigned to
 * customerId when one is given.
 */
export async function notifyAdmins(
  deps: AdminNotifyDeps,
  event: string,
  message: string,
  customerId: string | null = null
): Promise<void> {
  return notifyAdminsForCustomer(deps, customerId, event, message);
}
