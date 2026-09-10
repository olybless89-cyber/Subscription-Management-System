import { BillingSetupDeps } from '../db/ports';
import { DomainRecord } from '@/types/domain';

export interface CreateDomainInput {
  customerId: string;
  domainName: string;
  isPrimary?: boolean;
}

export type CreateDomainOutcome = 'CREATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface CreateDomainResult {
  outcome: CreateDomainOutcome;
  message: string;
  domain?: DomainRecord;
}

// Deliberately loose — catches the obvious typos ("no dot", stray
// spaces/protocol prefixes) without trying to be a full RFC validator.
const DOMAIN_PATTERN = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;

/**
 * createDomain — spec section 43 ("Domain deletion should only occur
 * during explicit permanent teardown" — this function only ever adds).
 * Attaching a domain here does NOT touch Railway — this is local
 * bookkeeping only. Syncing `railwayStatus` against Railway's actual
 * domain records is a separate concern (would live in the sync worker,
 * alongside syncRailwayResources — not built yet, see README).
 *
 * Not privilege-sensitive the way createAdmin is; any authenticated
 * admin can attach a domain to a customer they can see (scoping is
 * enforced at the route layer via canAccessCustomer, same pattern as
 * checkout/suspend/restore).
 *
 * Known simplification: does not enforce "only one isPrimary per
 * customer" — if you mark two domains primary, both stay primary.
 * That's a data-hygiene gap, not a safety one; worth tightening if it
 * becomes a real source of confusion.
 */
export async function createDomain(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  input: CreateDomainInput
): Promise<CreateDomainResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(input.customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  const domainName = input.domainName?.trim().toLowerCase();
  if (!domainName || !DOMAIN_PATTERN.test(domainName)) {
    return { outcome: 'INVALID_INPUT', message: 'domainName does not look like a valid domain' };
  }

  const existingForCustomer = await deps.domains.findByCustomerId(input.customerId);

  const existingAnywhere = await deps.domains.findByDomainName(domainName);
  if (existingAnywhere) {
    return {
      outcome: 'ALREADY_EXISTS',
      message:
        existingAnywhere.customerId === input.customerId
          ? 'This domain is already attached to this customer'
          : 'This domain is already attached to a different customer',
    };
  }

  const domain = await deps.domains.create({
    customerId: input.customerId,
    domainName,
    isPrimary: input.isPrimary ?? existingForCustomer.length === 0,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'DOMAIN_CREATED',
    target: domain.id,
    metadata: { customerId: input.customerId, domainName },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Domain attached', domain };
}
