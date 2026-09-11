import { EngineDeps, WebhookDeps, AuthDeps, AdminManagementDeps, BillingSetupDeps, CustomEmailDeps } from '@/lib/db/ports';
import {
  CustomerRecord,
  SubscriptionRecord,
  RailwayResourceRecord,
  SuspensionEventInput,
  PlanRecord,
  PaymentRecord,
  AdminRecord,
  DomainRecord,
} from '@/types/domain';

// ---------- shared primitive stores, reused across the various fake-deps builders ----------

function makeCustomerRepo(seed: CustomerRecord[]) {
  const byId = new Map(seed.map((c) => [c.id, { ...c }]));
  let codeCounter = seed.length;
  const repo = {
    async findById(id: string) {
      return byId.get(id) ?? null;
    },
    async findByEmail(email: string) {
      return [...byId.values()].find((c) => c.email === email) ?? null;
    },
    async findByIds(ids: string[]) {
      return ids.map((id) => byId.get(id)).filter((c): c is CustomerRecord => !!c);
    },
    async listAll() {
      return [...byId.values()];
    },
    async updateStatus(id: string, status: CustomerRecord['status']) {
      const c = byId.get(id);
      if (!c) throw new Error('not found');
      c.status = status;
    },
    async create(input: {
      name: string;
      email: string;
      notificationEmail?: string | null;
      phone?: string | null;
      dateOfBirth?: string | null;
      serviceStartDate?: string | null;
      serviceEndDate?: string | null;
      websiteType?: CustomerRecord['websiteType'];
      paymentProvider: CustomerRecord['paymentProvider'];
      automaticSuspension: boolean;
    }) {
      codeCounter += 1;
      const record: CustomerRecord = {
        id: `cust_${codeCounter}`,
        customerCode: `WOH-${String(codeCounter).padStart(6, '0')}`,
        name: input.name,
        email: input.email,
        notificationEmail: input.notificationEmail ?? null,
        phone: input.phone ?? null,
        dateOfBirth: input.dateOfBirth ?? null,
        serviceStartDate: input.serviceStartDate ?? null,
        serviceEndDate: input.serviceEndDate ?? null,
        websiteType: input.websiteType ?? null,
        passwordHash: null,
        status: 'ACTIVE',
        automaticSuspension: input.automaticSuspension,
        paymentProvider: input.paymentProvider,
      };
      byId.set(record.id, record);
      return record;
    },
    async update(
      id: string,
      patch: {
        name?: string;
        notificationEmail?: string | null;
        phone?: string | null;
        dateOfBirth?: string | null;
        serviceStartDate?: string | null;
        serviceEndDate?: string | null;
        websiteType?: CustomerRecord['websiteType'];
        paymentProvider?: CustomerRecord['paymentProvider'];
        automaticSuspension?: boolean;
      }
    ) {
      const c = byId.get(id);
      if (!c) throw new Error('not found');
      if (patch.name !== undefined) c.name = patch.name;
      if (patch.notificationEmail !== undefined) c.notificationEmail = patch.notificationEmail;
      if (patch.phone !== undefined) c.phone = patch.phone;
      if (patch.dateOfBirth !== undefined) c.dateOfBirth = patch.dateOfBirth;
      if (patch.serviceStartDate !== undefined) c.serviceStartDate = patch.serviceStartDate;
      if (patch.serviceEndDate !== undefined) c.serviceEndDate = patch.serviceEndDate;
      if (patch.websiteType !== undefined) c.websiteType = patch.websiteType;
      if (patch.paymentProvider !== undefined) c.paymentProvider = patch.paymentProvider;
      if (patch.automaticSuspension !== undefined) c.automaticSuspension = patch.automaticSuspension;
      return { ...c };
    },
    async findWithBirthday() {
      return [...byId.values()].filter((c) => c.dateOfBirth !== null);
    },
    async updatePassword(id: string, passwordHash: string) {
      const c = byId.get(id);
      if (!c) throw new Error('not found');
      c.passwordHash = passwordHash;
    },
  };
  return { repo, byId };
}

