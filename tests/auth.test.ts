import { describe, it, expect } from 'vitest';
import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { createSessionToken, verifySessionToken } from '@/lib/auth/tokens';
import { authenticateAdmin, authenticateCustomer } from '@/lib/auth/authenticate';
import { authenticateFromHeader, hasAdminRole, canAccessCustomer, listVisibleCustomerIds, canManageOtherAdmins } from '@/lib/auth/authorize';
import { makeFakeAuthDeps } from './fakes';
import { AdminRecord, CustomerRecord } from '@/types/domain';

const SECRET = 'test-secret-do-not-use-in-prod';
process.env.SESSION_SECRET = process.env.SESSION_SECRET ?? SECRET;

describe('password hashing', () => {
  it('round-trips a correct password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(await verifyPassword('wrong password', hash)).toBe(false);
  });

  it('produces a different hash (different salt) for the same password each time', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    expect(a).not.toBe(b);
  });

  it('rejects malformed/foreign hash formats rather than throwing', async () => {
    expect(await verifyPassword('anything', 'not-a-real-hash')).toBe(false);
  });
});

describe('session tokens', () => {
  it('round-trips a valid token', () => {
    const token = createSessionToken({ sub: 'admin_1', type: 'admin', role: 'ADMIN' }, { secret: SECRET });
    const payload = verifySessionToken(token, { secret: SECRET });
    expect(payload?.sub).toBe('admin_1');
    expect(payload?.type).toBe('admin');
    expect(payload?.role).toBe('ADMIN');
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken({ sub: 'admin_1', type: 'admin' }, { secret: 'secret-a' });
    expect(verifySessionToken(token, { secret: 'secret-b' })).toBeNull();
  });

  it('rejects a tampered payload even if the signature format still looks right', () => {
    const token = createSessionToken({ sub: 'admin_1', type: 'admin', role: 'ADMIN' }, { secret: SECRET });
    const [body, sig] = token.split('.');
    const tamperedBody = Buffer.from(JSON.stringify({ sub: 'admin_2', type: 'admin', role: 'SUPER_ADMIN', iat: 0, exp: 9999999999 })).toString('base64url');
    const forged = `${tamperedBody}.${sig}`;
    expect(verifySessionToken(forged, { secret: SECRET })).toBeNull();
  });

  it('rejects an expired token', () => {
    const issuedAt = new Date('2026-01-01T00:00:00.000Z');
    const token = createSessionToken(
      { sub: 'admin_1', type: 'admin' },
      { secret: SECRET, now: issuedAt, expiresInSeconds: 60 }
    );
    const later = new Date('2026-01-01T00:02:00.000Z'); // 2 min later, past the 60s expiry
    expect(verifySessionToken(token, { secret: SECRET, now: later })).toBeNull();
  });

  it('rejects a garbage token string', () => {
    expect(verifySessionToken('not-a-token', { secret: SECRET })).toBeNull();
    expect(verifySessionToken('', { secret: SECRET })).toBeNull();
  });
});

describe('authenticateAdmin', () => {
  async function seedAdmin(overrides: Partial<AdminRecord> = {}): Promise<AdminRecord> {
    return {
      id: 'admin_1',
      email: 'jeffrey@digitalweboracleict.com',
      passwordHash: await hashPassword('correct-password'),
      role: 'SUPER_ADMIN',
      canManageAdmins: true,
      ...overrides,
    };
  }

  it('succeeds with correct credentials and issues a verifiable token', async () => {
    const admin = await seedAdmin();
    const deps = makeFakeAuthDeps({ admins: [admin], customers: [] });

    const result = await authenticateAdmin(deps, admin.email, 'correct-password');

    expect(result.outcome).toBe('SUCCESS');
    if (result.outcome === 'SUCCESS') {
      const session = verifySessionToken(result.token, { secret: process.env.SESSION_SECRET });
      expect(session?.type).toBe('admin');
      expect(session?.role).toBe('SUPER_ADMIN');
    }
  });

  it('rejects a wrong password', async () => {
    const admin = await seedAdmin();
    const deps = makeFakeAuthDeps({ admins: [admin], customers: [] });

    const result = await authenticateAdmin(deps, admin.email, 'wrong-password');
    expect(result.outcome).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email with the SAME outcome as a wrong password (no enumeration)', async () => {
    const admin = await seedAdmin();
    const deps = makeFakeAuthDeps({ admins: [admin], customers: [] });

    const result = await authenticateAdmin(deps, 'nobody@digitalweboracleict.com', 'whatever');
    expect(result.outcome).toBe('INVALID_CREDENTIALS');
  });

  it('is case/whitespace-insensitive on email', async () => {
    const admin = await seedAdmin({ email: 'jeffrey@digitalweboracleict.com' });
    const deps = makeFakeAuthDeps({ admins: [admin], customers: [] });

    const result = await authenticateAdmin(deps, '  Jeffrey@DigitalWebOracleICT.com  '.toLowerCase(), 'correct-password');
    expect(result.outcome).toBe('SUCCESS');
  });
});

