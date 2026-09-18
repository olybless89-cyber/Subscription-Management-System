// GET /api/admin/railway/services — SUPER_ADMIN only, same scoping as
// every other Railway-infrastructure view (see subscriptions/[id]/page.tsx).
//
// Powers the "import Railway services" screen: lists every
// project/service/environment visible to the account's RAILWAY_API_TOKEN,
// cross-referenced against what's already mapped in RailwayResource so
// the UI can skip services you've already wired up, plus a best-effort
// suggested customer match by domain name so mapping the rest is mostly
// "confirm this guess" rather than hunting through a dropdown.
//
// The customer match is a NAME HEURISTIC ONLY (substring match against
// each customer's attached domain names) — Railway has no concept of
// "which of your customers owns this service", so this can never be
// authoritative. It never maps anything by itself; a human still clicks
// "Map" per service (that call goes through the existing, unchanged
// POST /api/admin/subscriptions/:id/railway-resource route).
//
// Also resolves each not-yet-mapped service's latest deploymentId (for
// its default/production environment) so the mapping call can record it
// up front — suspension for DEDICATED/SHARED_SERVICE strategies calls
// stopDeployment(deploymentId) and hard-fails without one (see
// src/lib/suspension/engine.ts), so leaving this null at mapping time
// would silently break suspension later. Best-effort: a lookup failure
// for one service just leaves that service's deploymentId null rather
// than failing the whole screen (the admin can always re-map after a
// deploy, or the value gets corrected on the next "Map" retry).

import { buildBillingSetupDeps } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { listAccountProjects, RailwayAccountEnvironment } from '../../../../../src/lib/railway/projects';
import { getDeployments } from '../../../../../src/lib/railway/deployments';
import { RailwayApiError, RailwayClient } from '../../../../../src/lib/railway/client';
import { resolveRailwayClientForAccount, HostingAccountResolutionError } from '../../../../../src/lib/hosting/account-client';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function defaultEnvironmentId(envs: RailwayAccountEnvironment[]): string {
  return envs.find((e) => e.name.toLowerCase() === 'production')?.id ?? envs[0]?.id ?? '';
}

/** Runs `fn` over `items` with at most `limit` in flight at once — a
 * plain Promise.all over 30+ services would fan out that many
 * simultaneous Railway API calls, which is both unfriendly to their
 * rate limits and unnecessary for a screen the admin is fine waiting a
 * few seconds on. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function latestDeploymentId(
  railway: RailwayClient,
  serviceId: string,
  environmentId: string
): Promise<string | null> {
  if (!environmentId) return null;
  try {
    const deployments = await getDeployments(railway, serviceId, environmentId, 1);
    return deployments[0]?.id ?? null;
  } catch {
    // Best-effort — see file header comment.
    return null;
  }
}

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const url = new URL(request.url);
  const accountId = url.searchParams.get('accountId');
  if (!accountId) {
    return json(400, { error: 'accountId is required — pick a connected Railway account to browse.' });
  }

  const deps = buildBillingSetupDeps();

  let railway: RailwayClient;
  try {
    railway = await resolveRailwayClientForAccount(deps.hostingAccounts, accountId);
  } catch (err) {
    const message = err instanceof HostingAccountResolutionError ? err.message : 'Failed to resolve hosting account';
    return json(400, { error: message });
  }

  let projects;
  try {
    projects = await listAccountProjects(railway);
  } catch (err) {
    const message = err instanceof RailwayApiError ? err.message : 'Failed to reach Railway';
    return json(502, { error: message });
  }

  const [allResources, customers, domains, subscriptions] = await Promise.all([
    deps.railwayResources.findAll(),
    deps.customers.listAll(),
    deps.domains.listAll(),
    deps.subscriptions.listAll(),
  ]);
  // Scoped to THIS account — project/service ids from a different
  // Railway account should never show as "already mapped" here.
  const existingResources = allResources.filter((r) => r.hostingAccountId === accountId);

  const mappedByServiceId = new Map(existingResources.map((r) => [`${r.projectId}:${r.serviceId}`, r]));
  const subscriptionsByCustomerId = new Map<string, typeof subscriptions>();
  for (const s of subscriptions) {
    const list = subscriptionsByCustomerId.get(s.customerId) ?? [];
    list.push(s);
    subscriptionsByCustomerId.set(s.customerId, list);
  }

  // domainName -> customerId, normalized for loose substring matching.
  const domainIndex = domains.map((d) => ({ needle: normalize(d.domainName), customerId: d.customerId }));

  const flatServices = projects.flatMap((project) =>
    project.services.map((service) => ({ project, service }))
  );

  const deploymentIds = await mapWithConcurrency(flatServices, 5, ({ project, service }) => {
    const key = `${project.id}:${service.id}`;
    if (mappedByServiceId.has(key)) return Promise.resolve(null); // already mapped — no need to look this up
    const envId = defaultEnvironmentId(project.environments);
    return latestDeploymentId(railway, service.id, envId);
  });

  const services = flatServices.map(({ project, service }, i) => {
    const key = `${project.id}:${service.id}`;
    const existing = mappedByServiceId.get(key);
    const mappedCustomer = existing
      ? customers.find((c) =>
          subscriptions.some((s) => s.id === existing.subscriptionId && s.customerId === c.id)
        )
      : null;

    let suggestedCustomerId: string | null = null;
    if (!existing) {
      const haystack = normalize(`${project.name}${service.name}`);
      const match = domainIndex.find((d) => d.needle.length > 2 && haystack.includes(d.needle));
      suggestedCustomerId = match?.customerId ?? null;
    }

    return {
      projectId: project.id,
      projectName: project.name,
      serviceId: service.id,
      serviceName: service.name,
      environments: project.environments,
      defaultEnvironmentId: defaultEnvironmentId(project.environments),
      latestDeploymentId: deploymentIds[i],
      mapped: existing
        ? {
            subscriptionId: existing.subscriptionId,
            customerId: mappedCustomer?.id ?? null,
            customerName: mappedCustomer?.name ?? null,
            customerCode: mappedCustomer?.customerCode ?? null,
            hostingMode: existing.hostingMode,
            suspensionStrategy: existing.suspensionStrategy,
          }
        : null,
      suggestedCustomerId,
    };
  });

  // Flat customer -> subscriptions list for the mapping dropdown, safe
  // shape only (no passwordHash).
  const customerOptions = customers
    .filter((c) => (subscriptionsByCustomerId.get(c.id)?.length ?? 0) > 0)
    .map((c) => ({
      id: c.id,
      name: c.name,
      customerCode: c.customerCode,
      subscriptions: (subscriptionsByCustomerId.get(c.id) ?? []).map((s) => ({ id: s.id, status: s.status })),
    }));

  return json(200, { services, customers: customerOptions });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}
