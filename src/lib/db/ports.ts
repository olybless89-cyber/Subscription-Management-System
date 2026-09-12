import {
  CustomerRecord,
  RailwayResourceRecord,
  SubscriptionRecord,
  SuspensionEventInput,
  SubscriptionStatus,
  CustomerStatus,
  RailwayResourceStatus,
  PlanRecord,
  PaymentRecord,
  PaymentStatus,
  AdminRecord,
  AdminNotificationRecord,
  PaymentProviderName,
} from '@/types/domain';

/**
 * Narrow repository interfaces the engines depend on. A Prisma-backed
 * implementation (src/lib/db/prisma-repository.ts) satisfies these in
 * production; tests supply an in-memory fake. This is what lets the
 * suspension/restoration engines be unit-tested without a live Postgres
 * connection, per spec section 45.
 */

export interface SubscriptionRepository {
  findById(id: string): Promise<SubscriptionRecord | null>;
  updateStatus(
    id: string,
    status: SubscriptionStatus,
    extra?: { suspendedAt?: string | null }
  ): Promise<void>;
  /**
   * Extends the billing period after a verified successful payment and
   * moves the subscription back to ACTIVE. Only ever called by the
   * webhook handler after payment verification — never from anything
   * touching Railway directly.
   */
  extendPeriod(
    id: string,
    period: { currentPeriodStart: string; currentPeriodEnd: string; nextBillingDate: string }
  ): Promise<void>;
  /** spec section 22 — moves PAYMENT_DUE -> GRACE_PERIOD with a computed end date. */
  startGracePeriod(id: string, gracePeriodEnd: string): Promise<void>;
  /** Candidates for the cron subscription-checker: everything not already
   * in a terminal/suspended/trial state. The worker itself re-checks each
   * record's actual dates against `now` — this just narrows what's worth
   * loading, it is not the source of truth for "is this one due". */
  findBillingCheckCandidates(): Promise<SubscriptionRecord[]>;
  create(input: {
    customerId: string;
    planId: string;
    status: SubscriptionStatus;
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextBillingDate: string;
  }): Promise<SubscriptionRecord>;
  /** Sets/clears the per-subscription dry-run override. Pass null to go
   * back to inheriting the global SUSPENSION_DRY_RUN env var. */
  setDryRunOverride(id: string, override: boolean | null): Promise<void>;
}

export interface PlanRepository {
  findById(id: string): Promise<PlanRecord | null>;
  listAll(): Promise<PlanRecord[]>;
  create(input: {
    name: string;
    amount: number;
    currency: string;
    billingCycle: PlanRecord['billingCycle'];
    gracePeriodDays: number;
  }): Promise<PlanRecord>;
}

export interface PaymentRepository {
  findByReference(reference: string): Promise<PaymentRecord | null>;
  /** Creates a PENDING payment row up front (at checkout-initialization time)
   * so the webhook has something to reconcile against. Idempotent on
   * `reference` — callers should treat a unique-constraint violation as
   * "already exists", not an error. */
  createPending(input: {
    subscriptionId: string;
    reference: string;
    provider: string;
    amount: number;
    currency: string;
  }): Promise<PaymentRecord>;
  updateStatus(
    id: string,
    status: PaymentStatus,
    extra?: { rawPayload?: string; processedAt?: string }
  ): Promise<void>;
}

export interface CustomerRepository {
  findById(id: string): Promise<CustomerRecord | null>;
  findByEmail(email: string): Promise<CustomerRecord | null>;
  findByIds(ids: string[]): Promise<CustomerRecord[]>;
  listAll(): Promise<CustomerRecord[]>;
  updateStatus(id: string, status: CustomerStatus): Promise<void>;
  /** spec section 5: generates and assigns the next immutable customer
   * code (WOH-000001, ...) as part of creation — never a separate step
   * a caller could skip or race. */
  create(input: {
    name: string;
    email: string;
    phone?: string | null;
    paymentProvider: PaymentProviderName;
    automaticSuspension: boolean;
  }): Promise<CustomerRecord>;
}

export interface AdminRepository {
  findById(id: string): Promise<AdminRecord | null>;
  findByEmail(email: string): Promise<AdminRecord | null>;
  /** Every SUPER_ADMIN — used to fan out admin notifications, since
   * super admins see every customer regardless of assignment. */
  listSuperAdmins(): Promise<AdminRecord[]>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: 'SUPER_ADMIN' | 'ADMIN';
    canManageAdmins: boolean;
  }): Promise<AdminRecord>;
}

