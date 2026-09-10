import { PrismaClient } from '@prisma/client';
import {
  SubscriptionRepository,
  CustomerRepository,
  RailwayResourceRepository,
  SuspensionEventRepository,
  NotificationSender,
  PlanRepository,
  PaymentRepository,
  AdminRepository,
  AdminAssignmentRepository,
  AdminNotificationRepository,
  DomainRepository,
} from './ports';
import {
  SubscriptionRecord,
  CustomerRecord,
  RailwayResourceRecord,
  PlanRecord,
  PaymentRecord,
  DomainRecord,
} from '@/types/domain';
import { sendEmail, subjectForEvent } from '../notifications/email';

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
      dryRunOverride: s.dryRunOverride,
    };
  }

  async setDryRunOverride(id: string, override: boolean | null): Promise<void> {
    await this.prisma.subscription.update({ where: { id }, data: { dryRunOverride: override } });
  }

  async listAll(): Promise<SubscriptionRecord[]> {
    const rows = await this.prisma.subscription.findMany({ orderBy: { createdAt: 'desc' } });
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
      dryRunOverride: s.dryRunOverride,
    }));
  }

  async update(id: string, patch: { planId?: string; suspensionEnabled?: boolean }): Promise<void> {
    await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(patch.planId !== undefined ? { planId: patch.planId } : {}),
        ...(patch.suspensionEnabled !== undefined ? { suspensionEnabled: patch.suspensionEnabled } : {}),
      },
    });
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

  async create(input: {
    customerId: string;
    planId: string;
    status: SubscriptionRecord['status'];
    currentPeriodStart: string;
    currentPeriodEnd: string;
    nextBillingDate: string;
  }): Promise<SubscriptionRecord> {
    const s = await this.prisma.subscription.create({
      data: {
        customerId: input.customerId,
        planId: input.planId,
        status: input.status as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        currentPeriodStart: new Date(input.currentPeriodStart),
        currentPeriodEnd: new Date(input.currentPeriodEnd),
        nextBillingDate: new Date(input.nextBillingDate),
      },
    });
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
      dryRunOverride: s.dryRunOverride,
    };
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
      dryRunOverride: s.dryRunOverride,
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
      paymentProvider: c.paymentProvider,
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
      paymentProvider: c.paymentProvider,
    };
  }

  async findByIds(ids: string[]): Promise<CustomerRecord[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.customer.findMany({ where: { id: { in: ids } } });
    return rows.map((c: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: c.id,
      customerCode: c.customerCode,
      email: c.email,
      passwordHash: c.passwordHash,
      status: c.status,
      automaticSuspension: c.automaticSuspension,
      paymentProvider: c.paymentProvider,
    }));
  }

  async listAll(): Promise<CustomerRecord[]> {
    const rows = await this.prisma.customer.findMany();
    return rows.map((c: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: c.id,
      customerCode: c.customerCode,
      email: c.email,
      passwordHash: c.passwordHash,
      status: c.status,
      automaticSuspension: c.automaticSuspension,
      paymentProvider: c.paymentProvider,
    }));
  }

  async updateStatus(id: string, status: CustomerRecord['status']): Promise<void> {
    await this.prisma.customer.update({ where: { id }, data: { status } });
  }

  async create(input: {
    name: string;
    email: string;
    phone?: string | null;
    paymentProvider: CustomerRecord['paymentProvider'];
    automaticSuspension: boolean;
  }): Promise<CustomerRecord> {
    const customerCode = await this.nextCustomerCode();
    const c = await this.prisma.customer.create({
      data: {
        customerCode,
        name: input.name,
        email: input.email,
        phone: input.phone ?? undefined,
        paymentProvider: input.paymentProvider as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        automaticSuspension: input.automaticSuspension,
      },
    });
    return {
      id: c.id,
      customerCode: c.customerCode,
      email: c.email,
      passwordHash: c.passwordHash,
      status: c.status,
      automaticSuspension: c.automaticSuspension,
      paymentProvider: c.paymentProvider,
    };
  }

  /** spec section 5: WOH-000001, WOH-000002, ... — atomic increment on a
   * singleton counter row, never derived from COUNT(*) so the sequence
   * survives permanent-deletion (spec section 44) without ever reusing a
   * code. The increment itself (`value: { increment: 1 }`) compiles to a
   * single atomic UPDATE in Postgres; the very first-ever call (creating
   * the counter row) has a theoretical, extremely low-odds race if two
   * customers are created in the same instant before the row exists —
   * acceptable for this volume, but noted rather than hidden. */
  private async nextCustomerCode(): Promise<string> {
    const row = await this.prisma.customerCodeCounter.upsert({
      where: { id: 1 },
      create: { id: 1, value: 1 },
      update: { value: { increment: 1 } },
    });
    return `WOH-${String(row.value).padStart(6, '0')}`;
  }
}

