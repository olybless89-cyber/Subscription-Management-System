import { AdminManagementDeps } from '../db/ports';
import { CustomerRecord, PaymentProviderName } from '@/types/domain';

export interface CreateCustomerInput {
  name: string;
  email: string;
  notificationEmail?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  paymentProvider?: PaymentProviderName;
  automaticSuspension?: boolean;
}

export type CreateCustomerOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface CreateCustomerResult {
  outcome: CreateCustomerOutcome;
  message: string;
  customer?: CustomerRecord;
}

/** Shared by createCustomer and updateCustomer — a date field is either
 * absent/null (fine) or must parse as a real date (spec: birthday and
 * service dates are informational fields an admin types in, so a typo
 * like "2026-13-40" needs to be caught here rather than silently stored
 * as an Invalid Date). */
function validateOptionalDate(value: string | null | undefined, fieldName: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (Number.isNaN(new Date(value).getTime())) {
    return `${fieldName} is not a valid date`;
  }
  return null;
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
  if (input.notificationEmail && !input.notificationEmail.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'notificationEmail is not a valid email' };
  }

  for (const [value, fieldName] of [
    [input.dateOfBirth, 'dateOfBirth'],
    [input.serviceStartDate, 'serviceStartDate'],
    [input.serviceEndDate, 'serviceEndDate'],
  ] as const) {
    const error = validateOptionalDate(value, fieldName);
    if (error) return { outcome: 'INVALID_INPUT', message: error };
  }
  if (
    input.serviceStartDate &&
    input.serviceEndDate &&
    new Date(input.serviceEndDate).getTime() < new Date(input.serviceStartDate).getTime()
  ) {
    return { outcome: 'INVALID_INPUT', message: 'serviceEndDate cannot be before serviceStartDate' };
  }

  const existing = await deps.customers.findByEmail(email);
  if (existing) {
    return { outcome: 'ALREADY_EXISTS', message: 'A customer with this email already exists' };
  }

  const customer = await deps.customers.create({
    name,
    email,
    notificationEmail: input.notificationEmail?.toLowerCase().trim() || null,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth || null,
    serviceStartDate: input.serviceStartDate || null,
    serviceEndDate: input.serviceEndDate || null,
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

// ---------- updateCustomer ----------

export interface UpdateCustomerInput {
  name?: string;
  notificationEmail?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  paymentProvider?: PaymentProviderName;
  automaticSuspension?: boolean;
}

export type UpdateCustomerOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND' | 'INVALID_INPUT' | 'NO_CHANGES';

export interface UpdateCustomerResult {
  outcome: UpdateCustomerOutcome;
  message: string;
  customer?: CustomerRecord;
}

/**
 * updateCustomer — same shape as updateSubscription: a deliberately
 * narrow set of editable fields. `status` is not here on purpose —
 * status only ever changes through suspendCustomer/restoreCustomer.
 * `email` (the login address) and `customerCode` are also excluded —
 * changing a login credential or the immutable sequential code isn't
 * what this route is for.
 */
export async function updateCustomer(
  deps: AdminManagementDeps,
  requestingAdminId: string,
  customerId: string,
  patch: UpdateCustomerInput
): Promise<UpdateCustomerResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }

  const customer = await deps.customers.findById(customerId);
  if (!customer) {
    return { outcome: 'NOT_FOUND', message: 'Customer not found' };
  }

  const hasAnyChange = Object.values(patch).some((v) => v !== undefined);
  if (!hasAnyChange) {
    return { outcome: 'NO_CHANGES', message: 'Nothing to update' };
  }

  if (patch.notificationEmail && !patch.notificationEmail.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'notificationEmail is not a valid email' };
  }

  for (const [value, fieldName] of [
    [patch.dateOfBirth, 'dateOfBirth'],
    [patch.serviceStartDate, 'serviceStartDate'],
    [patch.serviceEndDate, 'serviceEndDate'],
  ] as const) {
    const error = validateOptionalDate(value, fieldName);
    if (error) return { outcome: 'INVALID_INPUT', message: error };
  }

  const updated = await deps.customers.update(customerId, patch);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'CUSTOMER_UPDATED',
    target: customerId,
    metadata: { fields: Object.keys(patch).filter((k) => (patch as Record<string, unknown>)[k] !== undefined) },
    result: 'SUCCESS',
  });

  return { outcome: 'UPDATED', message: 'Customer updated', customer: updated };
}
