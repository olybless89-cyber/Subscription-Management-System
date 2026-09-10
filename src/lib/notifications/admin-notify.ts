import { AdminRepository, AdminAssignmentRepository, AdminNotificationRepository } from '../db/ports';

export interface AdminNotifyDeps {
  admins: AdminRepository;
  adminAssignments: AdminAssignmentRepository;
  adminNotifications: AdminNotificationRepository;
}

/**
 * notifyAdminsForCustomer — fans out a customer-facing event (most
 * importantly PAYMENT_RECEIVED) to whichever admins should know about it:
 * every SUPER_ADMIN (they see everything, by design — see
 * canAdminAccessCustomer), plus any plain ADMIN specifically assigned to
 * this customer. A plain admin with no assignment to this customer gets
 * nothing, on purpose — that's the entire point of scoped visibility.
 *
 * Deduplicates so a SUPER_ADMIN who also happens to hold an assignment
 * row doesn't get two notification rows for the same event.
 */
export async function notifyAdminsForCustomer(
  deps: AdminNotifyDeps,
  customerId: string,
  event: string,
  message: string
): Promise<void> {
  const [superAdmins, assignedAdminIds] = await Promise.all([
    deps.admins.listSuperAdmins(),
    deps.adminAssignments.listAdminIdsForCustomer(customerId),
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
