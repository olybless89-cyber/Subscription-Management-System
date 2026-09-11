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

export type WebsiteType =
  | 'ONLINE_BANKING'
  | 'INVESTMENT'
  | 'ECOMMERCE'
  | 'DELIVERY'
  | 'SAAS'
  | 'WEB_APP'
  | 'CORPORATE'
  | 'OTHER';

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
  websiteType: WebsiteType | null;
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

export interface DomainRecord {
  id: string;
  customerId: string;
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
  projectId: string;
  environmentId: string;
  serviceId: string;
  deploymentId: string | null;
  hostingMode: HostingMode;
  suspensionStrategy: SuspensionStrategyValue;
  status: RailwayResourceStatus;
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
