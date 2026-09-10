import { SessionPayload, verifySessionToken } from './tokens';

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
 * to super-admin-only actions (spec section 3: admin management). */
export function hasAdminRole(
  session: SessionPayload,
  allowedRoles: Array<'SUPER_ADMIN' | 'ADMIN'>
): boolean {
  return session.type === 'admin' && !!session.role && allowedRoles.includes(session.role);
}

/** spec section 3: customers may only ever act on their own resources.
 * `resourceCustomerId` is whatever customerId the target record (a
 * subscription, a domain, a payment...) actually belongs to. */
export function canAccessCustomerResource(
  session: SessionPayload,
  resourceCustomerId: string
): boolean {
  if (session.type === 'admin') return true; // admins can act on any customer's resources
  return session.type === 'customer' && session.sub === resourceCustomerId;
}
