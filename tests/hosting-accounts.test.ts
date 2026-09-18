import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  createHostingAccount,
  updateHostingAccount,
  deleteHostingAccount,
  testHostingAccount,
} from '@/lib/hosting/manage';
import { resolveRailwayClientForAccount, HostingAccountResolutionError } from '@/lib/hosting/account-client';
import { makeFakeBillingSetupDeps } from './fakes';
import { AdminRecord, RailwayResourceRecord } from '@/types/domain';

function superAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'super_1',
    name: 'Super Admin',
    email: 'super@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'SUPER_ADMIN',
    canManageAdmins: true,
    ...overrides,
  };
}

function plainAdmin(overrides: Partial<AdminRecord> = {}): AdminRecord {
  return {
    id: 'admin_1',
    name: 'Plain Admin',
    email: 'admin@dwo.example',
    passwordHash: 'x',
    passwordChangedAt: null,
    role: 'ADMIN',
    canManageAdmins: false,
    ...overrides,
  };
}

function dedicatedResource(overrides: Partial<RailwayResourceRecord> = {}): RailwayResourceRecord {
  return {
    id: 'res_1',
    subscriptionId: 'sub_1',
    projectId: 'proj_1',
    environmentId: 'env_1',
    serviceId: 'svc_1',
    deploymentId: 'dep_1',
    hostingMode: 'DEDICATED',
    suspensionStrategy: 'STOP_DEPLOYMENT',
    status: 'ACTIVE',
    hostingAccountId: 'hacct_1',
    ...overrides,
  };
}

describe('createHostingAccount', () => {
  it('is FORBIDDEN for a plain ADMIN — only SUPER_ADMIN can connect a hosting account', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [plainAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'admin_1', {
      provider: 'RAILWAY',
      label: 'Second Railway account',
      apiToken: 'tok_123',
    });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('is FORBIDDEN when the requesting admin does not exist', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'nope', {
      provider: 'RAILWAY',
      label: 'X',
      apiToken: 'tok_123',
    });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('rejects a missing label', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'super_1', { provider: 'RAILWAY', label: '  ', apiToken: 'tok_123' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it('rejects a missing apiToken', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'super_1', { provider: 'RAILWAY', label: 'X', apiToken: '  ' });

    expect(result.outcome).toBe('INVALID_INPUT');
  });

  it.each(['DIGITALOCEAN', 'AWS', 'VERCEL'] as const)(
    'rejects %s — no adapter is implemented yet, only RAILWAY can be connected',
    async (provider) => {
      const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

      const result = await createHostingAccount(deps, 'super_1', { provider, label: 'X', apiToken: 'tok_123' });

      expect(result.outcome).toBe('INVALID_INPUT');
      expect(result.message).toContain('No ' + provider + ' adapter is implemented yet');
    }
  );

  it('connects a RAILWAY account and logs a HOSTING_ACCOUNT_CONNECTED audit entry', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await createHostingAccount(deps, 'super_1', {
      provider: 'RAILWAY',
      label: 'Second Railway account',
      apiToken: 'tok_123',
    });

    expect(result.outcome).toBe('CREATED');
    expect(result.account?.provider).toBe('RAILWAY');
    expect(result.account?.label).toBe('Second Railway account');
    expect(result.account?.isActive).toBe(true);
    // The credential itself is never returned on the safe record shape.
    expect((result.account as unknown as { apiToken?: string }).apiToken).toBeUndefined();

    const found = await deps.hostingAccounts.findById(result.account!.id);
    expect(found).not.toBeNull();

    expect(deps.auditLogEntries.some((e) => e.action === 'HOSTING_ACCOUNT_CONNECTED')).toBe(true);
  });
});

describe('updateHostingAccount', () => {
  it('is FORBIDDEN for a plain ADMIN', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [plainAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });

    const result = await updateHostingAccount(deps, 'admin_1', 'hacct_1', { label: 'Renamed' });

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('is NOT_FOUND for a non-existent account', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await updateHostingAccount(deps, 'super_1', 'hacct_missing', { label: 'Renamed' });

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('relabels, deactivates, and rotates the token independently', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'Original label', apiToken: 'tok_original' }],
    });

    const result = await updateHostingAccount(deps, 'super_1', 'hacct_1', { label: 'New label', isActive: false });

    expect(result.outcome).toBe('UPDATED');
    expect(result.account?.label).toBe('New label');
    expect(result.account?.isActive).toBe(false);

    // Token rotation is a separate, explicit call — proving the stored
    // credential actually changed (via findByIdWithCredentials, the only
    // read that ever surfaces it).
    await updateHostingAccount(deps, 'super_1', 'hacct_1', { apiToken: 'tok_rotated' });
    const withCreds = await deps.hostingAccounts.findByIdWithCredentials('hacct_1');
    expect(withCreds?.apiToken).toBe('tok_rotated');

    expect(deps.auditLogEntries.filter((e) => e.action === 'HOSTING_ACCOUNT_UPDATED')).toHaveLength(2);
  });
});

