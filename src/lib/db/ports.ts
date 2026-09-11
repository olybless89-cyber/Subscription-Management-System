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
  DomainRecord,
  AuditLogRecord,
  WebsiteType,
  InvoiceRecord,
  InvoiceType,
  InvoiceStatus,
  CampaignRecord,
  CampaignChannel,
  CampaignStatus,
  CampaignRecipientRecord,
  CampaignRecipientStatus,
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
  /** Used by the public renewal page — given a customer, find which
   * subscription(s) they have so the page can show the right one. */
  findByCustomerId(customerId: string): Promise<SubscriptionRecord[]>;
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
  /** For admin dashboard listing — combined with listVisibleCustomerIds
   * at the route layer for scoping, same pattern as CustomerRepository. */
  listAll(): Promise<SubscriptionRecord[]>;
  /**
   * Edits a subscription's plan assignment or suspensionEnabled flag —
   * the two fields safe to change without going through a verified
   * engine. Deliberately does NOT accept `status`: status transitions
   * must go through suspendCustomer/restoreCustomer (which verify
   * against Railway before changing it) or the cron state machine —
   * never a raw field write that could desync the database from what's
   * actually running.
   */
  update(id: string, patch: { planId?: string; suspensionEnabled?: boolean }): Promise<void>;
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
  /** Used by the public renewal page — the URL is keyed by the
   * human-facing customerCode (WOH-000001), not the internal id. */
  findByCustomerCode(customerCode: string): Promise<CustomerRecord | null>;
  findByIds(ids: string[]): Promise<CustomerRecord[]>;
  listAll(): Promise<CustomerRecord[]>;
  updateStatus(id: string, status: CustomerStatus): Promise<void>;
  /** spec section 5: generates and assigns the next immutable customer
   * code (WOH-000001, ...) as part of creation — never a separate step
   * a caller could skip or race. */
  create(input: {
    name: string;
    email: string;
    notificationEmail?: string | null;
    phone?: string | null;
    dateOfBirth?: string | null;
    serviceStartDate?: string | null;
    serviceEndDate?: string | null;
    websiteType?: WebsiteType | null;
    paymentProvider: PaymentProviderName;
    automaticSuspension: boolean;
  }): Promise<CustomerRecord>;
  /** Admin edit of a customer's own fields — deliberately excludes
   * `status` and `customerCode`, same reasoning as
   * SubscriptionRepository.update(): status only ever changes through a
   * verified engine, and customerCode is immutable by spec section 5. */
  update(
    id: string,
    patch: {
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
  ): Promise<CustomerRecord>;
  /** All customers with a non-null dateOfBirth — for the daily birthday
   * cron. The worker itself matches month/day against `now`; this just
   * narrows to customers where there's anything to check. */
  findWithBirthday(): Promise<CustomerRecord[]>;
  /** Admin-triggered "forgot password" reset — sets a new password the
   * admin has chosen/typed for the customer. No email verification loop
   * here (no reset-link flow exists yet — see README); this is the
   * "customer calls/messages support, support resets it" pattern. */
  updatePassword(id: string, passwordHash: string): Promise<void>;
}

export interface AdminRepository {
  findById(id: string): Promise<AdminRecord | null>;
  findByEmail(email: string): Promise<AdminRecord | null>;
  /** Every SUPER_ADMIN — used to fan out admin notifications, since
   * super admins see every customer regardless of assignment. */
  listSuperAdmins(): Promise<AdminRecord[]>;
  /** For the admin-management UI listing. Gated at the route layer to
   * the same canManageOtherAdmins() check as createAdmin — listing every
   * admin's email/role is sensitive in the same way creating one is. */
  listAll(): Promise<AdminRecord[]>;
  create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: 'SUPER_ADMIN' | 'ADMIN';
    canManageAdmins: boolean;
  }): Promise<AdminRecord>;
  /** Updates password + passwordChangedAt together — used by both
   * self-service change and a SUPER_ADMIN's reset-on-behalf-of. Callers
   * (src/lib/admin/password.ts) are what distinguish "who did this and
   * were they allowed to" — this method just performs the write. */
  updatePassword(id: string, passwordHash: string): Promise<void>;
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