export class PrismaAdminRepository implements AdminRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string) {
    const a = await this.prisma.adminUser.findUnique({ where: { id } });
    if (!a) return null;
    return {
      id: a.id,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role,
      canManageAdmins: a.canManageAdmins,
    };
  }

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

  async listSuperAdmins() {
    const rows = await this.prisma.adminUser.findMany({ where: { role: 'SUPER_ADMIN' } });
    return rows.map((a: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: a.id,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role,
      canManageAdmins: a.canManageAdmins,
    }));
  }

  async create(input: {
    name: string;
    email: string;
    passwordHash: string;
    role: 'SUPER_ADMIN' | 'ADMIN';
    canManageAdmins: boolean;
  }) {
    const a = await this.prisma.adminUser.create({
      data: {
        name: input.name,
        email: input.email,
        passwordHash: input.passwordHash,
        role: input.role as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        canManageAdmins: input.canManageAdmins,
      },
    });
    return {
      id: a.id,
      email: a.email,
      passwordHash: a.passwordHash,
      role: a.role,
      canManageAdmins: a.canManageAdmins,
    };
  }
}

export class PrismaAdminAssignmentRepository implements AdminAssignmentRepository {
  constructor(private prisma: PrismaClient) {}

  async listCustomerIdsForAdmin(adminId: string): Promise<string[]> {
    const rows = await this.prisma.adminCustomerAssignment.findMany({
      where: { adminId },
      select: { customerId: true },
    });
    return rows.map((r: any) => r.customerId); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  async listAdminIdsForCustomer(customerId: string): Promise<string[]> {
    const rows = await this.prisma.adminCustomerAssignment.findMany({
      where: { customerId },
      select: { adminId: true },
    });
    return rows.map((r: any) => r.adminId); // eslint-disable-line @typescript-eslint/no-explicit-any
  }

  async isAssigned(adminId: string, customerId: string): Promise<boolean> {
    const row = await this.prisma.adminCustomerAssignment.findUnique({
      where: { adminId_customerId: { adminId, customerId } },
    });
    return row !== null;
  }

  async setAssignments(adminId: string, customerIds: string[]): Promise<void> {
    // Replace-the-whole-set semantics, done as one transaction so a
    // caller never observes a half-updated assignment list.
    await this.prisma.$transaction([
      this.prisma.adminCustomerAssignment.deleteMany({ where: { adminId } }),
      ...(customerIds.length > 0
        ? [
            this.prisma.adminCustomerAssignment.createMany({
              data: customerIds.map((customerId) => ({ adminId, customerId })),
            }),
          ]
        : []),
    ]);
  }

  async addAssignment(adminId: string, customerId: string): Promise<void> {
    // Idempotent: creating an assignment that already exists (e.g. this
    // admin created the same customer twice, or a retry) must not error.
    await this.prisma.adminCustomerAssignment.upsert({
      where: { adminId_customerId: { adminId, customerId } },
      create: { adminId, customerId },
      update: {},
    });
  }
}

export class PrismaAdminNotificationRepository implements AdminNotificationRepository {
  constructor(private prisma: PrismaClient) {}