function makeAdminRepo(seed: AdminRecord[]) {
  const byId = new Map(seed.map((a) => [a.id, { ...a }]));
  const repo = {
    async findById(id: string) {
      return byId.get(id) ?? null;
    },
    async findByEmail(email: string) {
      return [...byId.values()].find((a) => a.email === email) ?? null;
    },
    async listSuperAdmins() {
      return [...byId.values()].filter((a) => a.role === 'SUPER_ADMIN');
    },
    async listAll() {
      return [...byId.values()];
    },
    async create(input: Omit<AdminRecord, 'id'>) {
      const record: AdminRecord = { id: `admin_${byId.size + 1}`, ...input };
      byId.set(record.id, record);
      return record;
    },
    async updatePassword(id: string, passwordHash: string) {
      const a = byId.get(id);
      if (!a) throw new Error('not found');
      a.passwordHash = passwordHash;
      a.passwordChangedAt = new Date().toISOString();
    },
  };
  return { repo, byId };
}

function makeAssignmentRepo(seed: Array<{ adminId: string; customerId: string }> = []) {
  const byAdmin = new Map<string, Set<string>>();
  for (const { adminId, customerId } of seed) {
    if (!byAdmin.has(adminId)) byAdmin.set(adminId, new Set());
    byAdmin.get(adminId)!.add(customerId);
  }
  const repo = {
    async listCustomerIdsForAdmin(adminId: string) {
      return [...(byAdmin.get(adminId) ?? [])];
    },
    async listAdminIdsForCustomer(customerId: string) {
      return [...byAdmin.entries()].filter(([, ids]) => ids.has(customerId)).map(([adminId]) => adminId);
    },
    async isAssigned(adminId: string, customerId: string) {
      return byAdmin.get(adminId)?.has(customerId) ?? false;
    },
    async setAssignments(adminId: string, customerIds: string[]) {
      byAdmin.set(adminId, new Set(customerIds));
    },
    async addAssignment(adminId: string, customerId: string) {
      if (!byAdmin.has(adminId)) byAdmin.set(adminId, new Set());
      byAdmin.get(adminId)!.add(customerId);
    },
  };
  return { repo, byAdmin };
}

function makeAdminNotificationRepo() {
  const log: Array<{ id: string; adminId: string; customerId: string; event: string; message: string; sentAt: string | null; createdAt: string }> = [];
  const repo = {
    async create(input: { adminId: string; customerId: string; event: string; message: string }) {
      // Fake never actually sends email (no network in tests) — sentAt
      // stays null, matching the honest "not sent" signal the real
      // repository uses when Resend is unconfigured or fails.
      log.push({ id: `an_${log.length + 1}`, sentAt: null, createdAt: new Date().toISOString(), ...input });
    },
    async listForAdmin(adminId: string, limit = 50) {
      return log
        .filter((n) => n.adminId === adminId)
        .slice()
        .reverse()
        .slice(0, limit);
    },
  };
  return { repo, log };
}

function makePlanRepo(seed: PlanRecord[]) {
  const byId = new Map(seed.map((p) => [p.id, { ...p }]));
  let counter = seed.length;
  const repo = {
    async findById(id: string) {
      return byId.get(id) ?? null;
    },
    async listAll() {
      return [...byId.values()];
    },
    async create(input: Omit<PlanRecord, 'id'>) {
      counter += 1;
      const record: PlanRecord = { id: `plan_${counter}`, ...input };
      byId.set(record.id, record);
      return record;
    },
  };
  return { repo, byId };
}