export interface DomainRepository {
  findById(id: string): Promise<DomainRecord | null>;
  findByCustomerId(customerId: string): Promise<DomainRecord[]>;
  /** domainName is globally unique (spec/schema) — not just unique per
   * customer. Used to catch a duplicate before hitting the DB
   * constraint, so createDomain can return a clean ALREADY_EXISTS
   * result instead of an unhandled Prisma error. */
  findByDomainName(domainName: string): Promise<DomainRecord | null>;
  listAll(): Promise<DomainRecord[]>;
  create(input: { customerId: string; domainName: string; isPrimary: boolean }): Promise<DomainRecord>;
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
  /** subjectOverride lets a caller (the custom-email composer) supply
   * its own subject instead of the automatic one derived from `event`
   * via subjectForEvent(). Omit it for every automated notification —
   * only the admin-composed custom-email path passes one.
   * attachments is for the invoice PDF specifically — omit it for
   * everything else. */
  send(
    customerId: string,
    event: string,
    message: string,
    subjectOverride?: string,
    attachments?: Array<{ filename: string; content: string }>
  ): Promise<void>;
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
  /** Most-recent-first, for the SUPER_ADMIN activity-log view. */
  listRecent(limit?: number): Promise<AuditLogRecord[]>;
}

export interface InvoiceRepository {
  create(input: {
    customerId: string;
    subscriptionId: string | null;
    type: InvoiceType;
    status: InvoiceStatus;
    amount: number;
    currency: string;
    description: string;
    dueDate: string | null;
    paidAt: string | null;
  }): Promise<InvoiceRecord>;
  findById(id: string): Promise<InvoiceRecord | null>;
  findByCustomerId(customerId: string): Promise<InvoiceRecord[]>;
  listAll(): Promise<InvoiceRecord[]>;
}

export interface CampaignRepository {
  create(input: {
    name: string;
    channels: CampaignChannel[];
    subject: string | null;
    message: string;
    createdBy: string;
  }): Promise<CampaignRecord>;
  findById(id: string): Promise<CampaignRecord | null>;
  listAll(): Promise<CampaignRecord[]>;
  listByCreator(createdBy: string): Promise<CampaignRecord[]>;
  updateStatus(id: string, status: CampaignStatus, extra?: { sentAt?: string }): Promise<void>;
  addRecipients(
    campaignId: string,
    recipients: Array<{ customerId: string; channel: CampaignChannel }>
  ): Promise<CampaignRecipientRecord[]>;
  findRecipientsByCampaignId(campaignId: string): Promise<CampaignRecipientRecord[]>;
  updateRecipientStatus(
    id: string,
    status: CampaignRecipientStatus,
    extra?: { sentAt?: string; error?: string | null }
  ): Promise<void>;
}

export interface EngineDeps {
  subscriptions: SubscriptionRepository;
  customers: CustomerRepository;
  railwayResources: RailwayResourceRepository;
  suspensionEvents: SuspensionEventRepository;
  notifications: NotificationSender;
  invoices: InvoiceRepository;
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
  domains: DomainRepository;
  auditLog: AuditLogRepository;
}

/** Dependencies for creating plans, subscriptions, and mapping
 * subscriptions to Railway infrastructure — three deliberately separate
 * business-logic functions sharing one dependency bag. Also covers
 * domain attachment, which follows the same "admin creates a resource
 * tied to a customer" shape. */
export interface BillingSetupDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
  plans: PlanRepository;
  subscriptions: SubscriptionRepository;
  railwayResources: RailwayResourceRepository;
  domains: DomainRepository;
  auditLog: AuditLogRepository;
}

/** Dependencies for the admin-composed custom-email feature and the
 * daily birthday cron — both just need to read customers and dispatch
 * through the same notification pipeline everything else uses. */
export interface CustomEmailDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
  notifications: NotificationSender;
  auditLog: AuditLogRepository;
}

/** WhatsApp equivalent of NotificationSender — deliberately simpler
 * (no subject/attachments, since every WhatsApp send routes through one
 * generic template with a single body parameter — see
 * src/lib/notifications/whatsapp.ts). Looks the customer up internally
 * and records a Notification row (channel WHATSAPP), same
 * record-first/best-effort-dispatch pattern as EmailNotificationSender.
 */
export interface WhatsAppSender {
  send(customerId: string, message: string): Promise<void>;
}

export interface CampaignDeps {
  admins: AdminRepository;
  customers: CustomerRepository;
  adminAssignments: AdminAssignmentRepository;
  campaigns: CampaignRepository;
  notifications: NotificationSender;
  whatsapp: WhatsAppSender;
  auditLog: AuditLogRepository;
}

/** Self-service customer registration — deliberately its own deps bag,
 * not AdminManagementDeps, since there's no acting admin here at all.
 * Needs adminAssignments/adminNotifications so the new registration can
 * still notify every SUPER_ADMIN (a self-registered customer starts
 * with NO admin assignment — notifyAdminsForCustomer's existing
 * "every SUPER_ADMIN regardless of assignment" behavior is exactly
 * right for this, no new fan-out logic needed). */
export interface RegisterCustomerDeps {
  customers: CustomerRepository;
  domains: DomainRepository;
  admins: AdminRepository;
  adminAssignments: AdminAssignmentRepository;
  adminNotifications: AdminNotificationRepository;
  notifications: NotificationSender;
  auditLog: AuditLogRepository;
}
