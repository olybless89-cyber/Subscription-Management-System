import { AdminManagementDeps } from '../db/ports';

export type DeleteCustomerOutcome = 'DELETED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface DeleteCustomerResult {
  outcome: DeleteCustomerOutcome;
  message: string;
}

/**
 * deleteCustomer — spec section 44, "explicit, admin-confirmed
 * permanent-termination workflow." Irreversibly removes a customer and
 * everything that references them (see
 * CustomerRepository.deleteCascade's doc comment for exactly what).
 *
 * Deliberately SUPER_ADMIN only — unlike createCustomer/updateCustomer,
 * which any admin can do for a customer assigned to them, this can
 * destroy financial history (payments, invoices) and suspension
 * history, not just edit a profile field. That's a materially bigger
 * blast radius than the assignment system was designed to gate, so it
 * gets the same bar as Railway-infrastructure mapping and admin
 * management: SUPER_ADMIN only, no exceptions via assignment.
 *
 * Never reachable from an automated worker — this is only ever called
 * from the admin-facing DELETE route, which requires the same explicit
 * human confirmation click every other destructive UI action does.
 */
export async function deleteCustomer(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  customerId: string
): Promise<DeleteCustomerResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can permanently delete a customer' };
  }

  const customer = await deps.customers.findById(customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  await deps.customers.deleteCascade(customerId);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOMER_DELETED',
    target: customerId,
    metadata: { customerCode: customer.customerCode, name: customer.name, email: customer.email },
    result: 'SUCCESS',
  });

  return { outcome: 'DELETED', message: `${customer.customerCode} permanently deleted` };
}
