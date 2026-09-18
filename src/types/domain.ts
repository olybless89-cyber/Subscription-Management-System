export type CustomerStatus = 'ACTIVE' | 'SUSPENDED' | 'CANCELLED' | 'TERMINATED';

export type SubscriptionStatus =
  | 'TRIAL'
  | 'ACTIVE'
  | 'PAYMENT_DUE'
  | 'GRACE_PERIOD'
  | 'SUSPENDED'
  | 'CANCELLED'
  | 'TERMINATED';

export type HostingMode = 'DEDICATED' | 'SHARED_SERVICE' | 'MULTI_TENANT';

export type SuspensionStrategyValue = 'STOP_DEPLOYMENT' | 'APP_LEVEL' | 'REDIRECT' | 'MANUAL';
export type HostingProviderType = 'RAILWAY' | 'DIGITALOCEAN' | 'AWS' | 'VERCEL';

export type RailwayResourceStatus = 'ACTIVE' | 'STOPPED' | 'UNKNOWN' | 'ERROR';

export type SuspensionAction =
  | 'WARNING'
  | 'GRACE_STARTED'
  | 'SERVICE_STOPPED'
  | 'APP_SUSPENDED'
  | 'RESTORED'
  | 'MANUAL_SUSPENSION'
  | 'MANUAL_RESTORATION';

export type SuspensionResult = 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type PaymentStatus = 'PENDING' | 'SUCCESS' | 'FAILED' | 'REFUNDED' | 'CANCELLED';

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'FOUR_MONTHS' | 'SEMI_ANNUAL' | 'YEARLY' | 'CUSTOM';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

export type PaymentProviderName = 'PAYSTACK' | 'FLUTTERWAVE';

// Curated quick-pick service categories offered in the UI (register
// page, admin create/edit forms). The stored value is free text, not
// restricted to this list — selecting "Other" lets the customer/admin
// type a specific product or service name instead.
export const WEBSITE_TYPE_PRESETS = [
  'Website',
  'Application',
  'Social media management',
  'Support',
  'Smart home',
  'Solar',
] as const;

export type WebsiteTypePreset = (typeof WEBSITE_TYPE_PRESETS)[number];

export interface CustomerRecord {
  id: string;
  customerCode: string;
  name: string;
  email: string;
  notificationEmail: string | null;
  phone: string | null;
  dateOfBirth: string | null;
  serviceStartDate: string | null;
  serviceEndDate: string | null;
  websiteType: string | null;
  /** Private, admin-only notes — never shown to the customer, never emailed. */
  notes: string | null;
  passwordHash: string | null;
  status: CustomerStatus;
  automaticSuspension: boolean;
  paymentProvider: PaymentProviderName;
}

export interface AdminRecord {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  passwordChangedAt: string | null;
  role: AdminRole;
  canManageAdmins: boolean;
}

export interface AdminAssignmentRecord {
  id: string;
  adminId: string;
  customerId: string;
}

export interface AuditLogRecord {
  id: string;
  actor: string;
  action: string;
  target: string | null;
  ip: string | null;
  metadata: string | null;
  result: string;
  createdAt: string;
}

export type InvoiceType = 'RECEIPT' | 'DUE';
export type InvoiceStatus = 'PENDING' | 'PAID';

export interface InvoiceRecord {
  id: string;
  invoiceNumber: string;
  customerId: string;
  subscriptionId: string | null;
  type: InvoiceType;
  status: InvoiceStatus;
  amount: number;
  currency: string;
  description: string;
  dueDate: string | null;
  paidAt: string | null;
  issuedAt: string;
}

export type CampaignChannel = 'EMAIL' | 'WHATSAPP';
export type CampaignStatus = 'DRAFT' | 'SENDING' | 'SENT';
export type CampaignRecipientStatus = 'PENDING' | 'SENT' | 'FAILED';

export interface CampaignRecord {
  id: string;
  name: string;
  channels: CampaignChannel[];
  subject: string | null;
  message: string;
  status: CampaignStatus;
  createdBy: string;
  createdAt: string;
  sentAt: string | null;
}

export interface CampaignRecipientRecord {
  id: string;
  campaignId: string;
  customerId: string;
  channel: CampaignChannel;
  status: CampaignRecipientStatus;
  sentAt: string | null;
  error: string | null;
}

export interface DomainRecord {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
  createdAt: string;
}

export interface AdminNotificationRecord {
  id: string;
  adminId: string;
  customerId: string;
  event: string;
  message: string;
  sentAt: string | null;
  createdAt: string;
}

/** The customer-facing Notification table — every email/WhatsApp/etc.
 * sent to a customer, automated or admin-composed, is logged here first
 * (see NotificationSender in ports.ts). This is the read side of that
 * same table: powers the admin-facing "Communication History" section
 * on a customer's page and the "Recent Communications" dashboard feed. */
export interface NotificationRecord {
  id: string;
  customerId: string;
  channel: string; // EMAIL | WHATSAPP | SMS | IN_APP
  event: string; // PAYMENT_DUE | GRACE_PERIOD | SUSPENDED | RENEWAL_REMINDER | BIRTHDAY | CUSTOM | ...
  message: string;
  sentAt: string | null;
  createdAt: string;
}

export interface DomainRecord {
  id: string;
  customerId: string;
  subscriptionId: string | null;
  domainName: string;
  isPrimary: boolean;
  railwayStatus: string | null;
}

export interface SubscriptionRecord {
  id: string;
  customerId: string;
  planId: string;
  status: SubscriptionStatus;
  suspensionEnabled: boolean;
  suspendedAt: string | null;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  nextBillingDate: string;
  gracePeriodEnd: string | null;
  /** null = inherit global SUSPENSION_DRY_RUN. See prisma/schema.prisma. */
  dryRunOverride: boolean | null;
  /** Opt-in renewal-reminder lead time in days. Null = no automated
   * renewal-reminder cron email for this subscription. See
   * prisma/schema.prisma and src/lib/subscriptions/renewal-reminder.ts. */
  reminderDaysBeforeDue: number | null;
  /** Idempotency guard for the renewal-reminder cron — date-only in
   * practice, compared against "today" by the cron. */
  lastRenewalReminderSentAt: string | null;
}

export interface PlanRecord {
  id: string;
  name: string;
  amount: number; // minor units (kobo)
  currency: string;
  billingCycle: BillingCycle;
  gracePeriodDays: number;
}

export interface PaymentRecord {
  id: string;
  subscriptionId: string;
  reference: string;
  provider: string;
  amount: number;
  currency: string;
  status: PaymentStatus;
}

export interface RailwayResourceRecord {
  id: string;
  subscriptionId: string;
  hostingAccountId: string | null;
  projectId: string;
  environmentId: string;
  serviceId: string;
  deploymentId: string | null;
  hostingMode: HostingMode;
  suspensionStrategy: SuspensionStrategyValue;
  status: RailwayResourceStatus;
}

/** Safe view of a connected hosting-provider account — never carries
 * the credential itself. See prisma/schema.prisma's HostingAccount doc
 * comment and src/lib/db/ports.ts's HostingAccountRepository. */
export interface HostingAccountRecord {
  id: string;
  provider: HostingProviderType;
  label: string;
  apiUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface StatusSnapshotRecord {
  id: string;
  railwayResourceId: string;
  status: RailwayResourceStatus;
  checkedAt: string;
}

export interface SuspensionEventInput {
  subscriptionId: string;
  action: SuspensionAction;
  reason: string;
  strategy: SuspensionStrategyValue;
  result: SuspensionResult;
  errorMessage?: string;
  performedBy?: string | null;
  dryRun: boolean;
}
