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

export type BillingCycle = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'CUSTOM';

export type AdminRole = 'SUPER_ADMIN' | 'ADMIN';

export interface CustomerRecord {
  id: string;
  customerCode: string;
  email: string;
  passwordHash: string | null;
  status: CustomerStatus;
  automaticSuspension: boolean;
}

export interface AdminRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: AdminRole;
  canManageAdmins: boolean;
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
}

export interface PlanRecord {
  id: string;
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
