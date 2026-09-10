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
}

export interface PlanRepository {
  findById(id: string): Promise<PlanRecord | null>;
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
  updateStatus(id: string, status: CustomerStatus): Promise<void>;
}

export interface AdminRepository {
  findByEmail(email: string): Promise<AdminRecord | null>;
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
 * payment records (for verification + idempotency). */
export interface WebhookDeps extends EngineDeps {
  plans: PlanRepository;
  payments: PaymentRepository;
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
