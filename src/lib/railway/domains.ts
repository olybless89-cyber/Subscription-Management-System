import { RailwayClient } from './client';

/**
 * VERIFIED against Railway's live GraphQL schema via introspection on
 * 2026-09-10. Two real mismatches found and fixed here versus the
 * original draft:
 *
 *   1. The `domains` query requires ALL THREE of `projectId`,
 *      `environmentId`, AND `serviceId` (all NON_NULL) — the original
 *      draft only passed `serviceId` and would have failed every call
 *      with a GraphQL validation error demanding the missing variables.
 *   2. `ServiceDomain` and `CustomDomain` do NOT share a `status` field
 *      name: `ServiceDomain` has `syncStatus`, `CustomDomain` has
 *      `status`. The original draft queried `status` on both, which
 *      would have failed validation for `serviceDomains` specifically
 *      ("Cannot query field 'status' on type 'ServiceDomain'").
 *      Fixed by querying the correct field per type and normalizing
 *      both into one `status` field on our own RailwayDomainStatus type
 *      at the mapping layer — the GraphQL query itself asks for the
 *      real field names.
 */

export interface RailwayDomainStatus {
  domain: string;
  status: string; // normalized: ServiceDomain.syncStatus or CustomDomain.status, whichever applies
}

export async function getServiceDomains(
  client: RailwayClient,
  projectId: string,
  environmentId: string,
  serviceId: string
): Promise<RailwayDomainStatus[]> {
  const query = `
    query ServiceDomains($projectId: String!, $environmentId: String!, $serviceId: String!) {
      domains(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId) {
        serviceDomains { domain syncStatus }
        customDomains { domain status }
      }
    }
  `;
  const data = await client.request<{
    domains: {
      serviceDomains: Array<{ domain: string; syncStatus: string }>;
      customDomains: Array<{ domain: string; status: string }>;
    };
  }>(query, { projectId, environmentId, serviceId });

  return [
    ...data.domains.serviceDomains.map((d) => ({ domain: d.domain, status: d.syncStatus })),
    ...data.domains.customDomains.map((d) => ({ domain: d.domain, status: d.status })),
  ];
}

export async function getDomainStatus(
  client: RailwayClient,
  projectId: string,
  environmentId: string,
  serviceId: string,
  domainName: string
): Promise<string> {
  const domains = await getServiceDomains(client, projectId, environmentId, serviceId);
  return domains.find((d) => d.domain === domainName)?.status ?? 'UNKNOWN';
}

// No deleteDomain export — domain deletion is a permanent-termination-only
// operation (spec section 43), never something the sync/suspension workers
// can reach.
