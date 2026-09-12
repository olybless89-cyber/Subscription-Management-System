import { AdminManagementDeps, RegisterCustomerDeps } from '../db/ports';
import { CustomerRecord, PaymentProviderName, WebsiteType } from '@/types/domain';
import { hashPassword } from '../auth/password';
import { notifyAdminsForCustomer } from '../notifications/admin-notify';

const VALID_WEBSITE_TYPES: readonly WebsiteType[] = [
  'ONLINE_BANKING',
  'INVESTMENT',
  'ECOMMERCE',
  'DELIVERY',
  'SAAS',
  'WEB_APP',
  'CORPORATE',
  'OTHER',
];

function validateWebsiteType(value: WebsiteType | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  if (!VALID_WEBSITE_TYPES.includes(value)) {
    return `websiteType must be one of: ${VALID_WEBSITE_TYPES.join(', ')}`;
  }
  return null;
}

export interface CreateCustomerInput {
  name: string;
  email: string;
  notificationEmail?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  websiteType?: WebsiteType | null;
  /** Captured at onboarding, per an explicit request — the domain the
   * super admin will later use to configure this customer on Railway.
   * Composed here as a best-effort second step after the customer is
   * created (see domainOutcome below), rather than folded into the
   * Customer row itself: domains stay in their own table (Domain model)
   * with the global-uniqueness guarantee `createDomain`-equivalent logic
   * already enforces elsewhere, so onboarding doesn't get a second,
   * inconsistent path for the same data. */
  domainName?: string | null;
  paymentProvider?: PaymentProviderName;
  automaticSuspension?: boolean;
}

export type CreateCustomerOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface CreateCustomerResult {
  outcome: CreateCustomerOutcome;
  message: string;
  customer?: CustomerRecord;
  /** domainName is now required at creation (see validation below), so
   * this is always present on a CREATED result. The customer is still
   * CREATED even if the domain attachment failed (e.g. already claimed
   * by a different customer) — a failed domain attach must never undo a
   * successful customer creation, it's just reported back so the admin
   * knows to sort it out via the Domains page. */
  domainOutcome?: 'ATTACHED' | 'ALREADY_EXISTS' | 'FAILED';
  domainMessage?: string;
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

  // Both required at onboarding, per an explicit policy decision — the
  // notification email is where every automated message (payment due,
  // suspension, birthday, custom composer) actually goes, and the
  // domain is what the super admin needs on hand to configure Railway
  // resources afterward. Neither is optional here, even though the
  // underlying database columns stay nullable (existing customers
  // created before this policy, or ones edited later, aren't forced to
  // backfill retroactively — this validation only applies going forward,
  // at creation).
  const notificationEmail = input.notificationEmail?.trim().toLowerCase();
  if (!notificationEmail || !notificationEmail.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'A valid notificationEmail is required' };
  }
  const domainNameRequired = input.domainName?.trim().toLowerCase();
  if (!domainNameRequired) {
    return { outcome: 'INVALID_INPUT', message: 'domainName is required' };
  }

  const websiteTypeError = validateWebsiteType(input.websiteType);
  if (websiteTypeError) return { outcome: 'INVALID_INPUT', message: websiteTypeError };

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
    notificationEmail,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth || null,
    serviceStartDate: input.serviceStartDate || null,
    serviceEndDate: input.serviceEndDate || null,
    websiteType: input.websiteType ?? null,
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

  const result: CreateCustomerResult = { outcome: 'CREATED', message: 'Customer created', customer };

  const domainName = domainNameRequired;
  const existingDomain = await deps.domains.findByDomainName(domainName);
  if (existingDomain) {
    result.domainOutcome = 'ALREADY_EXISTS';
    result.domainMessage = 'This domain is already attached to a different customer — attach it manually from the Domains page once resolved.';
  } else {
    await deps.domains.create({ customerId: customer.id, domainName, isPrimary: true });
    await deps.auditLog.create({
      actor: requestingAdminId,
      action: 'CUSTOMER_ONBOARDING_DOMAIN_ATTACHED',
      target: customer.id,
      metadata: { domainName },
      result: 'SUCCESS',
    });
    result.domainOutcome = 'ATTACHED';
    result.domainMessage = `${domainName} attached`;
  }

  return result;
}

// ---------- updateCustomer ----------

export interface UpdateCustomerInput {
  name?: string;
  notificationEmail?: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  serviceStartDate?: string | null;
  serviceEndDate?: string | null;
  websiteType?: WebsiteType | null;
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