/** spec extension: which customers a given (non-super) admin is scoped
 * to see. SUPER_ADMIN bypasses this table entirely — see
 * canAdminAccessCustomer() in lib/auth/authorize.ts. */
export interface AdminAssignmentRepository {
  listCustomerIdsForAdmin(adminId: string): Promise<string[]>;
  listAdminIdsForCustomer(customerId: string): Promise<string[]>;
  isAssigned(adminId: string, customerId: string): Promise<boolean>;
  /** Replaces the admin's entire assigned-customer set with exactly this
   * list — simpler and less error-prone for callers than incremental
   * add/remove, and matches how an admin-management UI would naturally
   * submit "here's who this admin can see now". */
  setAssignments(adminId: string, customerIds: string[]): Promise<void>;
  /** Adds one customer to an admin's existing set without disturbing the
   * rest — used to auto-assign a scoped admin to a customer they just
   * created, so they aren't immediately unable to see their own work. */
  addAssignment(adminId: string, customerId: string): Promise<void>;
}

export interface AdminNotificationRepository {
  create(input: {
    adminId: string;
    customerId: string;
    event: string;
    message: string;
  }): Promise<void>;
  /** Most-recent-first, for an admin's own notification feed. */
  listForAdmin(adminId: string, limit?: number): Promise<AdminNotificationRecord[]>;
}

export interface RailwayResourceRepository {
  findBySubscriptionId(subscriptionId: string): Promise<RailwayResourceRecord[]>;
  /** All resources, for the periodic Railway sync worker (spec section 13). */
  findAll(): Promise<RailwayResourceRecord[]>;
  updateStatus(
    id: string,
    status: RailwayResourceStatus,
    extra?: { deploymentId?: string | null; lastError?: string | null }
  ): Promise<void>;
  /** Maps a subscription to real Railway infrastructure — spec section
   * 12. Deliberately a separate step from subscription creation (spec
   * sections 8-9): a subscription can exist before infrastructure is
   * provisioned, and conflating the two would make one route respond
   * for both concerns. */
  create(input: {
    subscriptionId: string;
    projectId: string;
    environmentId: string;
    serviceId: string;
    deploymentId?: string | null;
    hostingMode: RailwayResourceRecord['hostingMode'];
    suspensionStrategy: RailwayResourceRecord['suspensionStrategy'];
  }): Promise<RailwayResourceRecord>;
}

export interface SuspensionEventRepository {
  create(event: SuspensionEventInput): Promise<void>;
}

export interface NotificationSender {
  send(customerId: string, event: string, message: string): Promise<void>;
}

export interface AuditLogEntry {
  actor: string; // AdminUser id or "SYSTEM"
  action: string;
  target?: string;
  ip?: string;
  metadata?: Record<string, unknown>;
  result: 'SUCCESS' | 'FAILED';
}

export interface AuditLogRepository {
  create(entry: AuditLogEntry): Promise<void>;
}

export interface EngineDeps {
  subscriptions: SubscriptionRepository;
  customers: CustomerRepository;
  railwayResources: RailwayResourceRepository;
  suspensionEvents: SuspensionEventRepository;
  notifications: NotificationSender;
}

/** Superset of EngineDeps used by the payment webhook handler, which also
 * needs to read plans (to compute the next billing period) and read/write
 * payment records (for verification + idempotency), plus everything
 * needed to route the payment notification to the right admin(s). */
export interface WebhookDeps extends EngineDeps {
  plans: PlanRepository;
  payments: PaymentRepository;
  admins: AdminRepository;
  adminAssignments: AdminAssignmentRepository;
  adminNotifications: AdminNotificationRepository;
}

/** Dependencies for authenticating admins and customers. Kept separate
 * from EngineDeps/WebhookDeps since login has nothing to do with billing
 * or suspension — most callers only need this small slice. */
export interface AuthDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
}

/** Dependencies for the cron subscription-checker (spec sections 21-22). */
export interface CronDeps extends WebhookDeps {}

/** Dependencies for admin-management operations: creating admins and
 * assigning them customers. SUPER_ADMIN-gated at the call site, not here
 * — these ports don't know about authorization, callers do. */
export interface AdminManagementDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
  adminAssignments: AdminAssignmentRepository;
  auditLog: AuditLogRepository;
}

/** Dependencies for creating plans, subscriptions, and mapping
 * subscriptions to Railway infrastructure — three deliberately separate
 * business-logic functions sharing one dependency bag. */
export interface BillingSetupDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
  plans: PlanRepository;
  subscriptions: SubscriptionRepository;
  railwayResources: RailwayResourceRepository;
  auditLog: AuditLogRepository;
}