function makeSubscriptionRepo(seed: SubscriptionRecord[]) {
  const byId = new Map(seed.map((s) => [s.id, { ...s }]));
  let counter = seed.length;
  const repo = {
    async findById(id: string) {
      return byId.get(id) ?? null;
    },
    async updateStatus(id: string, status: SubscriptionRecord['status'], extra?: { suspendedAt?: string | null }) {
      const s = byId.get(id);
      if (!s) throw new Error('not found');
      s.status = status;
      if (extra?.suspendedAt !== undefined) s.suspendedAt = extra.suspendedAt;
    },
    async extendPeriod(
      id: string,
      period: { currentPeriodStart: string; currentPeriodEnd: string; nextBillingDate: string }
    ) {
      const s = byId.get(id);
      if (!s) throw new Error('not found');
      s.currentPeriodStart = period.currentPeriodStart;
      s.currentPeriodEnd = period.currentPeriodEnd;
      s.nextBillingDate = period.nextBillingDate;
      s.gracePeriodEnd = null;
    },
    async startGracePeriod(id: string, gracePeriodEnd: string) {
      const s = byId.get(id);
      if (!s) throw new Error('not found');
      s.status = 'GRACE_PERIOD';
      s.gracePeriodEnd = gracePeriodEnd;
    },
    async findBillingCheckCandidates() {
      return [...byId.values()].filter((s) =>
        (['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'] as const).includes(
          s.status as 'ACTIVE' | 'PAYMENT_DUE' | 'GRACE_PERIOD'
        )
      );
    },
    async create(input: {
      customerId: string;
      planId: string;
      status: SubscriptionRecord['status'];
      currentPeriodStart: string;
      currentPeriodEnd: string;
      nextBillingDate: string;
    }) {
      counter += 1;
      const record: SubscriptionRecord = {
        id: `sub_${counter}`,
        customerId: input.customerId,
        planId: input.planId,
        status: input.status,
        suspensionEnabled: true,
        suspendedAt: null,
        currentPeriodStart: input.currentPeriodStart,
        currentPeriodEnd: input.currentPeriodEnd,
        nextBillingDate: input.nextBillingDate,
        gracePeriodEnd: null,
        dryRunOverride: null,
      };
      byId.set(record.id, record);
      return record;
    },
    async setDryRunOverride(id: string, override: boolean | null) {
      const s = byId.get(id);
      if (!s) throw new Error('not found');
      s.dryRunOverride = override;
    },
    async listAll() {
      return [...byId.values()];
    },
    async update(id: string, patch: { planId?: string; suspensionEnabled?: boolean }) {
      const s = byId.get(id);
      if (!s) throw new Error('not found');
      if (patch.planId !== undefined) s.planId = patch.planId;
      if (patch.suspensionEnabled !== undefined) s.suspensionEnabled = patch.suspensionEnabled;
    },
  };
  return { repo, byId };
}

function makeAuditLogRepo() {
  const log: Array<{ id: string; actor: string; action: string; target?: string; metadata?: unknown; result: string; createdAt: string }> = [];
  const repo = {
    async create(entry: { actor: string; action: string; target?: string; metadata?: unknown; result: 'SUCCESS' | 'FAILED' }) {
      log.push({ id: `audit_${log.length + 1}`, createdAt: new Date().toISOString(), ...entry });
    },
    async listRecent(limit = 50) {
      return log
        .slice()
        .reverse()
        .slice(0, limit)
        .map((e) => ({
          id: e.id,
          actor: e.actor,
          action: e.action,
          target: e.target ?? null,
          ip: null,
          metadata: e.metadata ? JSON.stringify(e.metadata) : null,
          result: e.result,
          createdAt: e.createdAt,
        }));
    },
  };
  return { repo, log };
}

function makeDomainRepo(seed: DomainRecord[] = []) {
  const byId = new Map(seed.map((d) => [d.id, { ...d }]));
  let counter = seed.length;
  const repo = {
    async findById(id: string) {
      return byId.get(id) ?? null;
    },
    async findByCustomerId(customerId: string) {
      return [...byId.values()].filter((d) => d.customerId === customerId);
    },
    async findByDomainName(domainName: string) {
      return [...byId.values()].find((d) => d.domainName === domainName) ?? null;
    },
    async listAll() {
      return [...byId.values()];
    },
    async create(input: { customerId: string; domainName: string; isPrimary: boolean }) {
      counter += 1;
      const record: DomainRecord = {
        id: `dom_${counter}`,
        customerId: input.customerId,
        domainName: input.domainName,
        isPrimary: input.isPrimary,
        railwayStatus: null,
        createdAt: new Date().toISOString(),
      };
      byId.set(record.id, record);
      return record;
    },
  };
  return { repo, byId };
}

// ---------- composed fake-deps builders used by the test suites ----------

