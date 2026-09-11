import { describe, it, expect, vi } from 'vitest';
import { syncRailwayResources, syncSingleRailwayResource } from '@/lib/cron/railway-sync';
import { RailwayClient } from '@/lib/railway/client';
import { RailwayResourceRepository } from '@/lib/db/ports';
import { RailwayResourceRecord } from '@/types/domain';
import { makeResourceStatusSnapshotRepo } from './fakes';

function makeFakeResourceRepo(seed: RailwayResourceRecord[]): RailwayResourceRepository & {
  rows: Map<string, RailwayResourceRecord>;
} {
  const rows = new Map(seed.map((r) => [r.id, { ...r }]));
  return {
    rows,
    async findBySubscriptionId(subscriptionId) {
      return [...rows.values()].filter((r) => r.subscriptionId === subscriptionId);
    },
    async findAll() {
      return [...rows.values()];
    },
    async updateStatus(id, status, extra) {
      const r = rows.get(id);
      if (!r) throw new Error('not found');
      r.status = status;
      if (extra?.deploymentId !== undefined) r.deploymentId = extra.deploymentId ?? null;
    },
    async create(input) {
      const record: RailwayResourceRecord = {
        id: `res_${rows.size + 1}`,
        subscriptionId: input.subscriptionId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        serviceId: input.serviceId,
        deploymentId: input.deploymentId ?? null,
        hostingMode: input.hostingMode,
        suspensionStrategy: input.suspensionStrategy,
        status: 'UNKNOWN',
      };
      rows.set(record.id, record);
      return record;
    },
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
    status: 'UNKNOWN',
    ...overrides,
  };
}

function multiTenantResource(overrides: Partial<RailwayResourceRecord> = {}): RailwayResourceRecord {
  return {
    id: 'res_mt',
    subscriptionId: 'sub_2',
    projectId: 'proj_2',
    environmentId: 'env_2',
    serviceId: 'svc_2',
    deploymentId: null,
    hostingMode: 'MULTI_TENANT',
    suspensionStrategy: 'APP_LEVEL',
    status: 'ACTIVE',
    ...overrides,
  };
}

describe('syncRailwayResources', () => {
  it('updates local status to match a confirmed running deployment', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };

    const result = await syncRailwayResources(repo, railway);

    expect(result.checked).toBe(1);
    expect(result.updated).toBe(1);
    expect(repo.rows.get('res_1')!.status).toBe('ACTIVE');
  });

  it('updates local status to STOPPED for a removed/crashed deployment', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource({ status: 'ACTIVE' })]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'REMOVED' } }] },
      })),
    };

    const result = await syncRailwayResources(repo, railway);

    expect(result.updated).toBe(1);
    expect(repo.rows.get('res_1')!.status).toBe('STOPPED');
  });

  it('marks status UNKNOWN (never a false success) when Railway is unreachable', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource({ status: 'ACTIVE' })]);
    const railway: RailwayClient = {
      request: vi.fn(async () => {
        throw new Error('network error');
      }),
    };

    const result = await syncRailwayResources(repo, railway);

    expect(result.errors).toHaveLength(1);
    expect(repo.rows.get('res_1')!.status).toBe('UNKNOWN');
  });

  it('skips MULTI_TENANT resources entirely — never queries Railway for them', async () => {
    const repo = makeFakeResourceRepo([multiTenantResource(), dedicatedResource()]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };

    const result = await syncRailwayResources(repo, railway);

    // Only the DEDICATED resource is checked; MULTI_TENANT is skipped.
    expect(result.checked).toBe(1);
    expect(railway.request).toHaveBeenCalledTimes(1);
    expect(repo.rows.get('res_mt')!.status).toBe('ACTIVE'); // untouched
  });
});

describe('syncRailwayResources — status snapshot recording', () => {
  it('records a snapshot on a successful check when a snapshot repo is provided', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const { repo: snapshots, rows: snapshotRows } = makeResourceStatusSnapshotRepo();
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };

    await syncRailwayResources(repo, railway, snapshots);

    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0]).toMatchObject({ railwayResourceId: 'res_1', status: 'ACTIVE' });
  });

  it('records an UNKNOWN snapshot when Railway is unreachable — never silently drops the data point', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const { repo: snapshots, rows: snapshotRows } = makeResourceStatusSnapshotRepo();
    const railway: RailwayClient = {
      request: vi.fn(async () => {
        throw new Error('network error');
      }),
    };

    await syncRailwayResources(repo, railway, snapshots);

    expect(snapshotRows).toHaveLength(1);
    expect(snapshotRows[0].status).toBe('UNKNOWN');
  });

  it('never breaks the sync itself if writing a snapshot throws', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };
    const brokenSnapshots = {
      async create() {
        throw new Error('simulated DB failure writing snapshot');
      },
      async findByResourceId() {
        return [];
      },
    };

    const result = await syncRailwayResources(repo, railway, brokenSnapshots);

    expect(result.updated).toBe(1);
    expect(repo.rows.get('res_1')!.status).toBe('ACTIVE');
  });

  it('works fine with no snapshot repo at all (optional parameter, backward compatible)', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };

    const result = await syncRailwayResources(repo, railway);

    expect(result.updated).toBe(1);
  });
});

describe('syncSingleRailwayResource', () => {
  it('syncs one DEDICATED resource on demand (admin "Sync now" button)', async () => {
    const repo = makeFakeResourceRepo([dedicatedResource()]);
    const railway: RailwayClient = {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status: 'SUCCESS' } }] },
      })),
    };

    const outcome = await syncSingleRailwayResource(repo, railway, dedicatedResource());

    expect(outcome.status).toBe('ACTIVE');
  });

  it('is a no-op read for MULTI_TENANT — returns current status without calling Railway', async () => {
    const repo = makeFakeResourceRepo([multiTenantResource()]);
    const railway: RailwayClient = { request: vi.fn() };

    const outcome = await syncSingleRailwayResource(repo, railway, multiTenantResource());

    expect(outcome.status).toBe('ACTIVE');
    expect(railway.request).not.toHaveBeenCalled();
  });
});