  async create(input: {
    adminId: string;
    customerId: string;
    event: string;
    message: string;
  }): Promise<void> {
    // Same pattern as EmailNotificationSender: the row is the audit
    // trail of record, written unconditionally; the real email is a
    // best-effort layer on top that never affects the caller
    // (notifyAdminsForCustomer, which is itself best-effort from the
    // webhook's perspective — see webhook-handler.ts).
    const notification = await this.prisma.adminNotification.create({
      data: {
        adminId: input.adminId,
        customerId: input.customerId,
        event: input.event,
        message: input.message,
      },
    });

    const admin = await this.prisma.adminUser.findUnique({ where: { id: input.adminId } });
    if (!admin) return;

    const result = await sendEmail({
      to: admin.email,
      subject: subjectForEvent(input.event),
      text: input.message,
    });

    if (result.success) {
      await this.prisma.adminNotification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });
    }
  }

  async listForAdmin(adminId: string, limit = 50) {
    const rows = await this.prisma.adminNotification.findMany({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
    return rows.map((r: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: r.id,
      adminId: r.adminId,
      customerId: r.customerId,
      event: r.event,
      message: r.message,
      sentAt: r.sentAt ? r.sentAt.toISOString() : null,
      createdAt: r.createdAt.toISOString(),
    }));
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

  async create(input: {
    subscriptionId: string;
    projectId: string;
    environmentId: string;
    serviceId: string;
    deploymentId?: string | null;
    hostingMode: RailwayResourceRecord['hostingMode'];
    suspensionStrategy: RailwayResourceRecord['suspensionStrategy'];
  }): Promise<RailwayResourceRecord> {
    const r = await this.prisma.railwayResource.create({
      data: {
        subscriptionId: input.subscriptionId,
        projectId: input.projectId,
        environmentId: input.environmentId,
        serviceId: input.serviceId,
        deploymentId: input.deploymentId ?? undefined,
        hostingMode: input.hostingMode as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        suspensionStrategy: input.suspensionStrategy as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        status: 'UNKNOWN', // honest starting state — nothing has synced against Railway yet
      },
    });
    return {
      id: r.id,
      subscriptionId: r.subscriptionId,
      projectId: r.projectId,
      environmentId: r.environmentId,
      serviceId: r.serviceId,
      deploymentId: r.deploymentId,
      hostingMode: r.hostingMode,
      suspensionStrategy: r.suspensionStrategy,
      status: r.status,
    };
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
      name: p.name,
      amount: p.amount,
      currency: p.currency,
      billingCycle: p.billingCycle,
      gracePeriodDays: p.gracePeriodDays,
    };
  }

  async listAll(): Promise<PlanRecord[]> {
    const rows = await this.prisma.plan.findMany();
    return rows.map((p: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: p.id,
      name: p.name,
      amount: p.amount,
      currency: p.currency,
      billingCycle: p.billingCycle,
      gracePeriodDays: p.gracePeriodDays,
    }));
  }

  async create(input: {
    name: string;
    amount: number;
    currency: string;
    billingCycle: PlanRecord['billingCycle'];
    gracePeriodDays: number;
  }): Promise<PlanRecord> {
    const p = await this.prisma.plan.create({
      data: {
        name: input.name,
        amount: input.amount,
        currency: input.currency,
        billingCycle: input.billingCycle as any, // eslint-disable-line @typescript-eslint/no-explicit-any
        gracePeriodDays: input.gracePeriodDays,
      },
    });
    return {
      id: p.id,
      name: p.name,
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
    // Always record the Notification row first — this is the audit
    // trail of record. Whether the real email actually goes out is a
    // best-effort add-on layered on top: if Resend is unconfigured or
    // down, the row still exists and the caller (payment webhook,
    // suspension engine, cron) is never affected either way.
    const notification = await this.prisma.notification.create({
      data: { customerId, channel: 'EMAIL', event, message },
    });

    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) return; // FK integrity issue elsewhere — nothing to email.

    const result = await sendEmail({
      to: customer.email,
      subject: subjectForEvent(event),
      text: message,
    });

    if (result.success) {
      await this.prisma.notification.update({
        where: { id: notification.id },
        data: { sentAt: new Date() },
      });
    }
    // On failure, sentAt stays null — that's the visible signal (via
    // the notification row itself) that dispatch didn't happen, without
    // needing a separate error column.
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

export class PrismaDomainRepository implements DomainRepository {
  constructor(private prisma: PrismaClient) {}

  async findById(id: string): Promise<DomainRecord | null> {
    const d = await this.prisma.domain.findUnique({ where: { id } });
    if (!d) return null;
    return {
      id: d.id,
      customerId: d.customerId,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
      createdAt: d.createdAt.toISOString(),
    };
  }

  async findByCustomerId(customerId: string): Promise<DomainRecord[]> {
    const rows = await this.prisma.domain.findMany({ where: { customerId } });
    return rows.map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: d.id,
      customerId: d.customerId,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async findByDomainName(domainName: string): Promise<DomainRecord | null> {
    const d = await this.prisma.domain.findUnique({ where: { domainName } });
    if (!d) return null;
    return {
      id: d.id,
      customerId: d.customerId,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
      createdAt: d.createdAt.toISOString(),
    };
  }

  async listAll(): Promise<DomainRecord[]> {
    const rows = await this.prisma.domain.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((d: any) => ({ // eslint-disable-line @typescript-eslint/no-explicit-any
      id: d.id,
      customerId: d.customerId,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
      createdAt: d.createdAt.toISOString(),
    }));
  }

  async create(input: { customerId: string; domainName: string; isPrimary: boolean }): Promise<DomainRecord> {
    const d = await this.prisma.domain.create({
      data: { customerId: input.customerId, domainName: input.domainName, isPrimary: input.isPrimary },
    });
    return {
      id: d.id,
      customerId: d.customerId,
      domainName: d.domainName,
      isPrimary: d.isPrimary,
      railwayStatus: d.railwayStatus,
      createdAt: d.createdAt.toISOString(),
    };
  }
}
