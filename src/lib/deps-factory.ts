import { PrismaClient } from '@prisma/client';
import {
  PrismaSubscriptionRepository,
  PrismaCustomerRepository,
  PrismaRailwayResourceRepository,
  PrismaSuspensionEventRepository,
  PrismaPlanRepository,
  PrismaPaymentRepository,
  PrismaAdminRepository,
  PrismaAdminAssignmentRepository,
  PrismaAdminNotificationRepository,
  PrismaAuditLogRepository,
  PrismaDomainRepository,
  EmailNotificationSender,
} from './db/prisma-repository';
import { WebhookDeps, AuthDeps, CronDeps, AdminManagementDeps, BillingSetupDeps, CustomEmailDeps } from './db/ports';
import { createRailwayClient } from './railway/client';
import { createPaystackProvider } from './payments/paystack';

let prisma: PrismaClient | null = null;

function getPrisma(): PrismaClient {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

/** Builds the real (Prisma + Railway + Paystack) dependency set used by
 * the production webhook route. Call once per request — PrismaClient
 * itself is memoized so we don't open a new pool per invocation. */
export function buildWebhookDeps(): WebhookDeps {
  const client = getPrisma();
  return {
    subscriptions: new PrismaSubscriptionRepository(client),
    customers: new PrismaCustomerRepository(client),
    railwayResources: new PrismaRailwayResourceRepository(client),
    suspensionEvents: new PrismaSuspensionEventRepository(client),
    notifications: new EmailNotificationSender(client),
    plans: new PrismaPlanRepository(client),
    payments: new PrismaPaymentRepository(client),
    admins: new PrismaAdminRepository(client),
    adminAssignments: new PrismaAdminAssignmentRepository(client),
    adminNotifications: new PrismaAdminNotificationRepository(client),
  };
}

/** Same repository set as buildWebhookDeps — CronDeps is currently
 * identical, kept as a distinct type so cron call sites read clearly and
 * can diverge later without a signature change ripple. */
export function buildCronDeps(): CronDeps {
  return buildWebhookDeps();
}

export function buildAuthDeps(): AuthDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
  };
}

export function buildAdminManagementDeps(): AdminManagementDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
    adminAssignments: new PrismaAdminAssignmentRepository(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildBillingSetupDeps(): BillingSetupDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
    plans: new PrismaPlanRepository(client),
    subscriptions: new PrismaSubscriptionRepository(client),
    railwayResources: new PrismaRailwayResourceRepository(client),
    domains: new PrismaDomainRepository(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildAuditLogRepository(): PrismaAuditLogRepository {
  return new PrismaAuditLogRepository(getPrisma());
}

export function buildCustomEmailDeps(): CustomEmailDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
    notifications: new EmailNotificationSender(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildPaystackProvider() {
  return createPaystackProvider();
}

export function buildRailwayClient() {
  return createRailwayClient();
}
