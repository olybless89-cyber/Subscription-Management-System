import { AdminManagementDeps } from '../db/ports';
import { CustomerRecord, PaymentProviderName } from '@/types/domain';

export interface CreateCustomerInput {
  name: string;
  email: string;
  phone?: string | null;
  paymentProvider?: PaymentProviderName;
  automaticSuspension?: boolean;
}

export type CreateCustomerOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface CreateCustomerResult {
  outcome: CreateCustomerOutcome;
  message: string;
  customer?: CustomerRecord;
}

/**
 * createCustomer — spec sections 3 ("Manage customers"), 5 (immutable
 * sequential customer code), and 39 (POST /api/customers).
 *
 * Any authenticated ADMIN or SUPER_ADMIN may create a customer — unlike
 * createAdmin, this isn't privilege-sensitive, so there's no
 * canManageAdmins-style gate. The one behavior worth calling out: if the
 * creator is a plain (non-SUPER_ADMIN) admin, they're automatically
 * assigned to the customer they just created. Without that, a scoped
 * admin could create a customer and then immediately be unable to see
 * it via GET /api/admin/customers — which would be a confusing trap, not
 * a safety feature.
 */
export async function createCustomer(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  input: CreateCustomerInput
): Promise<CreateCustomerResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const name = input.name?.trim();
  const email = input.email?.toLowerCase().trim();
  if (!name) {
    return { outcome: 'INVALID_INPUT', message: 'name is required' };
  }
  if (!email || !email.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'A valid email is required' };
  }

  const existing = await deps.customers.findByEmail(email);
  if (existing) {
    return { outcome: 'ALREADY_EXISTS', message: 'A customer with this email already exists' };
  }

  const customer = await deps.customers.create({
    name,
    email,
    phone: input.phone ?? null,
    paymentProvider: input.paymentProvider ?? 'PAYSTACK',
    automaticSuspension: input.automaticSuspension ?? true,
  });

  if (requester.role !== 'SUPER_ADMIN') {
    await deps.adminAssignments.addAssignment(requestingAdminId, customer.id);
  }

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOMER_CREATED',
    target: customer.id,
    metadata: { email: customer.email, customerCode: customer.customerCode },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Customer created', customer };
}
