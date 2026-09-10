import { describe, it, expect, vi, beforeEach } from 'vitest';
import { suspendCustomer } from '@/lib/suspension/engine';
import { restoreCustomer } from '@/lib/suspension/restoration';
import { RailwayClient } from '@/lib/railway/client';
import { makeFakeDeps } from './fakes';
import { CustomerRecord, SubscriptionRecord, RailwayResourceRecord } from '@/types/domain';

function baseCustomer(overrides: Partial<CustomerRecord> = {}): CustomerRecord {
  return {
    id: 'cust_1',
    customerCode: 'WOH-000001',
    email: 'customer@example.com',
    passwordHash: null,
    status: 'ACTIVE',
    automaticSuspension: true,
    ...overrides,
  };
}

function baseSubscription(overrides: Partial<SubscriptionRecord> = {}): SubscriptionRecord {
  return {
    id: 'sub_1',
    customerId: 'cust_1',
    planId: 'plan_1',
    status: 'GRACE_PERIOD',
    suspensionEnabled: true,
    suspendedAt: null,
    currentPeriodStart: '2026-08-01T00:00:00.000Z',
    currentPeriodEnd: '2026-09-01T00:00:00.000Z',
    nextBillingDate: '2026-09-01T00:00:00.000Z',
    gracePeriodEnd: '2026-09-03T00:00:00.000Z',
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
    ...overrides,
  };
}

describe('suspendCustomer — DEDICATED / STOP_DEPLOYMENT', () => {
  it('stops the deployment and marks everything SUSPENDED on verified success', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [dedicatedResource()],
    });

    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation StopDeployment')) return { deploymentStop: true };
        if (query.includes('query GetDeployment')) {
          return { deployment: { id: 'dep_1', status: 'REMOVED', serviceId: 'svc_1', environmentId: 'env_1', createdAt: new Date().toISOString() } };
        }
        throw new Error('unexpected query: ' + query);
      }),
    };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(result.outcome).toBe('SUSPENDED');
    expect((await deps.subscriptions.findById('sub_1'))!.status).toBe('SUSPENDED');
    expect((await deps.customers.findById('cust_1'))!.status).toBe('SUSPENDED');
    expect(deps.events).toHaveLength(1);
    expect(deps.events[0].result).toBe('SUCCESS');
    expect(deps.notificationLog).toHaveLength(1);
  });

  it('does NOT mark SUSPENDED if Railway never confirms the deployment stopped', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [dedicatedResource()],
    });

    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation StopDeployment')) return { deploymentStop: true };
        if (query.includes('query GetDeployment')) {
          // Railway still reports it running — stop was not effective.
          return { deployment: { id: 'dep_1', status: 'SUCCESS', serviceId: 'svc_1', environmentId: 'env_1', createdAt: new Date().toISOString() } };
        }
        throw new Error('unexpected query');
      }),
    };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(result.outcome).toBe('FAILED');
    expect((await deps.subscriptions.findById('sub_1'))!.status).toBe('GRACE_PERIOD');
    expect((await deps.customers.findById('cust_1'))!.status).toBe('ACTIVE');
    expect(deps.events[0].result).toBe('FAILED');
  });

  it('never calls Railway when SUSPENSION_DRY_RUN is set, and never flips status', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [dedicatedResource()],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT', { dryRun: true });

    expect(result.outcome).toBe('DRY_RUN');
    expect(railway.request).not.toHaveBeenCalled();
    expect((await deps.subscriptions.findById('sub_1'))!.status).toBe('GRACE_PERIOD');
  });
});

describe('suspendCustomer — MULTI_TENANT / APP_LEVEL', () => {
  it('flips subscription status without ever calling Railway', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [
        dedicatedResource({ hostingMode: 'MULTI_TENANT', suspensionStrategy: 'APP_LEVEL' }),
      ],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(result.outcome).toBe('SUSPENDED');
    expect(railway.request).not.toHaveBeenCalled();
    expect(deps.events[0].action).toBe('APP_SUSPENDED');
  });
});