export function makeFakeDeps(seed: {
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  railwayResources: RailwayResourceRecord[];
}): EngineDeps & {
  events: SuspensionEventInput[];
  notificationLog: Array<{ customerId: string; event: string; message: string; subject?: string }>;
} {
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const { repo: subscriptionsRepo } = makeSubscriptionRepo(seed.subscriptions);
  const resources = [...seed.railwayResources];
  const events: SuspensionEventInput[] = [];
  const notificationLog: Array<{ customerId: string; event: string; message: string; subject?: string }> = [];

  return {
    events,
    notificationLog,
    subscriptions: subscriptionsRepo,
    customers: customersRepo,
    railwayResources: {
      async findBySubscriptionId(subscriptionId) {
        return resources.filter((r) => r.subscriptionId === subscriptionId);
      },
      async findAll() {
        return [...resources];
      },
      async updateStatus(id, status, extra) {
        const r = resources.find((x) => x.id === id);
        if (!r) throw new Error('not found');
        r.status = status;
        if (extra?.deploymentId !== undefined) r.deploymentId = extra.deploymentId ?? null;
      },
      async create(input) {
        const record: RailwayResourceRecord = {
          id: `res_${resources.length + 1}`,
          subscriptionId: input.subscriptionId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          serviceId: input.serviceId,
          deploymentId: input.deploymentId ?? null,
          hostingMode: input.hostingMode,
          suspensionStrategy: input.suspensionStrategy,
          status: 'UNKNOWN',
        };
        resources.push(record);
        return record;
      },
    },
    suspensionEvents: {
      async create(event) {
        events.push(event);
      },
    },
    notifications: {
      async send(customerId, event, message, subject) {
        notificationLog.push({ customerId, event, message, subject });
      },
    },
  };
}

export function makeFakeWebhookDeps(seed: {
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  railwayResources: RailwayResourceRecord[];
  plans: PlanRecord[];
  payments: PaymentRecord[];
  admins?: AdminRecord[];
  assignments?: Array<{ adminId: string; customerId: string }>;
}): WebhookDeps & {
  events: SuspensionEventInput[];
  notificationLog: Array<{ customerId: string; event: string; message: string; subject?: string }>;
  paymentRows: Map<string, PaymentRecord>;
  adminNotificationLog: Array<{ adminId: string; customerId: string; event: string; message: string }>;
} {
  const base = makeFakeDeps(seed);
  const { repo: plansRepo } = makePlanRepo(seed.plans);
  const paymentsByRef = new Map(seed.payments.map((p) => [p.reference, { ...p }]));
  const paymentsById = new Map(seed.payments.map((p) => [p.id, paymentsByRef.get(p.reference)!]));
  const { repo: adminsRepo } = makeAdminRepo(seed.admins ?? []);
  const { repo: assignmentsRepo } = makeAssignmentRepo(seed.assignments ?? []);
  const { repo: adminNotificationsRepo, log: adminNotificationLog } = makeAdminNotificationRepo();

  return {
    ...base,
    paymentRows: paymentsById,
    adminNotificationLog,
    admins: adminsRepo,
    adminAssignments: assignmentsRepo,
    adminNotifications: adminNotificationsRepo,
    plans: plansRepo,
    payments: {
      async findByReference(reference) {
        return paymentsByRef.get(reference) ?? null;
      },
      async createPending(input) {
        const record: PaymentRecord = {
          id: `pay_${paymentsByRef.size + 1}`,
          subscriptionId: input.subscriptionId,
          reference: input.reference,
          provider: input.provider,
          amount: input.amount,
          currency: input.currency,
          status: 'PENDING',
        };
        paymentsByRef.set(record.reference, record);
        paymentsById.set(record.id, record);
        return record;
      },
      async updateStatus(id, status) {
        const p = paymentsById.get(id);
        if (!p) throw new Error('not found');
        p.status = status;
      },
    },
  };
}

export function makeFakeAuthDeps(seed: {
  admins: AdminRecord[];
  customers: CustomerRecord[];
}): AuthDeps {
  const { repo: adminsRepo } = makeAdminRepo(seed.admins);
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  return { admins: adminsRepo, customers: customersRepo };
}

