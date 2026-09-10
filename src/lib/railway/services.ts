import { RailwayClient } from './client';

export interface RailwayService {
  id: string;
  name: string;
  projectId: string;
}

export async function getService(
  client: RailwayClient,
  serviceId: string
): Promise<RailwayService | null> {
  const query = `
    query GetService($id: String!) {
      service(id: $id) { id name projectId }
    }
  `;
  const data = await client.request<{ service: RailwayService | null }>(query, { id: serviceId });
  return data.service ?? null;
}

/**
 * Returns a coarse status string for a service derived from its latest
 * deployment. Used by the sync worker to populate RailwayResourceStatus.
 * NEVER used to trigger destructive actions on its own.
 */
export async function getServiceStatus(
  client: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<'ACTIVE' | 'STOPPED' | 'UNKNOWN'> {
  const query = `
    query ServiceLatestDeployment($serviceId: String!, $environmentId: String!) {
      deployments(input: { serviceId: $serviceId, environmentId: $environmentId, limit: 1 }) {
        edges { node { status } }
      }
    }
  `;
  const data = await client.request<{
    deployments: { edges: Array<{ node: { status: string } }> };
  }>(query, { serviceId, environmentId });

  const status = data.deployments.edges[0]?.node.status;
  if (!status) return 'UNKNOWN';
  if (status === 'SUCCESS' || status === 'ACTIVE') return 'ACTIVE';
  if (['REMOVED', 'SLEEPING', 'CRASHED', 'FAILED'].includes(status)) return 'STOPPED';
  return 'UNKNOWN';
}
