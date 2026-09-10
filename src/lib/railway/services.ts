import { RailwayClient } from './client';
import { DEPLOYMENT_RUNNING_STATUSES, DEPLOYMENT_STOPPED_STATUSES } from './deployments';

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
 *
 * VERIFIED against live schema introspection (2026-09-10): the
 * `deployments` query's pagination is Relay-style — `first` as a
 * top-level argument, not a `limit` field inside `DeploymentListInput`
 * (that field doesn't exist and would have failed as a GraphQL
 * validation error). Fixed here.
 */
export async function getServiceStatus(
  client: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<'ACTIVE' | 'STOPPED' | 'UNKNOWN'> {
  const query = `
    query ServiceLatestDeployment($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { status } }
      }
    }
  `;
  const data = await client.request<{
    deployments: { edges: Array<{ node: { status: string } }> };
  }>(query, { input: { serviceId, environmentId }, first: 1 });

  const status = data.deployments.edges[0]?.node.status;
  if (!status) return 'UNKNOWN';
  if (DEPLOYMENT_RUNNING_STATUSES.includes(status)) return 'ACTIVE';
  if (DEPLOYMENT_STOPPED_STATUSES.includes(status)) return 'STOPPED';
  // In-progress states (BUILDING, DEPLOYING, QUEUED, ...) deliberately
  // land here rather than being guessed as ACTIVE or STOPPED — "we
  // don't know yet" is the honest answer mid-deploy.
  return 'UNKNOWN';
}