export function makeFakeAdminManagementDeps(seed: {
  admins: AdminRecord[];
  customers: CustomerRecord[];
  assignments?: Array<{ adminId: string; customerId: string }>;
  domains?: DomainRecord[];
}): AdminManagementDeps & {
  auditLogEntries: Array<{ actor: string; action: string; target?: string; metadata?: unknown; result: string }>;
  assignmentStore: Map<string, Set<string>>;
  domainStore: Map<string, DomainRecord>;
} {
  const { repo: adminsRepo } = makeAdminRepo(seed.admins);
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const { repo: assignmentsRepo, byAdmin } = makeAssignmentRepo(seed.assignments ?? []);
  const { repo: domainsRepo, byId: domainStore } = makeDomainRepo(seed.domains ?? []);
  const { repo: auditLogRepo, log: auditLogEntries } = makeAuditLogRepo();

  return {
    admins: adminsRepo,
    customers: customersRepo,
    adminAssignments: assignmentsRepo,
    domains: domainsRepo,
    auditLog: auditLogRepo,
    auditLogEntries,
    assignmentStore: byAdmin,
    domainStore,
  };
}

export function makeFakeBillingSetupDeps(seed: {
  admins: AdminRecord[];
  customers: CustomerRecord[];
  plans: PlanRecord[];
  subscriptions: SubscriptionRecord[];
  railwayResources: RailwayResourceRecord[];
  domains?: DomainRecord[];
}): BillingSetupDeps & {
  auditLogEntries: Array<{ actor: string; action: string; target?: string; metadata?: unknown; result: string }>;
  planStore: Map<string, PlanRecord>;
  subscriptionStore: Map<string, SubscriptionRecord>;
  railwayResourceStore: RailwayResourceRecord[];
  domainStore: Map<string, DomainRecord>;
} {
  const { repo: adminsRepo } = makeAdminRepo(seed.admins);
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const { repo: plansRepo, byId: planStore } = makePlanRepo(seed.plans);
  const { repo: subscriptionsRepo, byId: subscriptionStore } = makeSubscriptionRepo(seed.subscriptions);
  const railwayResourceStore = [...seed.railwayResources];
  const { repo: domainsRepo, byId: domainStore } = makeDomainRepo(seed.domains ?? []);
  const { repo: auditLogRepo, log: auditLogEntries } = makeAuditLogRepo();

  return {
    admins: adminsRepo,
    customers: customersRepo,
    plans: plansRepo,
    subscriptions: subscriptionsRepo,
    domains: domainsRepo,
    railwayResources: {
      async findBySubscriptionId(subscriptionId: string) {
        return railwayResourceStore.filter((r) => r.subscriptionId === subscriptionId);
      },
      async findAll() {
        return [...railwayResourceStore];
      },
      async updateStatus(id: string, status: RailwayResourceRecord['status'], extra) {
        const r = railwayResourceStore.find((x) => x.id === id);
        if (!r) throw new Error('not found');
        r.status = status;
        if (extra?.deploymentId !== undefined) r.deploymentId = extra.deploymentId ?? null;
      },
      async create(input) {
        const record: RailwayResourceRecord = {
          id: `res_${railwayResourceStore.length + 1}`,
          subscriptionId: input.subscriptionId,
          projectId: input.projectId,
          environmentId: input.environmentId,
          serviceId: input.serviceId,
          deploymentId: input.deploymentId ?? null,
          hostingMode: input.hostingMode,
          suspensionStrategy: input.suspensionStrategy,
          status: 'UNKNOWN',
        };
        railwayResourceStore.push(record);
        return record;
      },
    },
    auditLog: auditLogRepo,
    auditLogEntries,
    planStore,
    subscriptionStore,
    railwayResourceStore,
    domainStore,
  };
}

export function makeFakeCustomEmailDeps(seed: {
  admins: AdminRecord[];
  customers: CustomerRecord[];
}): CustomEmailDeps & {
  auditLogEntries: Array<{ actor: string; action: string; target?: string; metadata?: unknown; result: string }>;
  notificationLog: Array<{ customerId: string; event: string; message: string; subject?: string }>;
} {
  const { repo: adminsRepo } = makeAdminRepo(seed.admins);
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const { repo: auditLogRepo, log: auditLogEntries } = makeAuditLogRepo();
  const notificationLog: Array<{ customerId: string; event: string; message: string; subject?: string }> = [];

  return {
    admins: adminsRepo,
    customers: customersRepo,
    auditLog: auditLogRepo,
    auditLogEntries,
    notificationLog,
    notifications: {
      async send(customerId, event, message, subject) {
        notificationLog.push({ customerId, event, message, subject });
      },
    },
  };
}
