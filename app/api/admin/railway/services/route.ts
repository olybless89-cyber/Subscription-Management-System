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

import { buildBillingSetupDeps, buildRailwayClient } from '../../../../../src/lib/deps-factory';
import { authenticateFromHeader, hasAdminRole } from '../../../../../src/lib/auth/authorize';
import { listAccountProjects } from '../../../../../src/lib/railway/projects';
import { RailwayApiError } from '../../../../../src/lib/railway/client';

function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export async function GET(request: Request): Promise<Response> {
  const auth = authenticateFromHeader(request.headers.get('authorization'));
  if (!auth.authenticated || !hasAdminRole(auth.session, ['SUPER_ADMIN'])) {
    return json(403, { error: 'Super admin access required' });
  }

  const deps = buildBillingSetupDeps();

  let projects;
  try {
    projects = await listAccountProjects(buildRailwayClient());
  } catch (err) {
    const message = err instanceof RailwayApiError ? err.message : 'Failed to reach Railway';
    return json(502, { error: message });
  }

  const [existingResources, customers, domains, subscriptions] = await Promise.all([
    deps.railwayResources.findAll(),
    deps.customers.listAll(),
    deps.domains.listAll(),
    deps.subscriptions.listAll(),
  ]);

  const mappedByServiceId = new Map(existingResources.map((r) => [`${r.projectId}:${r.serviceId}`, r]));
  const subscriptionsByCustomerId = new Map<string, typeof subscriptions>();
  for (const s of subscriptions) {
    const list = subscriptionsByCustomerId.get(s.customerId) ?? [];
    list.push(s);
    subscriptionsByCustomerId.set(s.customerId, list);
  }

  // domainName -> customerId, normalized for loose substring matching.
  const domainIndex = domains.map((d) => ({ needle: normalize(d.domainName), customerId: d.customerId }));

  const services = projects.flatMap((project) =>
    project.services.map((service) => {
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
    })
  );

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
