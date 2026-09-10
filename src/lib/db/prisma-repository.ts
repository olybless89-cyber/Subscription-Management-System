import { PrismaClient } from '@prisma/client';
import {
  SubscriptionRepository,
  CustomerRepository,
  RailwayResourceRepository,
  SuspensionEventRepository,
  NotificationSender,
  PlanRepository,
  PaymentRepository,
} from './ports';
import {
  SubscriptionRecord,
  CustomerRecord,
  RailwayResourceRecord,
  PlanRecord,
  PaymentRecord,
} from '@/types/domain';

/**
 * Real Prisma-backed implementations of every port the engines/webhook
 * handler depend on. These are intentionally thin — all business logic
 * (safety checks, state transitions, verification-before-reporting-success)
 * lives in the engines, not here. This file's only job is mapping between
 * Prisma's shapes (Date objects, relations) and the plain-string domain
 * types the engines use.
 *
 * Construct once per request/worker invocation:
 *
 *   const prisma = new PrismaClient();
 *   const deps: WebhookDeps = {
 *     subscriptions: new PrismaSubscriptionRepository(prisma),
 *     customers: new PrismaCustomerRepository(prisma),
 *     railwayResources: new PrismaRailwayResourceRepository(prisma),
 *     suspensionEvents: new PrismaSuspensionEventRepository(prisma),
 *     notifications: new EmailNotificationSender(), // see notifications/
 *     plans: new PrismaPlanRepository(prisma),
 *     payments: new PrismaPaymentRepository(prisma),
 *   };
 */

export class PrismaSubscriptionRepository implements SubscriptionRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<SubscriptionRecord | null> {
    const s = await this.prisma.subscription.findUnique({ where: { id } });
    if (!s) return null;
    return {
      id: s.id,
      customerId: s.customerId,
      planId: s.planId,
      status: s.status,
      suspensionEnabled: s.suspensionEnabled,
      suspendedAt: s.suspendedAt ? s.suspendedAt.toISOString() : null,
      currentPeriodStart: s.currentPeriodStart.toISOString(),
      currentPeriodEnd: s.currentPeriodEnd.toISOString(),
      nextBillingDate: s.nextBillingDate.toISOString(),
      gracePeriodEnd: s.gracePeriodEnd ? s.gracePeriodEnd.toISOString() : null,
    };
  }

  async updateStatus(
    id: string,
    status: SubscriptionRecord['status'],
    extra?: { suspendedAt?: string | null }
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: {
        status,
        ...(extra?.suspendedAt !== undefined
          ? { suspendedAt: extra.suspendedAt ? new Date(extra.suspendedAt) : null }
          : {}),
      },
    });
  }

  async extendPeriod(
    id: string,
    period: { currentPeriodStart: string; currentPeriodEnd: string; nextBillingDate: string }
  ): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: {
        currentPeriodStart: new Date(period.currentPeriodStart),
        currentPeriodEnd: new Date(period.currentPeriodEnd),
        nextBillingDate: new Date(period.nextBillingDate),
        gracePeriodEnd: null,
      },
    });
  }

  async startGracePeriod(id: string, gracePeriodEnd: string): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: { status: 'GRACE_PERIOD', gracePeriodEnd: new Date(gracePeriodEnd) },
    });
  }

  async findBillingCheckCandidates(): Promise<SubscriptionRecord[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { status: { in: ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'] } },
    });
    return rows.map((s: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: s.id,
      customerId: s.customerId,
      planId: s.planId,
      status: s.status,
      suspensionEnabled: s.suspensionEnabled,
      suspendedAt: s.suspendedAt ? s.suspendedAt.toISOString() : null,
      currentPeriodStart: s.currentPeriodStart.toISOString(),
      currentPeriodEnd: s.currentPeriodEnd.toISOString(),
      nextBillingDate: s.nextBillingDate.toISOString(),
      gracePeriodEnd: s.gracePeriodEnd ? s.gracePeriodEnd.toISOString() : null,
    }));
  }
}

export class PrismaCustomerRepository implements CustomerRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<CustomerRecord | null> {
    const c = await this.prisma.customer.findUnique({ where: { id } });
    if (!c) return null;
    return {
      id: c.id,
      customerCode: c.customerCode,
      email: c.email,
      passwordHash: c.passwordHash,
      status: c.status,
      automaticSuspension: c.automaticSuspension,
    };
  }

  async findByEmail(email: string): Promise<CustomerRecord | null> {
    const c = await this.prisma.customer.findUnique({ where: { email } });
    if (!c) return null;
    return {
      id: c.id,
      customerCode: c.customerCode,
      email: c.email,
      passwordHash: c.passwordHash,
      status: c.status,
      automaticSuspension: c.automaticSuspension,
    };
  }

  async updateStatus(id: string, status: CustomerRecord['status']): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { status } });
  }
}

export class PrismaAdminRepository {
  constructor(private prisma: PrismaClient) {}

  async findByEmail(email: string) {
    const a = await this.prisma.adminUser.findUnique({ where: { email } });
    if (!a) return null;
    return {
      id: a.id,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role,
      canManageAdmins: a.canManageAdmins,
    };
  }
}

export class PrismaRailwayResourceRepository implements RailwayResourceRepository {
  constructor(private prisma: PrismaClient) {}

