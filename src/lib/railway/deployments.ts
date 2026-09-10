import { RailwayClient, RailwayApiError } from './client';

/**
 * VERIFY BEFORE PRODUCTION (spec section 48):
 * The query/mutation names and argument shapes below reflect Railway's
 * public GraphQL API as of this writing. Railway's schema is not
 * guaranteed stable. Before enabling live suspension:
 *
 *   1. Run `verifySchema()` (below) against RAILWAY_API_URL.
 *   2. Confirm `deploymentStop` / `deploymentRedeploy` (or their current
 *      names) still exist with these argument shapes.
 *   3. If they've changed, update the query strings here — do NOT patch
 *      around a mismatch by guessing at a new name.
 *
 * If a mutation is missing/renamed, functions here throw RailwayApiError
 * rather than silently no-op, so the suspension engine fails safe
 * (result = FAILED / UNKNOWN) instead of reporting a false success.
 */

export interface RailwayDeployment {
  id: string;
  status: string; // Railway's raw status string (e.g. SUCCESS, CRASHED, REMOVED, SLEEPING)
  serviceId: string;
  environmentId: string;
  createdAt: string;
}

const DEPLOYMENT_FIELDS = `
  id
  status
  serviceId
  environmentId
  createdAt
`;

export async function getDeployment(
  client: RailwayClient,
  deploymentId: string
): Promise<RailwayDeployment | null> {
  const query = `
    query GetDeployment($id: String!) {
      deployment(id: $id) { ${DEPLOYMENT_FIELDS} }
    }
  `;
  const data = await client.request<{ deployment: RailwayDeployment | null }>(query, {
    id: deploymentId,
  });
  return data.deployment ?? null;
}

export async function getDeployments(
  client: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<RailwayDeployment[]> {
  const query = `
    query GetDeployments($input: DeploymentListInput!) {
      deployments(input: $input) {
        edges { node { ${DEPLOYMENT_FIELDS} } }
      }
    }
  `;
  const data = await client.request<{
    deployments: { edges: Array<{ node: RailwayDeployment }> };
  }>(query, { input: { serviceId, environmentId } });
  return data.deployments.edges.map((e) => e.node);
}

/**
 * Stops the current deployment for a service (DEDICATED / STOP_DEPLOYMENT
 * strategy). This must NEVER delete the service — only halt the running
 * deployment. Verifies the resulting status before returning.
 */
export async function stopDeployment(
  client: RailwayClient,
  deploymentId: string
): Promise<{ success: boolean; status: string }> {
  const mutation = `
    mutation StopDeployment($id: String!) {
      deploymentStop(id: $id)
    }
  `;
  try {
    await client.request<{ deploymentStop: boolean }>(mutation, { id: deploymentId });
  } catch (err) {
    if (err instanceof RailwayApiError) throw err;
    throw new RailwayApiError('Failed to stop deployment', 'GRAPHQL_ERROR', err);
  }

  const after = await getDeployment(client, deploymentId);
  const status = after?.status ?? 'UNKNOWN';
  // Only report success if Railway confirms a stopped/removed-style status.
  const success = ['REMOVED', 'SLEEPING', 'CRASHED', 'FAILED'].includes(status);
  return { success, status };
}

/**
 * Triggers a fresh deployment for a service (used on restoration).
 * Returns the new deployment id so the caller can poll/verify.
 */
export async function redeployService(
  client: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<{ deploymentId: string | null }> {
  const mutation = `
    mutation RedeployService($serviceId: String!, $environmentId: String!) {
      serviceInstanceRedeploy(serviceId: $serviceId, environmentId: $environmentId)
    }
  `;
  await client.request<{ serviceInstanceRedeploy: boolean }>(mutation, {
    serviceId,
    environmentId,
  });

  const deployments = await getDeployments(client, serviceId, environmentId);
  const latest = deployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  return { deploymentId: latest?.id ?? null };
}

/** Polls a deployment until it reaches a terminal state or times out. */
export async function verifyDeploymentReachesStatus(
  client: RailwayClient,
  deploymentId: string,
  targetStatuses: string[],
  opts: { maxAttempts?: number; intervalMs?: number } = {}
): Promise<{ reached: boolean; finalStatus: string }> {
  const maxAttempts = opts.maxAttempts ?? 10;
  const intervalMs = opts.intervalMs ?? 3000;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const deployment = await getDeployment(client, deploymentId);
    const status = deployment?.status ?? 'UNKNOWN';
    if (targetStatuses.includes(status)) {
      return { reached: true, finalStatus: status };
    }
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }
  const final = await getDeployment(client, deploymentId);
  return { reached: false, finalStatus: final?.status ?? 'UNKNOWN' };
}
