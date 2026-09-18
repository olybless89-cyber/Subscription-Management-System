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
  PrismaInvoiceRepository,
  PrismaCampaignRepository,
  EmailNotificationSender,
  WhatsAppNotificationSender,
  PrismaResourceStatusSnapshotRepository,
  PrismaHostingAccountRepository,
  PrismaNotificationRepository,
} from './db/prisma-repository';
import {
  WebhookDeps,
  AuthDeps,
  CronDeps,
  AdminManagementDeps,
  BillingSetupDeps,
  CustomEmailDeps,
  CampaignDeps,
  RegisterCustomerDeps,
  CustomerPortalDeps,
  RenewalReminderDeps,
  SendRenewalReminderNowDeps,
  AdminWorkflowDeps,
} from './db/ports';
import { createPaystackProvider } from './payments/paystack';
import { resolveRailwayClientForAccount } from './hosting/account-client';

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
  const hostingAccountRepo = new PrismaHostingAccountRepository(client);
  return {
    subscriptions: new PrismaSubscriptionRepository(client),
    customers: new PrismaCustomerRepository(client),
    railwayResources: new PrismaRailwayResourceRepository(client),
    resolveRailwayClient: (hostingAccountId) => resolveRailwayClientForAccount(hostingAccountRepo, hostingAccountId),
    suspensionEvents: new PrismaSuspensionEventRepository(client),
    notifications: new EmailNotificationSender(client),
    invoices: new PrismaInvoiceRepository(client),
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
    domains: new PrismaDomainRepository(client),
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
    hostingAccounts: new PrismaHostingAccountRepository(client),
    domains: new PrismaDomainRepository(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildHostingAccountRepository(): PrismaHostingAccountRepository {
  return new PrismaHostingAccountRepository(getPrisma());
}

export function buildAuditLogRepository(): PrismaAuditLogRepository {
  return new PrismaAuditLogRepository(getPrisma());
}

export function buildResourceStatusSnapshotRepository(): PrismaResourceStatusSnapshotRepository {
  return new PrismaResourceStatusSnapshotRepository(getPrisma());
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

export function buildCampaignDeps(): CampaignDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
    adminAssignments: new PrismaAdminAssignmentRepository(client),
    campaigns: new PrismaCampaignRepository(client),
    notifications: new EmailNotificationSender(client),
    whatsapp: new WhatsAppNotificationSender(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildRegisterCustomerDeps(): RegisterCustomerDeps {
  const client = getPrisma();
  return {
    customers: new PrismaCustomerRepository(client),
    domains: new PrismaDomainRepository(client),
    admins: new PrismaAdminRepository(client),
    adminAssignments: new PrismaAdminAssignmentRepository(client),
    adminNotifications: new PrismaAdminNotificationRepository(client),
    notifications: new EmailNotificationSender(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildCustomerPortalDeps(): CustomerPortalDeps {
  const client = getPrisma();
  return {
    customers: new PrismaCustomerRepository(client),
    subscriptions: new PrismaSubscriptionRepository(client),
    plans: new PrismaPlanRepository(client),
    railwayResources: new PrismaRailwayResourceRepository(client),
    statusSnapshots: new PrismaResourceStatusSnapshotRepository(client),
    invoices: new PrismaInvoiceRepository(client),
    domains: new PrismaDomainRepository(client),
  };
}

/** Dependencies for the renewal-reminder cron (src/lib/subscriptions/
 * renewal-reminder.ts). See RenewalReminderDeps in ports.ts. */
export function buildRenewalReminderDeps(): RenewalReminderDeps {
  const client = getPrisma();
  return {
    subscriptions: new PrismaSubscriptionRepository(client),
    customers: new PrismaCustomerRepository(client),
    plans: new PrismaPlanRepository(client),
    notifications: new EmailNotificationSender(client),
  };
}

/** Superset of buildRenewalReminderDeps for the admin-triggered "send this
 * reminder now" action. See SendRenewalReminderNowDeps in ports.ts. */
export function buildSendRenewalReminderNowDeps(): SendRenewalReminderNowDeps {
  const client = getPrisma();
  return {
    ...buildRenewalReminderDeps(),
    admins: new PrismaAdminRepository(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

/** Backs every plain-ADMIN-only workflow route modeled on the Digital Web
 * Oracle ICT CRM (Reminders & Actions hub, Reports & Analytics, CSV
 * customer import, per-customer communication history). See
 * AdminWorkflowDeps's doc comment in ports.ts for why this is one
 * deliberately broad bag instead of several narrow ones — it is a
 * structural superset of AdminManagementDeps, CustomEmailDeps and
 * RenewalReminderDeps/SendRenewalReminderNowDeps, so this same value can
 * be passed directly into createCustomer(), sendCustomEmail(), and the
 * renewal-reminder functions without adapting it. */
export function buildAdminWorkflowDeps(): AdminWorkflowDeps {
  const client = getPrisma();
  return {
    admins: new PrismaAdminRepository(client),
    customers: new PrismaCustomerRepository(client),
    subscriptions: new PrismaSubscriptionRepository(client),
    plans: new PrismaPlanRepository(client),
    domains: new PrismaDomainRepository(client),
    adminAssignments: new PrismaAdminAssignmentRepository(client),
    notifications: new EmailNotificationSender(client),
    notificationHistory: new PrismaNotificationRepository(client),
    auditLog: new PrismaAuditLogRepository(client),
  };
}

export function buildPaystackProvider() {
  return createPaystackProvider();
}

/** Direct Prisma access for read paths that need a join no repository
 * port exposes yet (e.g. the super-admin services overview). Prefer a
 * proper repository method for anything beyond a one-off scoped read. */
export function buildPrisma(): PrismaClient {
  return getPrisma();
}
