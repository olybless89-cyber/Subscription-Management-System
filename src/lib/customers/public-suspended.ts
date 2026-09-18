import { BillingSetupDeps } from '../db/ports';
import { buildRenewalInfo, RenewalInfo } from './public-renewal';

/**
 * getSuspendedLandingInfo — backs the public, unauthenticated
 * "your subscription is overdue" page (`/suspended`), reached when a
 * customer's own custom domain is manually repointed (in Railway) at
 * THIS app instead of their suspended service — see middleware.ts,
 * which rewrites any request whose Host isn't one of this app's own
 * domains to `/suspended`.
 *
 * Deliberately domain-driven rather than customerCode-driven: whoever
 * is hitting this page just typed/clicked their own domain, they don't
 * have a customerCode handy. Looks the Host header up against the
 * Domain table (domainName is globally unique) to find who owns it,
 * then defers to the exact same needs-payment logic the customerCode
 * link uses, so the two pages can never disagree about payment status.
 */
export async function getSuspendedLandingInfo(deps: BillingSetupDeps, hostHeader: string | null): Promise<RenewalInfo> {
  const domainName = normalizeHost(hostHeader);
  if (!domainName) {
    return { found: false };
  }

  const domain = await deps.domains.findByDomainName(domainName);
  if (!domain) {
    return { found: false };
  }

  const customer = await deps.customers.findById(domain.customerId);
  if (!customer) {
    return { found: false };
  }

  return buildRenewalInfo(deps, customer);
}

/** Strips a port (if any) and a leading "www.", lowercases — matching
 * however domainName was stored when the admin added it (see the Domain
 * form / createDomain validation). */
function normalizeHost(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const withoutPort = hostHeader.split(':')[0].trim().toLowerCase();
  if (!withoutPort) return null;
  return withoutPort.startsWith('www.') ? withoutPort.slice(4) : withoutPort;
}