describe('suspendCustomer — safety & idempotency', () => {
  it('skips a resource whose strategy is MANUAL rather than automating it', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [dedicatedResource({ suspensionStrategy: 'MANUAL' })],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(railway.request).not.toHaveBeenCalled();
    expect(result.resourceResults[0].result).toBe('SKIPPED');
  });

  it('is idempotent — calling suspend twice does not double-log or error', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription()],
      railwayResources: [
        dedicatedResource({ hostingMode: 'MULTI_TENANT', suspensionStrategy: 'APP_LEVEL' }),
      ],
    });
    const railway: RailwayClient = { request: vi.fn() };

    await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');
    const second = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(second.outcome).toBe('SKIPPED');
    expect(deps.events).toHaveLength(1); // not logged again
  });

  it('respects automaticSuspension=false for automated calls', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer({ automaticSuspension: false })],
      subscriptions: [baseSubscription()],
      railwayResources: [dedicatedResource()],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'NON_PAYMENT');

    expect(result.outcome).toBe('SKIPPED');
    expect(railway.request).not.toHaveBeenCalled();
  });

  it('ignores automaticSuspension=false when the call is manual (admin-initiated)', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer({ automaticSuspension: false })],
      subscriptions: [baseSubscription()],
      railwayResources: [
        dedicatedResource({ hostingMode: 'MULTI_TENANT', suspensionStrategy: 'APP_LEVEL' }),
      ],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await suspendCustomer(deps, railway, 'sub_1', 'ADMIN_OVERRIDE', {
      manual: true,
      performedBy: 'admin_1',
    });

    expect(result.outcome).toBe('SUSPENDED');
    expect(deps.events[0].action).toBe('MANUAL_SUSPENSION');
    expect(deps.events[0].performedBy).toBe('admin_1');
  });
});

describe('restoreCustomer', () => {
  it('refuses to restore without server-verified payment', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [dedicatedResource({ status: 'STOPPED' })],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await restoreCustomer(deps, railway, 'sub_1', { paymentVerified: false });

    expect(result.outcome).toBe('FAILED');
    expect(railway.request).not.toHaveBeenCalled();
  });

  it('redeploys and verifies before marking ACTIVE (DEDICATED)', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [dedicatedResource({ status: 'STOPPED', deploymentId: null })],
    });

    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation RedeployService')) return { serviceInstanceRedeploy: true };
        if (query.includes('query GetDeployments')) {
          return {
            deployments: {
              edges: [
                {
                  node: {
                    id: 'dep_2',
                    status: 'SUCCESS',
                    serviceId: 'svc_1',
                    environmentId: 'env_1',
                    createdAt: new Date().toISOString(),
                  },
                },
              ],
            },
          };
        }
        if (query.includes('query GetDeployment(')) {
          return { deployment: { id: 'dep_2', status: 'SUCCESS', serviceId: 'svc_1', environmentId: 'env_1', createdAt: new Date().toISOString() } };
        }
        throw new Error('unexpected: ' + query);
      }),
    };

    const result = await restoreCustomer(deps, railway, 'sub_1', {
      paymentVerified: true,
      performedBy: null,
    });

    expect(result.outcome).toBe('RESTORED');
    expect((await deps.subscriptions.findById('sub_1'))!.status).toBe('ACTIVE');
    expect((await deps.customers.findById('cust_1'))!.status).toBe('ACTIVE');
  });

  it('restores MULTI_TENANT access immediately with no Railway call', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer({ status: 'SUSPENDED' })],
      subscriptions: [baseSubscription({ status: 'SUSPENDED' })],
      railwayResources: [
        dedicatedResource({ hostingMode: 'MULTI_TENANT', suspensionStrategy: 'APP_LEVEL', status: 'ACTIVE' }),
      ],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await restoreCustomer(deps, railway, 'sub_1', { paymentVerified: true });

    expect(result.outcome).toBe('RESTORED');
    expect(railway.request).not.toHaveBeenCalled();
  });

  it('is a no-op if subscription is not currently SUSPENDED', async () => {
    const deps = makeFakeDeps({
      customers: [baseCustomer()],
      subscriptions: [baseSubscription({ status: 'ACTIVE' })],
      railwayResources: [dedicatedResource()],
    });
    const railway: RailwayClient = { request: vi.fn() };

    const result = await restoreCustomer(deps, railway, 'sub_1', { paymentVerified: true });

    expect(result.outcome).toBe('SKIPPED');
  });
});
