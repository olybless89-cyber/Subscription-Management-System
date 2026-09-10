import { AdminManagementDeps } from '../db/ports';
import { canManageOtherAdmins } from '../auth/authorize';
import { hashPassword } from '../auth/password';
import { AdminRecord, AdminRole } from '@/types/domain';

export interface CreateAdminInput {
  name: string;
  email: string;
  password: string;
  role: AdminRole;
  canManageAdmins: boolean;
}

export type CreateAdminOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface CreateAdminResult {
  outcome: CreateAdminOutcome;
  message: string;
  admin?: AdminRecord;
}

/**
 * createAdmin — spec section 3 ("Can manage administrators" / "Cannot
 * manage other administrators unless explicitly granted permission"),
 * extended with the canManageAdmins delegation flag.
 *
 * Two separate privilege checks, not one:
 *  1. Can the requester create admins AT ALL? — SUPER_ADMIN, or a plain
 *     ADMIN with canManageAdmins=true.
 *  2. Can the requester grant elevated privileges to the NEW admin? —
 *     only SUPER_ADMIN may create another SUPER_ADMIN or hand out
 *     canManageAdmins=true. A delegated admin-manager can create plain,
 *     non-privileged admins, but can't mint peers or successors — that
 *     would let privilege quietly spread past whoever the actual
 *     SUPER_ADMIN chose to trust.
 */
export async function createAdmin(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  input: CreateAdminInput
): Promise<CreateAdminResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (!canManageOtherAdmins(requester)) {
    return { outcome: 'FORBIDDEN', message: 'You do not have permission to create admins' };
  }
  if ((input.role === 'SUPER_ADMIN' || input.canManageAdmins) && requester.role !== 'SUPER_ADMIN') {
    return {
      outcome: 'FORBIDDEN',
      message: 'Only a SUPER_ADMIN can create another SUPER_ADMIN or grant admin-management rights',
    };
  }

  const email = input.email.toLowerCase().trim();
  if (!email.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'Invalid email address' };
  }
  if (input.password.length < 12) {
    return { outcome: 'INVALID_INPUT', message: 'Password must be at least 12 characters' };
  }

  const existing = await deps.admins.findByEmail(email);
  if (existing) {
    return { outcome: 'ALREADY_EXISTS', message: 'An admin with this email already exists' };
  }

  const passwordHash = await hashPassword(input.password);
  const admin = await deps.admins.create({
    name: input.name.trim(),
    email,
    passwordHash,
    role: input.role,
    canManageAdmins: input.canManageAdmins,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'ADMIN_CREATED',
    target: admin.id,
    metadata: { email: admin.email, role: admin.role, canManageAdmins: admin.canManageAdmins },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Admin created', admin };
}

export type SetAssignmentsOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_CUSTOMER_IDS' | 'OUT_OF_SCOPE';

export interface SetAssignmentsResult {
  outcome: SetAssignmentsOutcome;
  message: string;
}

/**
 * setCustomerAssignments — replaces the target admin's entire assigned
 * customer set with exactly `customerIds`. This is what makes "select a
 * particular set of users and group them under this admin" real: after
 * this call, that admin's visibility (canAccessCustomer), their
 * PAYMENT_RECEIVED notifications (notifyAdminsForCustomer), and any
 * future "my customers" listing all key off the same assignment table.
 *
 * Same two-tier permission model as createAdmin: SUPER_ADMIN or a
 * canManageAdmins-delegated ADMIN can call this. Assigning customers to
 * a SUPER_ADMIN is a harmless no-op (they see everyone regardless) but
 * not blocked — no reason to special-case it.
 *
 * Second guard, caught and fixed rather than shipped: a delegated
 * (non-SUPER_ADMIN) admin-manager can only hand out customers they
 * themselves can already see. Without this, a delegated admin-manager
 * could grant a sub-admin visibility into a customer the delegator
 * can't even see — a privilege-escalation-adjacent gap, since the
 * assignment mechanism would let scope spread to someone the granting
 * admin never had authority over. SUPER_ADMIN is exempt from this check
 * (they can already see everyone, so there's no scope to exceed).
 */
export async function setCustomerAssignments(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  targetAdminId: string,
  customerIds: string[]
): Promise<SetAssignmentsResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (!canManageOtherAdmins(requester)) {
    return { outcome: 'FORBIDDEN', message: 'You do not have permission to manage admin assignments' };
  }

  const target = await deps.admins.findById(targetAdminId);
  if (!target) {
    return { outcome: 'NOT_FOUND', message: 'Target admin not found' };
  }

  const uniqueIds = [...new Set(customerIds)];

  if (uniqueIds.length > 0) {
    const found = await deps.customers.findByIds(uniqueIds);
    if (found.length !== uniqueIds.length) {
      const foundIds = new Set(found.map((c) => c.id));
      const missing = uniqueIds.filter((id) => !foundIds.has(id));
      return {
        outcome: 'INVALID_CUSTOMER_IDS',
        message: `Unknown customer id(s): ${missing.join(', ')}`,
      };
    }

    if (requester.role !== 'SUPER_ADMIN') {
      const requesterVisible = new Set(await deps.adminAssignments.listCustomerIdsForAdmin(requestingAdminId));
      const outOfScope = uniqueIds.filter((id) => !requesterVisible.has(id));
      if (outOfScope.length > 0) {
        return {
          outcome: 'OUT_OF_SCOPE',
          message: `You can only assign customers you can see yourself. Not visible to you: ${outOfScope.join(', ')}`,
        };
      }
    }
  }

  await deps.adminAssignments.setAssignments(targetAdminId, uniqueIds);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'ADMIN_ASSIGNMENTS_UPDATED',
    target: targetAdminId,
    metadata: { customerCount: uniqueIds.length },
    result: 'SUCCESS',
  });

  return { outcome: 'UPDATED', message: `${target.email} now sees ${uniqueIds.length} customer(s)` };
}