describe('deleteHostingAccount', () => {
  it('is FORBIDDEN for a plain ADMIN', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [plainAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });

    const result = await deleteHostingAccount(deps, 'admin_1', 'hacct_1');

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('is NOT_FOUND for a non-existent account', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await deleteHostingAccount(deps, 'super_1', 'hacct_missing');

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('refuses to delete an account that still governs a mapped RailwayResource (mirrors the FK Restrict boundary)', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [dedicatedResource({ hostingAccountId: 'hacct_1' })],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });

    const result = await deleteHostingAccount(deps, 'super_1', 'hacct_1');

    expect(result.outcome).toBe('IN_USE');
    const stillThere = await deps.hostingAccounts.findById('hacct_1');
    expect(stillThere).not.toBeNull();
  });

  it('deletes an unreferenced account and logs a HOSTING_ACCOUNT_DISCONNECTED audit entry', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });

    const result = await deleteHostingAccount(deps, 'super_1', 'hacct_1');

    expect(result.outcome).toBe('DELETED');
    const gone = await deps.hostingAccounts.findById('hacct_1');
    expect(gone).toBeNull();
    expect(deps.auditLogEntries.some((e) => e.action === 'HOSTING_ACCOUNT_DISCONNECTED')).toBe(true);
  });
});

describe('testHostingAccount', () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
    vi.unstubAllGlobals();
  });

  it('is FORBIDDEN for a plain ADMIN', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [plainAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });

    const result = await testHostingAccount(deps, 'admin_1', 'hacct_1');

    expect(result.outcome).toBe('FORBIDDEN');
  });

  it('is NOT_FOUND for a non-existent account', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [superAdmin()], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    const result = await testHostingAccount(deps, 'super_1', 'hacct_missing');

    expect(result.outcome).toBe('NOT_FOUND');
  });

  it('is UNSUPPORTED for a non-RAILWAY provider — nothing to test yet', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'DIGITALOCEAN', label: 'DO account', apiToken: 'tok' }],
    });

    const result = await testHostingAccount(deps, 'super_1', 'hacct_1');

    expect(result.outcome).toBe('UNSUPPORTED');
  });

  it('reports OK with the project count on a reachable, valid token', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          data: { projects: { edges: [{ node: { id: 'p1', name: 'proj', services: { edges: [] }, environments: { edges: [] } } }] } },
        }),
      }))
    );

    const result = await testHostingAccount(deps, 'super_1', 'hacct_1');

    expect(result.outcome).toBe('OK');
    expect(result.message).toContain('1 project');
  });

  it('reports UNREACHABLE (never a false OK) when the token is rejected', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [superAdmin()],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'bad_tok' }],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      }))
    );

    const result = await testHostingAccount(deps, 'super_1', 'hacct_1');

    expect(result.outcome).toBe('UNREACHABLE');
  });
});

describe('resolveRailwayClientForAccount — multi-account resolution safety (never guesses/falls back)', () => {
  it('throws with a clear message for a null hostingAccountId (predates multi-account support)', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    await expect(resolveRailwayClientForAccount(deps.hostingAccounts, null)).rejects.toThrow(HostingAccountResolutionError);
    await expect(resolveRailwayClientForAccount(deps.hostingAccounts, null)).rejects.toThrow(/predates multi-account support/);
  });

  it('throws for a hostingAccountId that does not exist', async () => {
    const deps = makeFakeBillingSetupDeps({ admins: [], customers: [], plans: [], subscriptions: [], railwayResources: [] });

    await expect(resolveRailwayClientForAccount(deps.hostingAccounts, 'hacct_missing')).rejects.toThrow(
      HostingAccountResolutionError
    );
  });

  it('throws for an inactive (disconnected) account rather than silently using it', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'Disconnected one', apiToken: 'tok', isActive: false }],
    });

    await expect(resolveRailwayClientForAccount(deps.hostingAccounts, 'hacct_1')).rejects.toThrow(/disconnected\/inactive/);
  });

  it('throws for a non-RAILWAY account rather than pretending an adapter exists', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'AWS', label: 'AWS account', apiToken: 'tok' }],
    });

    await expect(resolveRailwayClientForAccount(deps.hostingAccounts, 'hacct_1')).rejects.toThrow(
      /no AWS adapter is implemented/
    );
  });

  it('resolves a callable client for a valid, active RAILWAY account', async () => {
    const deps = makeFakeBillingSetupDeps({
      admins: [],
      customers: [],
      plans: [],
      subscriptions: [],
      railwayResources: [],
      hostingAccounts: [{ id: 'hacct_1', provider: 'RAILWAY', label: 'X', apiToken: 'tok', apiUrl: 'https://backboard.railway.com/graphql/v2' }],
    });

    const client = await resolveRailwayClientForAccount(deps.hostingAccounts, 'hacct_1');

    expect(typeof client.request).toBe('function');
  });
});