  async findBySubscriptionId(subscriptionId: string): Promise<RailwayResourceRecord[]> {
    const rows = await this.prisma.railwayResource.findMany({ where: { subscriptionId } });
    return rows.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: r.id,
      subscriptionId: r.subscriptionId,
      projectId: r.projectId,
      environmentId: r.environmentId,
      serviceId: r.serviceId,
      deploymentId: r.deploymentId,
      hostingMode: r.hostingMode,
      suspensionStrategy: r.suspensionStrategy,
      status: r.status,
    }));
  }

  async findAll(): Promise<RailwayResourceRecord[]> {
    const rows = await this.prisma.railwayResource.findMany();
    return rows.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: r.id,
      subscriptionId: r.subscriptionId,
      projectId: r.projectId,
      environmentId: r.environmentId,
      serviceId: r.serviceId,
      deploymentId: r.deploymentId,
      hostingMode: r.hostingMode,
      suspensionStrategy: r.suspensionStrategy,
      status: r.status,
    }));
  }

  async updateStatus(
    id: string,
    status: RailwayResourceRecord['status'],
    extra?: { deploymentId?: string | null; lastError?: string | null }
  ): Promise<void> {
    await this.prisma.railwayResource.update({
      where: { id },
      data: {
        status,
        lastSyncedAt: new Date(),
        ...(extra?.deploymentId !== undefined ? { deploymentId: extra.deploymentId } : {}),
        ...(extra?.lastError !== undefined ? { lastError: extra.lastError } : {}),
      },
    });
  }
}

export class PrismaSuspensionEventRepository implements SuspensionEventRepository {
  constructor(private prisma: PrismaClient) {}

  async create(event: {
    subscriptionId: string;
    action: string;
    reason: string;
    strategy: string;
    result: string;
    errorMessage?: string;
    performedBy?: string | null;
    dryRun: boolean;
  }): Promise<void> {
    // action/strategy/result are cast to the generated Prisma enum types
    // (unavailable in this sandbox — see README) since our domain types
    // use the same string literals as the Prisma schema enums by design.
    await this.prisma.suspensionEvent.create({
      data: {
        subscriptionId: event.subscriptionId,
        action: event.action as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        reason: event.reason,
        strategy: event.strategy as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        result: event.result as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        errorMessage: event.errorMessage,
        performedBy: event.performedBy ?? null,
        dryRun: event.dryRun,
      },
    });
  }
}

export class PrismaPlanRepository implements PlanRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<PlanRecord | null> {
    const p = await this.prisma.plan.findUnique({ where: { id } });
    if (!p) return null;
    return {
      id: p.id,
      amount: p.amount,
      currency: p.currency,
      billingCycle: p.billingCycle,
      gracePeriodDays: p.gracePeriodDays,
    };
  }
}

export class PrismaPaymentRepository implements PaymentRepository {
  constructor(private prisma: PrismaClient) {}

  async findByReference(reference: string): Promise<PaymentRecord | null> {
    const p = await this.prisma.payment.findUnique({ where: { reference } });
    if (!p) return null;
    return {
      id: p.id,
      subscriptionId: p.subscriptionId,
      reference: p.reference,
      provider: p.provider,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
    };
  }

  async createPending(input: {
    subscriptionId: string;
    reference: string;
    provider: string;
    amount: number;
    currency: string;
  }): Promise<PaymentRecord> {
    // `reference` is @unique in the schema — a second createPending call
    // with the same reference throws a P2002 constraint error rather than
    // silently duplicating a payment row. Callers should catch that and
    // treat it as "already initialized", not a hard failure.
    const p = await this.prisma.payment.create({
      data: {
        subscriptionId: input.subscriptionId,
        reference: input.reference,
        provider: input.provider,
        amount: input.amount,
        currency: input.currency,
        status: 'PENDING',
      },
    });
    return {
      id: p.id,
      subscriptionId: p.subscriptionId,
      reference: p.reference,
      provider: p.provider,
      amount: p.amount,
      currency: p.currency,
      status: p.status,
    };
  }

  async updateStatus(
    id: string,
    status: PaymentRecord['status'],
    extra?: { rawPayload?: string; processedAt?: string }
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id },
      data: {
        status,
        ...(extra?.rawPayload !== undefined ? { rawPayload: extra.rawPayload } : {}),
        ...(extra?.processedAt !== undefined ? { processedAt: new Date(extra.processedAt) } : {}),
      },
    });
  }
}

export class EmailNotificationSender implements NotificationSender {
  constructor(private prisma: PrismaClient) {}

  async send(customerId: string, event: string, message: string): Promise<void> {
    // Records the notification; actual email/WhatsApp/SMS dispatch is a
    // separate adapter (lib/notifications/*) not yet built — this keeps
    // the in-app/audit trail correct even before that's wired up.
    await this.prisma.notification.create({
      data: { customerId, channel: 'EMAIL', event, message },
    });
  }
}

export class PrismaAuditLogRepository {
  constructor(private prisma: PrismaClient) {}

  async create(entry: {
    actor: string;
    action: string;
    target?: string;
    ip?: string;
    metadata?: Record<string, unknown>;
    result: 'SUCCESS' | 'FAILED';
  }): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        ip: entry.ip,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : undefined,
        result: entry.result,
      },
    });
  }
}
