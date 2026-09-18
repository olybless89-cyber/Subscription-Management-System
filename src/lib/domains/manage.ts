import { BillingSetupDeps } from '../db/ports';
import { DomainRecord } from '@/types/domain';

export interface CreateDomainInput {
  customerId: string;
  domainName: string;
  isPrimary?: boolean;
  /** Which subscription this specific domain/service is governed by —
   * see the schema comment on Domain.subscriptionId. Validated to
   * actually belong to this customer when given. */
  subscriptionId?: string | null;
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

  if (input.subscriptionId) {
    const subscription = await deps.subscriptions.findById(input.subscriptionId);
    if (!subscription || subscription.customerId !== input.customerId) {
      return { outcome: 'INVALID_INPUT', message: 'subscriptionId does not belong to this customer' };
    }
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
    subscriptionId: input.subscriptionId ?? null,
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

export type UpdateDomainOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface UpdateDomainInput {
  domainName?: string;
  isPrimary?: boolean;
  /** Explicit `null` clears the link (domain no longer tied to any
   * particular subscription); `undefined` leaves it untouched. */
  subscriptionId?: string | null;
}

export interface UpdateDomainResult {
  outcome: UpdateDomainOutcome;
  message: string;
  domain?: DomainRecord;
}

/**
 * updateDomain — rename a domain, flip isPrimary, or re-link/unlink
 * which subscription governs it (so per-domain suspend/restore tracks
 * the right subscription). Never moves a domain to a different
 * customer — see DomainRepository.update's doc comment for why.
 *
 * Same privilege bar as createDomain: any authenticated admin who can
 * see this customer (enforced at the route layer via
 * canAccessCustomer), not SUPER_ADMIN-only.
 */
export async function updateDomain(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  domainId: string,
  input: UpdateDomainInput
): Promise<UpdateDomainResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const domain = await deps.domains.findById(domainId);
  if (!domain) {
    return { outcome: 'NOT_FOUND', message: 'Domain not found' };
  }

  const patch: { domainName?: string; isPrimary?: boolean; subscriptionId?: string | null } = {};

  if (input.domainName !== undefined) {
    const domainName = input.domainName.trim().toLowerCase();
    if (!domainName || !DOMAIN_PATTERN.test(domainName)) {
      return { outcome: 'INVALID_INPUT', message: 'domainName does not look like a valid domain' };
    }
    if (domainName !== domain.domainName) {
      const existingAnywhere = await deps.domains.findByDomainName(domainName);
      if (existingAnywhere && existingAnywhere.id !== domainId) {
        return {
          outcome: 'ALREADY_EXISTS',
          message:
            existingAnywhere.customerId === domain.customerId
              ? 'This domain is already attached to this customer'
              : 'This domain is already attached to a different customer',
        };
      }
    }
    patch.domainName = domainName;
  }

  if (input.isPrimary !== undefined) {
    patch.isPrimary = input.isPrimary;
  }

  if (input.subscriptionId !== undefined) {
    if (input.subscriptionId) {
      const subscription = await deps.subscriptions.findById(input.subscriptionId);
      if (!subscription || subscription.customerId !== domain.customerId) {
        return { outcome: 'INVALID_INPUT', message: 'subscriptionId does not belong to this customer' };
      }
    }
    patch.subscriptionId = input.subscriptionId;
  }

  const updated = await deps.domains.update(domainId, patch);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'DOMAIN_UPDATED',
    target: domainId,
    metadata: { customerId: domain.customerId, ...patch },
    result: 'SUCCESS',
  });

  return { outcome: 'UPDATED', message: 'Domain updated', domain: updated };
}

export type DeleteDomainOutcome = 'DELETED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface DeleteDomainResult {
  outcome: DeleteDomainOutcome;
  message: string;
}

/**
 * deleteDomain — spec section 43, the explicit permanent-teardown path
 * that createDomain/updateDomain deliberately never fall into.
 * Deliberately SUPER_ADMIN only, same bar as deleteCustomer: removing a
 * domain silently breaks the /suspended host-routing and renewal-lookup
 * paths for that hostname, which is a bigger blast radius than the
 * per-customer assignment system was designed to gate. Does not touch
 * Railway — this only removes this app's own DNS-routing bookkeeping;
 * the actual domain record on the Railway service, if any, must be
 * removed there separately.
 */
export async function deleteDomain(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  domainId: string
): Promise<DeleteDomainResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can permanently delete a domain' };
  }

  const domain = await deps.domains.findById(domainId);
  if (!domain) {
    return { outcome: 'NOT_FOUND', message: 'Domain not found' };
  }

  await deps.domains.delete(domainId);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'DOMAIN_DELETED',
    target: domainId,
    metadata: { customerId: domain.customerId, domainName: domain.domainName },
    result: 'SUCCESS',
  });

  return { outcome: 'DELETED', message: `${domain.domainName} permanently removed` };
}
