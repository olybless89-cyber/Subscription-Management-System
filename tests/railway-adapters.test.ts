import { describe, it, expect, vi } from 'vitest';
import { stopDeployment, getDeployments } from '@/lib/railway/deployments';
import { getServiceStatus } from '@/lib/railway/services';
import { getServiceDomains } from '@/lib/railway/domains';
import { RailwayClient } from '@/lib/railway/client';

describe('stopDeployment — deploymentStopped is the authoritative signal', () => {
  it('reports success when deploymentStopped is true, regardless of status text', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation StopDeployment')) return { deploymentStop: true };
        if (query.includes('query GetDeployment')) {
          // status text alone would be ambiguous here (still says
          // SUCCESS momentarily) but deploymentStopped is authoritative.
          return {
            deployment: { id: 'dep_1', status: 'SUCCESS', serviceId: 's', environmentId: 'e', createdAt: '2026-01-01T00:00:00.000Z', deploymentStopped: true },
          };
        }
        throw new Error('unexpected query');
      }),
    };

    const result = await stopDeployment(railway, 'dep_1');
    expect(result.success).toBe(true);
  });

  it('reports FAILURE when deploymentStopped is explicitly false, even if status looks terminal', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation StopDeployment')) return { deploymentStop: true };
        if (query.includes('query GetDeployment')) {
          return {
            deployment: { id: 'dep_1', status: 'FAILED', serviceId: 's', environmentId: 'e', createdAt: '2026-01-01T00:00:00.000Z', deploymentStopped: false },
          };
        }
        throw new Error('unexpected query');
      }),
    };

    const result = await stopDeployment(railway, 'dep_1');
    // deploymentStopped: false wins even though FAILED is in
    // DEPLOYMENT_STOPPED_STATUSES — the boolean is authoritative, the
    // status-text heuristic is only a fallback for when it's absent.
    expect(result.success).toBe(false);
  });

  it('falls back to the status-text heuristic only when deploymentStopped is absent', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        if (query.includes('mutation StopDeployment')) return { deploymentStop: true };
        if (query.includes('query GetDeployment')) {
          return { deployment: { id: 'dep_1', status: 'REMOVED', serviceId: 's', environmentId: 'e', createdAt: '2026-01-01T00:00:00.000Z' } };
        }
        throw new Error('unexpected query');
      }),
    };

    const result = await stopDeployment(railway, 'dep_1');
    expect(result.success).toBe(true);
  });
});

describe('getServiceStatus — real DeploymentStatus enum coverage', () => {
  function mockDeploymentStatus(status: string): RailwayClient {
    return {
      request: vi.fn(async (): Promise<any> => ({
        deployments: { edges: [{ node: { status } }] },
      })),
    };
  }

  it('maps SUCCESS to ACTIVE', async () => {
    expect(await getServiceStatus(mockDeploymentStatus('SUCCESS'), 's', 'e')).toBe('ACTIVE');
  });

  it('maps REMOVED/SLEEPING/CRASHED/FAILED/SKIPPED to STOPPED', async () => {
    for (const status of ['REMOVED', 'SLEEPING', 'CRASHED', 'FAILED', 'SKIPPED']) {
      expect(await getServiceStatus(mockDeploymentStatus(status), 's', 'e')).toBe('STOPPED');
    }
  });

  it('maps in-progress statuses (BUILDING, DEPLOYING, QUEUED, ...) to UNKNOWN, not a guess', async () => {
    for (const status of ['BUILDING', 'DEPLOYING', 'INITIALIZING', 'QUEUED', 'WAITING', 'NEEDS_APPROVAL', 'REMOVING']) {
      expect(await getServiceStatus(mockDeploymentStatus(status), 's', 'e')).toBe('UNKNOWN');
    }
  });

  it('sends `first` as a top-level variable, never `limit` inside input', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (_query: string, variables?: Record<string, unknown>): Promise<any> => {
        expect(variables?.first).toBe(1);
        expect((variables?.input as any)?.limit).toBeUndefined();
        return { deployments: { edges: [] } };
      }),
    };
    await getServiceStatus(railway, 's', 'e');
    expect(railway.request).toHaveBeenCalledTimes(1);
  });
});

describe('getDeployments — Relay-style pagination', () => {
  it('passes `first` as a separate top-level argument, not inside DeploymentListInput', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (_query: string, variables?: Record<string, unknown>): Promise<any> => {
        expect(variables).toEqual({ input: { serviceId: 'svc_1', environmentId: 'env_1' }, first: 5 });
        return { deployments: { edges: [] } };
      }),
    };
    await getDeployments(railway, 'svc_1', 'env_1', 5);
    expect(railway.request).toHaveBeenCalledTimes(1);
  });
});

describe('getServiceDomains — required args and per-type field names', () => {
  it('sends all three required arguments (projectId, environmentId, serviceId)', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (_query: string, variables?: Record<string, unknown>): Promise<any> => {
        expect(variables).toEqual({ projectId: 'proj_1', environmentId: 'env_1', serviceId: 'svc_1' });
        return { domains: { serviceDomains: [], customDomains: [] } };
      }),
    };
    await getServiceDomains(railway, 'proj_1', 'env_1', 'svc_1');
    expect(railway.request).toHaveBeenCalledTimes(1);
  });

  it('queries syncStatus for serviceDomains and status for customDomains, normalizing both to .status', async () => {
    const railway: RailwayClient = {
      request: vi.fn(async (query: string): Promise<any> => {
        // The query text itself must ask for the real field names.
        expect(query).toContain('serviceDomains { domain syncStatus }');
        expect(query).toContain('customDomains { domain status }');
        return {
          domains: {
            serviceDomains: [{ domain: 'app.up.railway.app', syncStatus: 'ACTIVE' }],
            customDomains: [{ domain: 'client-site.com', status: 'ISSUED' }],
          },
        };
      }),
    };

    const result = await getServiceDomains(railway, 'proj_1', 'env_1', 'svc_1');

    expect(result).toEqual([
      { domain: 'app.up.railway.app', status: 'ACTIVE' },
      { domain: 'client-site.com', status: 'ISSUED' },
    ]);
  });
});
