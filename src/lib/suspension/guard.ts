import { SubscriptionRepository, CustomerRepository } from '../db/ports';

export interface GuardResult {
  allowed: boolean;
  reason?: string;
}

/**
 * subscriptionGuard — spec section 17. Deliberately returns only a
 * boolean + generic reason. Callers (middleware, portal pages) must not
 * surface anything more specific (amount owed, dates) on a public-facing
 * suspension page — see spec section 18.
 */
export async function subscriptionGuard(
  subscriptions: SubscriptionRepository,
  customers: CustomerRepository,
  customerId: string
): Promise<GuardResult> {
  const customer = await customers.findById(customerId);
  if (!customer) {
    return { allowed: false, reason: 'not_found' };
  }
  if (customer.status === 'ACTIVE') {
    return { allowed: true };
  }
  return { allowed: false, reason: 'account_not_active' };
}
