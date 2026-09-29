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
 * Resolves the CURRENT deployment id for a service — the one Railway
 * will actually let you stop. `RailwayResource.deploymentId` is a
 * snapshot taken at resource-creation/import time (or after a prior
 * restore's `redeployService` call); it goes stale the moment the
 * service redeploys again for any reason outside this app (a manual
 * Railway dashboard redeploy, a git push, Railway's own restart) —
 * Railway only allows `deploymentStop` on a service's current
 * deployment, and rejects an older one with a GraphQL error ("Deployment
 * is not stoppable"), not a normal "already stopped" result. Sorts
 * client-side by createdAt (mirrors redeployService below) rather than
 * trusting Relay edge order. Returns null if the service has no
 * deployments at all yet.
 */
export async function getLatestDeploymentId(
  client: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<string | null> {
  const deployments = await getDeployments(client, serviceId, environmentId, 5);
  const latest = deployments.sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0];
  return latest?.id ?? null;
}

/**
 * Stops the current deployment for a service (DEDICATED / STOP_DEPLOYMENT
 * strategy). This must NEVER delete the service — only halt the running
 * deployment. Verifies via `deploymentStopped` (a real, authoritative
 * boolean field) before returning — not a guess from `status` text.
 *
 * POLLS rather than checking once immediately after the mutation.
 * `deploymentStop` is fire-and-forget on Railway's side: it queues the
 * stop and returns before the deployment has actually transitioned, so
 * a single read right after firing it can still see the pre-stop state
 * (status still SUCCESS, deploymentStopped still false/undefined) even
 * though the deployment genuinely does stop moments later. That race
 * was reproduced in production on 2026-09-29: `stopDeployment` returned
 * success:false so suspendCustomer never flipped the subscription to
 * SUSPENDED, but Railway's own stop had already taken effect for real —
 * leaving the customer's service down with a subscription record that
 * looked untouched, so restoreCustomer's very first guard ("not
 * SUSPENDED, nothing to restore") skipped every restore attempt. Poll
 * the same way verifyDeploymentReachesStatus already does for restores,
 * so a slightly-delayed stop is still verified correctly.
 */
export async function stopDeployment(
  client: RailwayClient,
  deploymentId: string,
  opts: { maxAttempts?: number; intervalMs?: number } = {}
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

  const maxAttempts = opts.maxAttempts ?? 10;
  const intervalMs = opts.intervalMs ?? 3000;

  let status = 'UNKNOWN';
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const after = await getDeployment(client, deploymentId);
    status = after?.status ?? 'UNKNOWN';

    // deploymentStopped is the authoritative signal — trust it the
    // moment it's true, regardless of what status text says.
    if (after?.deploymentStopped === true) {
      return { success: true, status };
    }

    // Once the deployment has settled into a terminal status, there is
    // nothing more to wait for: fall back to the status-text heuristic
    // (deploymentStopped undefined) or honor an explicit false (which
    // overrides the heuristic even if status happens to look terminal —
    // see the "deploymentStopped: false wins" test case).
    if (DEPLOYMENT_STOPPED_STATUSES.includes(status)) {
      return { success: after?.deploymentStopped !== false, status };
    }

    // Still running (status hasn't moved yet) or mid-transition
    // (REMOVING etc.) — the stop may simply not have landed yet. Keep
    // polling instead of reporting a false failure.
    if (attempt < maxAttempts - 1) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  // Exhausted every attempt without ever seeing deploymentStopped or a
  // terminal stopped status — genuinely didn't stop in time.
  return { success: false, status };
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
