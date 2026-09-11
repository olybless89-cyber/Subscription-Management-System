import { AdminManagementDeps } from '../db/ports';
import { hashPassword, verifyPassword } from '../auth/password';

const MIN_PASSWORD_LENGTH = 12;

export type PasswordOutcome = 'CHANGED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'WRONG_CURRENT_PASSWORD';

export interface PasswordResult {
  outcome: PasswordOutcome;
  message: string;
}

/**
 * changeOwnPassword — any authenticated admin (SUPER_ADMIN or plain
 * ADMIN) changing their own password. Requires the CURRENT password,
 * verified with the same constant-time comparison used at login —
 * unlike a super-admin reset, self-service change doesn't get to skip
 * proving you already know the old one.
 */
export async function changeOwnPassword(
  deps: AdminManagementDeps,
  adminId: string,
  currentPassword: string,
  newPassword: string
): Promise<PasswordResult> {
  const admin = await deps.admins.findById(adminId);
  if (!admin) {
    return { outcome: 'FORBIDDEN', message: 'Admin not found' };
  }

  const valid = await verifyPassword(currentPassword, admin.passwordHash);
  if (!valid) {
    return { outcome: 'WRONG_CURRENT_PASSWORD', message: 'Current password is incorrect' };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { outcome: 'INVALID_INPUT', message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const newHash = await hashPassword(newPassword);
  await deps.admins.updatePassword(adminId, newHash);

  await deps.auditLog.create({
    actor: adminId,
    action: 'ADMIN_PASSWORD_CHANGED_SELF',
    target: adminId,
    result: 'SUCCESS',
  });

  return { outcome: 'CHANGED', message: 'Password changed' };
}

/**
 * resetAdminPassword — a SUPER_ADMIN setting a NEW password directly for
 * another admin who's forgotten theirs, with no proof of the old one
 * required (that's the whole point — they forgot it). Strictly
 * SUPER_ADMIN, checked here as well as at the route layer: controlling
 * another privileged account's credentials is more sensitive than the
 * canManageOtherAdmins() delegation used for creating admins/assignments
 * elsewhere, so a delegated (non-SUPER_ADMIN) admin-manager cannot do
 * this even though they can create admins.
 */
export async function resetAdminPassword(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  targetAdminId: string,
  newPassword: string
): Promise<PasswordResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester || requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: "Only the super admin can reset another admin's password" };
  }

  const target = await deps.admins.findById(targetAdminId);
  if (!target) {
    return { outcome: 'NOT_FOUND', message: 'Admin not found' };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { outcome: 'INVALID_INPUT', message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const newHash = await hashPassword(newPassword);
  await deps.admins.updatePassword(targetAdminId, newHash);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'ADMIN_PASSWORD_RESET_BY_SUPER_ADMIN',
    target: targetAdminId,
    result: 'SUCCESS',
  });

  return { outcome: 'CHANGED', message: 'Password reset' };
}

/**
 * resetCustomerPassword — the "customer forgot their password, support
 * resets it" flow. No reset-link/email-verification loop exists (see
 * README) — an admin directly sets a new password and is expected to
 * relay it to the customer through whatever channel they trust. Scope
 * (which admin can act on which customer) is checked at the route layer
 * via canAccessCustomer, same as every other customer action — this
 * function only checks the requester exists.
 */
export async function resetCustomerPassword(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  customerId: string,
  newPassword: string
): Promise<PasswordResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return { outcome: 'INVALID_INPUT', message: `New password must be at least ${MIN_PASSWORD_LENGTH} characters` };
  }

  const newHash = await hashPassword(newPassword);
  await deps.customers.updatePassword(customerId, newHash);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOMER_PASSWORD_RESET',
    target: customerId,
    result: 'SUCCESS',
  });

  return { outcome: 'CHANGED', message: 'Password reset' };
}
