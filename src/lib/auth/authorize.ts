import { SessionPayload, verifySessionToken } from './tokens';
import { AdminAssignmentRepository } from '../db/ports';

export type AuthResult =
  | { authenticated: true; session: SessionPayload }
  | { authenticated: false; reason: 'MISSING_TOKEN' | 'INVALID_OR_EXPIRED' };

/** Pulls a bearer token out of a standard Authorization header and
 * verifies it. Transport-agnostic — callers pass the header value they
 * got from wherever (Next.js Request, a cookie, a test). */
export function authenticateFromHeader(authorizationHeader: string | null): AuthResult {
  if (!authorizationHeader?.startsWith('Bearer ')) {
    return { authenticated: false, reason: 'MISSING_TOKEN' };
  }
  const token = authorizationHeader.slice('Bearer '.length).trim();
  const session = verifySessionToken(token);
  if (!session) {
    return { authenticated: false, reason: 'INVALID_OR_EXPIRED' };
  }
  return { authenticated: true, session };
}

/** True if the session belongs to an admin with SUPER_ADMIN or (for
 * plain admin actions) either role. Pass `['SUPER_ADMIN']` to restrict
 * to super-admin-only actions (spec section 3: admin management). Note
 * this does NOT imply the admin can see every customer — see
 * canAccessCustomer() for that. */
export function hasAdminRole(
  session: SessionPayload,
  allowedRoles: Array<'SUPER_ADMIN' | 'ADMIN'>
): boolean {
  return session.type === 'admin' && !!session.role && allowedRoles.includes(session.role);
}

/**
 * canAccessCustomer — the scoped-visibility gate. SUPER_ADMIN sees every
 * customer. A plain ADMIN sees ONLY customers explicitly assigned to
 * them (spec extension: "only users selected is what the created admin
 * can see"). A customer session only ever passes for their own record.
 *
 * Async because the ADMIN case needs a real assignment lookup — trusting
 * the session token alone isn't enough, since assignments change after
 * the token was issued and the token doesn't carry them anyway.
 */
export async function canAccessCustomer(
  session: SessionPayload,
  customerId: string,
  assignments: Pick<AdminAssignmentRepository, 'isAssigned'>
): Promise<boolean> {
  if (session.type === 'admin') {
    if (session.role === 'SUPER_ADMIN') return true;
    return assignments.isAssigned(session.sub, customerId);
  }
  return session.type === 'customer' && session.sub === customerId;
}

/**
 * listVisibleCustomerIds — for routes that list/filter customers rather
 * than check one specific id. Returns the sentinel 'ALL' for
 * SUPER_ADMIN (don't materialize every id just to say "everything"),
 * or the concrete assigned-id list for a plain ADMIN.
 */
export async function listVisibleCustomerIds(
  session: SessionPayload,
  assignments: Pick<AdminAssignmentRepository, 'listCustomerIdsForAdmin'>
): Promise<string[] | 'ALL'> {
  if (session.type !== 'admin') return [];
  if (session.role === 'SUPER_ADMIN') return 'ALL';
  return assignments.listCustomerIdsForAdmin(session.sub);
}

/** Can this admin create other admins / manage assignments? Deliberately
 * takes the freshly-loaded AdminRecord (canManageAdmins), not the
 * session token — that flag isn't in the token at all, specifically so
 * revoking it takes effect immediately rather than waiting for the
 * admin's session to expire. */
export function canManageOtherAdmins(admin: { role: 'SUPER_ADMIN' | 'ADMIN'; canManageAdmins: boolean }): boolean {
  return admin.role === 'SUPER_ADMIN' || admin.canManageAdmins;
}
