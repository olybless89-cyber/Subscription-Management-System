import { RailwayClient } from './client';

export interface RailwayDomainStatus {
  domain: string;
  status: string; // e.g. "ACTIVE", "PENDING", "ERROR"
}

export async function getServiceDomains(
  client: RailwayClient,
  serviceId: string
): Promise<RailwayDomainStatus[]> {
  const query = `
    query ServiceDomains($serviceId: String!) {
      domains(serviceId: $serviceId) {
        serviceDomains { domain status }
        customDomains { domain status }
      }
    }
  `;
  const data = await client.request<{
    domains: {
      serviceDomains: RailwayDomainStatus[];
      customDomains: RailwayDomainStatus[];
    };
  }>(query, { serviceId });

  return [...data.domains.serviceDomains, ...data.domains.customDomains];
}

export async function getDomainStatus(
  client: RailwayClient,
  serviceId: string,
  domainName: string
): Promise<string> {
  const domains = await getServiceDomains(client, serviceId);
  return domains.find((d) => d.domain === domainName)?.status ?? 'UNKNOWN';
}

// No deleteDomain export — domain deletion is a permanent-termination-only
// operation (spec section 43), never something the sync/suspension workers
// can reach.
