import crypto from 'node:crypto';
import { AuthDeps } from '../db/ports';
import { verifyPassword, hashPassword } from './password';
import { createSessionToken } from './tokens';
import { AdminRecord, CustomerRecord } from '@/types/domain';

export type LoginResult<T> =
  | { outcome: 'SUCCESS'; token: string; record: T }
  | { outcome: 'INVALID_CREDENTIALS' }
  | { outcome: 'ACCOUNT_NOT_USABLE'; reason: string };

/**
 * authenticateAdmin — spec section 32 ("Secure password hashing" +
 * "Session management"). Deliberately returns the SAME outcome
 * (INVALID_CREDENTIALS) whether the email doesn't exist or the password
 * is wrong, so a login endpoint built on this can't be used to enumerate
 * registered admin emails.
 */
export async function authenticateAdmin(
  deps: Pick<AuthDeps, 'admins'>,
  email: string,
  password: string
): Promise<LoginResult<AdminRecord>> {
  const admin = await deps.admins.findByEmail(email.toLowerCase().trim());
  if (!admin) {
    // Still run a hash comparison against a dummy value so this path takes
    // roughly the same time as the "found" path — avoids a timing
    // side-channel that reveals whether the email exists.
    await verifyPassword(password, DUMMY_HASH);
    return { outcome: 'INVALID_CREDENTIALS' };
  }

  const valid = await verifyPassword(password, admin.passwordHash);
  if (!valid) {
    return { outcome: 'INVALID_CREDENTIALS' };
  }

  const token = createSessionToken({ sub: admin.id, type: 'admin', role: admin.role });
  return { outcome: 'SUCCESS', token, record: admin };
}

/**
 * authenticateCustomer — same shape as authenticateAdmin. Refuses to log
 * in a customer whose account has no password set yet (invite/reset flow
 * not completed) or whose account is TERMINATED, without leaking which
 * of those is the case beyond a generic message — a suspended customer
 * (non-payment) CAN still log in, since they need to reach the billing
 * portal to pay and get restored.
 */
export async function authenticateCustomer(
  deps: Pick<AuthDeps, 'customers'>,
  email: string,
  password: string
): Promise<LoginResult<CustomerRecord>> {
  const customer = await deps.customers.findByEmail(email.toLowerCase().trim());
  if (!customer || !customer.passwordHash) {
    await verifyPassword(password, DUMMY_HASH);
    return { outcome: 'INVALID_CREDENTIALS' };
  }

  if (customer.status === 'TERMINATED') {
    return { outcome: 'ACCOUNT_NOT_USABLE', reason: 'This account has been closed.' };
  }

  const valid = await verifyPassword(password, customer.passwordHash);
  if (!valid) {
    return { outcome: 'INVALID_CREDENTIALS' };
  }

  const token = createSessionToken({ sub: customer.id, type: 'customer' });
  return { outcome: 'SUCCESS', token, record: customer };
}

// A syntactically valid scrypt-format hash that no real password will
// ever match, used purely to equalize timing on the "account not found"
// path above so it costs the same as a real verifyPassword call.
const DUMMY_HASH = await hashPassword(crypto.randomUUID());
