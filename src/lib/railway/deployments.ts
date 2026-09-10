import { RailwayClient, RailwayApiError } from './client';

/**
 * VERIFIED against Railway's live GraphQL schema via introspection on
 * 2026-09-10 (see the shell session that produced this — every mutation
 * name, query name, argument name, and field name below was confirmed
 * to exist, not assumed). Three real mismatches were found and fixed
 * here versus the original draft:
 *
 *   1. `deployments`' pagination used a non-existent `limit` field
 *      inside `DeploymentListInput` — real pagination is Relay-style
 *      (`first`/`after`), a separate top-level argument.
 *   2. `Deployment.deploymentStopped: Boolean` exists and is the
 *      authoritative "did this actually stop" signal — now used as the
 *      primary success check instead of guessing from status strings.
 *   3. The real `DeploymentStatus` enum has 13 values (BUILDING,
 *      CRASHED, DEPLOYING, FAILED, INITIALIZING, NEEDS_APPROVAL,
 *      QUEUED, REMOVED, REMOVING, SKIPPED, SLEEPING, SUCCESS, WAITING)
 *      — an invented `'ACTIVE'` value from the original draft did not
 *      exist and has been removed from every status check below.
 *
 * Railway's schema can still change again in the future — if these
 * functions start throwing RailwayApiError unexpectedly, re-run
 * introspection rather than guessing at a fix.
 */

export interface RailwayDeployment {
  id: string;
  status: string; // one of the real DeploymentStatus enum values — see DEPLOYMENT_ACTIVE_STATUSES etc. below
  serviceId: string;
  environmentId: string;
  createdAt: string;
  /** Authoritative — prefer this over inferring from `status` wherever possible. */
  deploymentStopped: boolean;
}

/** Real DeploymentStatus enum values, confirmed via introspection —
 * grouped by what they mean for our simplified ACTIVE/STOPPED/UNKNOWN
 * model. In-progress states (BUILDING, DEPLOYING, etc.) deliberately
 * fall into neither bucket — see services.ts#getServiceStatus. */
export const DEPLOYMENT_RUNNING_STATUSES = ['SUCCESS'];
export const DEPLOYMENT_STOPPED_STATUSES = ['REMOVED', 'SLEEPING', 'CRASHED', 'FAILED', 'SKIPPED'];
export const DEPLOYMENT_IN_PROGRESS_STATUSES = [
  'BUILDING',
  'DEPLOYING',
  'INITIALIZING',
  'QUEUED',
  'WAITING',
  'NEEDS_APPROVAL',
  'REMOVING',
];

const DEPLOYMENT_FIELDS = `
  id
  status
  serviceId
  environmentId
  createdAt
  deploymentStopped
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

/**
 * `first` — Relay-style pagination limit. Confirmed via introspection:
 * `deployments(after, before, first, input, last)` is the real
 * signature; there is no `limit` inside `DeploymentListInput`.
 */
export async function getDeployments(
  client: RailwayClient,
  serviceId: string,
  environmentId: string,
  first?: number
): Promise<RailwayDeployment[]> {
  const query = `
    query GetDeployments($input: DeploymentListInput!, $first: Int) {
      deployments(input: $input, first: $first) {
        edges { node { ${DEPLOYMENT_FIELDS} } }
      }
    }
  `;
  const data = await client.request<{
    deployments: { edges: Array<{ node: RailwayDeployment }> };
  }>(query, { input: { serviceId, environmentId }, first });
  return data.deployments.edges.map((e) => e.node);
}

/**
 * Stops the current deployment for a service (DEDICATED / STOP_DEPLOYMENT
 * strategy). This must NEVER delete the service — only halt the running
 * deployment. Verifies via `deploymentStopped` (a real, authoritative
 * boolean field) before returning — not a guess from `status` text.
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
  // deploymentStopped is the authoritative signal. Fall back to the
  // status-string heuristic only if the field is somehow absent (e.g. an
  // older/mocked response) — never let an absent field silently read as
  // "stopped".
  const success =
    after?.deploymentStopped === true ||
    (after?.deploymentStopped === undefined && DEPLOYMENT_STOPPED_STATUSES.includes(status));
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

  const deployments = await getDeployments(client, serviceId, environmentId, 5);
  const latest = deployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  return { deploymentId: latest?.id ?? null };
}

/** Polls a deployment until it reaches a terminal state or times out.
 * Pass DEPLOYMENT_RUNNING_STATUSES (just `['SUCCESS']` — the only real
 * "up and serving" status) as targetStatuses for restoration checks. */
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