  const websiteTypeError = validateWebsiteType(patch.websiteType);
  if (websiteTypeError) return { outcome: 'INVALID_INPUT', message: websiteTypeError };

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

// ---------- registerCustomer (self-service, public signup) ----------

export interface RegisterCustomerInput {
  name: string;
  email: string;
  password: string;
  phone?: string | null;
  dateOfBirth?: string | null;
  websiteType?: WebsiteType | null;
  domainName: string;
  paymentProvider?: PaymentProviderName;
}

export type RegisterCustomerOutcome = 'REGISTERED' | 'INVALID_INPUT' | 'ALREADY_EXISTS';

export interface RegisterCustomerResult {
  outcome: RegisterCustomerOutcome;
  message: string;
  customer?: CustomerRecord;
  domainOutcome?: 'ATTACHED' | 'ALREADY_EXISTS';
  domainMessage?: string;
}

const MIN_REGISTRATION_PASSWORD_LENGTH = 12;

/**
 * registerCustomer — public, self-service signup (spec: "customer can
 * visit and register and create account... by themselves"). No acting
 * admin at all, which is what makes this genuinely different from
 * createCustomer rather than a thin wrapper around it:
 *
 * - The customer sets their OWN password here, at signup — this is
 *   what actually answers "how does a customer get login credentials"
 *   for anyone who registers this way (createCustomer, by contrast,
 *   never sets one; that's why the reset-password tooling exists for
 *   customers an admin created directly).
 * - notificationEmail is NOT a separate field in the public form —
 *   just the one email they signed up with. Asking a new signup for
 *   two email addresses is unusual friction for a public form; an
 *   admin can still set a separate one later via the dashboard.
 * - No admin assignment happens here — a self-registered customer is
 *   visible only to SUPER_ADMIN until a super admin deliberately
 *   assigns them to a specific plain admin (matches "the admin sees
 *   it, the super admin adds it to Railway infrastructure" exactly:
 *   nothing here silently hands a new signup to a random admin).
 * - domainName stays REQUIRED, same policy as admin-created customers
 *   — the super admin needs it to actually do that Railway step.
 * - serviceStartDate defaults to today — the one date field that's
 *   unambiguous at signup (unlike admin-created customers, who might
 *   backdate/forward-date it for a specific business reason).
 */
export async function registerCustomer(
  deps: RegisterCustomerDeps,
  input: RegisterCustomerInput
): Promise<RegisterCustomerResult> {
  const name = input.name?.trim();
  const email = input.email?.toLowerCase().trim();
  if (!name) {
    return { outcome: 'INVALID_INPUT', message: 'name is required' };
  }
  if (!email || !email.includes('@')) {
    return { outcome: 'INVALID_INPUT', message: 'A valid email is required' };
  }
  if (!input.password || input.password.length < MIN_REGISTRATION_PASSWORD_LENGTH) {
    return { outcome: 'INVALID_INPUT', message: `Password must be at least ${MIN_REGISTRATION_PASSWORD_LENGTH} characters` };
  }

  const domainName = input.domainName?.trim().toLowerCase();
  if (!domainName) {
    return { outcome: 'INVALID_INPUT', message: 'domainName is required' };
  }

  const websiteTypeError = validateWebsiteType(input.websiteType);
  if (websiteTypeError) return { outcome: 'INVALID_INPUT', message: websiteTypeError };

  const dobError = validateOptionalDate(input.dateOfBirth, 'dateOfBirth');
  if (dobError) return { outcome: 'INVALID_INPUT', message: dobError };

  const existing = await deps.customers.findByEmail(email);
  if (existing) {
    return { outcome: 'ALREADY_EXISTS', message: 'An account with this email already exists' };
  }

  const passwordHash = await hashPassword(input.password);
  const today = new Date().toISOString();

  const created = await deps.customers.create({
    name,
    email,
    notificationEmail: email,
    phone: input.phone ?? null,
    dateOfBirth: input.dateOfBirth || null,
    serviceStartDate: today,
    serviceEndDate: null,
    websiteType: input.websiteType ?? null,
    paymentProvider: input.paymentProvider ?? 'PAYSTACK',
    automaticSuspension: true,
  });
  await deps.customers.updatePassword(created.id, passwordHash);
  const customer = { ...created, passwordHash };

  await deps.auditLog.create({
    actor: 'SYSTEM',
    action: 'CUSTOMER_SELF_REGISTERED',
    target: customer.id,
    metadata: { email: customer.email, customerCode: customer.customerCode },
    result: 'SUCCESS',
  });

  const result: RegisterCustomerResult = { outcome: 'REGISTERED', message: 'Account created', customer };

  const existingDomain = await deps.domains.findByDomainName(domainName);
  if (existingDomain) {
    result.domainOutcome = 'ALREADY_EXISTS';
    result.domainMessage =
      'This domain is already attached to a different customer — our team will follow up to resolve it.';
  } else {
    await deps.domains.create({ customerId: customer.id, domainName, isPrimary: true });
    result.domainOutcome = 'ATTACHED';
    result.domainMessage = `${domainName} attached`;
  }

  // Best-effort: welcome the customer, and tell whichever admin(s) need
  // to know (every SUPER_ADMIN, per notifyAdminsForCustomer's existing
  // behavior — exactly right for an unassigned new signup). Neither can
  // be allowed to undo the registration that already succeeded above.
  try {
    await deps.notifications.send(
      customer.id,
      'WELCOME',
      `Welcome to Web Oracle Host, ${customer.name}! Your account (${customer.customerCode}) has been created. Our team will be in touch to finish setting up your hosting.`
    );
  } catch {
    // Deliberately swallowed — see comment above.
  }
  try {
    await notifyAdminsForCustomer(
      deps,
      customer.id,
      'CUSTOMER_REGISTERED',
      `${customer.customerCode} (${customer.name}) just self-registered — assign to an admin and configure Railway resources.`
    );
  } catch {
    // Deliberately swallowed — see comment above.
  }

  return result;
}