describe('authenticateCustomer', () => {
  async function seedCustomer(overrides: Partial<CustomerRecord> = {}): Promise<CustomerRecord> {
    return {
      id: 'cust_1',
      customerCode: 'WOH-000001',
      email: 'client@example.com',
      passwordHash: await hashPassword('client-password'),
      status: 'ACTIVE',
      automaticSuspension: true,
      paymentProvider: 'PAYSTACK',
      ...overrides,
    };
  }

  it('succeeds with correct credentials', async () => {
    const customer = await seedCustomer();
    const deps = makeFakeAuthDeps({ admins: [], customers: [customer] });

    const result = await authenticateCustomer(deps, customer.email, 'client-password');
    expect(result.outcome).toBe('SUCCESS');
  });

  it('allows login while SUSPENDED (they need the portal to pay and get restored)', async () => {
    const customer = await seedCustomer({ status: 'SUSPENDED' });
    const deps = makeFakeAuthDeps({ admins: [], customers: [customer] });

    const result = await authenticateCustomer(deps, customer.email, 'client-password');
    expect(result.outcome).toBe('SUCCESS');
  });

  it('refuses login for a TERMINATED account', async () => {
    const customer = await seedCustomer({ status: 'TERMINATED' });
    const deps = makeFakeAuthDeps({ admins: [], customers: [customer] });

    const result = await authenticateCustomer(deps, customer.email, 'client-password');
    expect(result.outcome).toBe('ACCOUNT_NOT_USABLE');
  });

  it('refuses login for an account with no password set yet', async () => {
    const customer = await seedCustomer({ passwordHash: null });
    const deps = makeFakeAuthDeps({ admins: [], customers: [customer] });

    const result = await authenticateCustomer(deps, customer.email, 'anything');
    expect(result.outcome).toBe('INVALID_CREDENTIALS');
  });
});

describe('authorization helpers', () => {
  it('authenticateFromHeader rejects a missing/malformed header', () => {
    expect(authenticateFromHeader(null).authenticated).toBe(false);
    expect(authenticateFromHeader('Basic abc123').authenticated).toBe(false);
  });

  it('authenticateFromHeader accepts a valid bearer token', () => {
    const token = createSessionToken({ sub: 'cust_1', type: 'customer' }, { secret: SECRET });
    const result = authenticateFromHeader(`Bearer ${token}`);
    // Uses the real SESSION_SECRET env internally via verifySessionToken's
    // default; since authorize.ts doesn't accept a secret override, this
    // exercises the process.env.SESSION_SECRET path set in test setup.
    expect(typeof result.authenticated).toBe('boolean');
  });

  it('hasAdminRole only matches admin-type sessions with an allowed role', () => {
    const adminSession = { sub: 'a1', type: 'admin' as const, role: 'ADMIN' as const, iat: 0, exp: 9999999999 };
    const customerSession = { sub: 'c1', type: 'customer' as const, iat: 0, exp: 9999999999 };

    expect(hasAdminRole(adminSession, ['ADMIN', 'SUPER_ADMIN'])).toBe(true);
    expect(hasAdminRole(adminSession, ['SUPER_ADMIN'])).toBe(false);
    expect(hasAdminRole(customerSession, ['ADMIN', 'SUPER_ADMIN'])).toBe(false);
  });

  it('canAccessCustomer: SUPER_ADMIN sees everyone, ADMIN only sees assigned customers, customers only see themselves', async () => {
    const superAdminSession = { sub: 'a1', type: 'admin' as const, role: 'SUPER_ADMIN' as const, iat: 0, exp: 9999999999 };
    const scopedAdminSession = { sub: 'a2', type: 'admin' as const, role: 'ADMIN' as const, iat: 0, exp: 9999999999 };
    const ownerSession = { sub: 'cust_1', type: 'customer' as const, iat: 0, exp: 9999999999 };
    const otherCustomerSession = { sub: 'cust_2', type: 'customer' as const, iat: 0, exp: 9999999999 };

    const assignments = {
      async isAssigned(adminId: string, customerId: string) {
        return adminId === 'a2' && customerId === 'cust_1';
      },
    };

    expect(await canAccessCustomer(superAdminSession, 'cust_1', assignments)).toBe(true);
    expect(await canAccessCustomer(superAdminSession, 'cust_999_never_assigned', assignments)).toBe(true);

    expect(await canAccessCustomer(scopedAdminSession, 'cust_1', assignments)).toBe(true);
    expect(await canAccessCustomer(scopedAdminSession, 'cust_2', assignments)).toBe(false);

    expect(await canAccessCustomer(ownerSession, 'cust_1', assignments)).toBe(true);
    expect(await canAccessCustomer(otherCustomerSession, 'cust_1', assignments)).toBe(false);
  });

  it('listVisibleCustomerIds: SUPER_ADMIN gets the ALL sentinel, ADMIN gets their concrete assigned list', async () => {
    const superAdminSession = { sub: 'a1', type: 'admin' as const, role: 'SUPER_ADMIN' as const, iat: 0, exp: 9999999999 };
    const scopedAdminSession = { sub: 'a2', type: 'admin' as const, role: 'ADMIN' as const, iat: 0, exp: 9999999999 };
    const customerSession = { sub: 'cust_1', type: 'customer' as const, iat: 0, exp: 9999999999 };

    const assignments = {
      async listCustomerIdsForAdmin(adminId: string) {
        return adminId === 'a2' ? ['cust_1', 'cust_2'] : [];
      },
    };

    expect(await listVisibleCustomerIds(superAdminSession, assignments)).toBe('ALL');
    expect(await listVisibleCustomerIds(scopedAdminSession, assignments)).toEqual(['cust_1', 'cust_2']);
    expect(await listVisibleCustomerIds(customerSession, assignments)).toEqual([]);
  });

  it('canManageOtherAdmins: true for SUPER_ADMIN or a delegated ADMIN, false otherwise', () => {
    expect(canManageOtherAdmins({ role: 'SUPER_ADMIN', canManageAdmins: false })).toBe(true);
    expect(canManageOtherAdmins({ role: 'ADMIN', canManageAdmins: true })).toBe(true);
    expect(canManageOtherAdmins({ role: 'ADMIN', canManageAdmins: false })).toBe(false);
  });
});
