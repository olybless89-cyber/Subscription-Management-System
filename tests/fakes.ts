import { EngineDeps, WebhookDeps, AuthDeps, AdminManagementDeps } from '@/lib/db/ports';
import {
  CustomerRecord,
  SubscriptionRecord,
  RailwayResourceRecord,
  SuspensionEventInput,
  PlanRecord,
  PaymentRecord,
  AdminRecord,
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
      phone?: string | null;
      paymentProvider: CustomerRecord['paymentProvider'];
      automaticSuspension: boolean;
    }) {
      codeCounter += 1;
      const record: CustomerRecord = {
        id: `cust_${codeCounter}`,
        customerCode: `WOH-${String(codeCounter).padStart(6, '0')}`,
        email: input.email,
        passwordHash: null,
        status: 'ACTIVE',
        automaticSuspension: input.automaticSuspension,
        paymentProvider: input.paymentProvider,
      };
      byId.set(record.id, record);
      return record;
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
    async create(input: Omit<AdminRecord, 'id'>) {
      const record: AdminRecord = { id: `admin_${byId.size + 1}`, ...input };
      byId.set(record.id, record);
      return record;
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
  const log: Array<{ id: string; adminId: string; customerId: string; event: string; message: string; createdAt: string }> = [];
  const repo = {
    async create(input: { adminId: string; customerId: string; event: string; message: string }) {
      log.push({ id: `an_${log.length + 1}`, createdAt: new Date().toISOString(), ...input });
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

function makeAuditLogRepo() {
  const log: Array<{ actor: string; action: string; target?: string; metadata?: unknown; result: string }> = [];
  const repo = {
    async create(entry: { actor: string; action: string; target?: string; metadata?: unknown; result: 'SUCCESS' | 'FAILED' }) {
      log.push(entry);
    },
  };
  return { repo, log };
}

// ---------- composed fake-deps builders used by the test suites ----------

export function makeFakeDeps(seed: {
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  railwayResources: RailwayResourceRecord[];
}): EngineDeps & {
  events: SuspensionEventInput[];
  notificationLog: Array<{ customerId: string; event: string; message: string }>;
} {
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const subscriptions = new Map(seed.subscriptions.map((s) => [s.id, { ...s }]));
  const resources = [...seed.railwayResources];
  const events: SuspensionEventInput[] = [];
  const notificationLog: Array<{ customerId: string; event: string; message: string }> = [];

  return {
    events,
    notificationLog,
    subscriptions: {
      async findById(id) {
        return subscriptions.get(id) ?? null;
      },
      async updateStatus(id, status, extra) {
        const s = subscriptions.get(id);
        if (!s) throw new Error('not found');
        s.status = status;
        if (extra?.suspendedAt !== undefined) s.suspendedAt = extra.suspendedAt;
      },
      async extendPeriod(id, period) {
        const s = subscriptions.get(id);
        if (!s) throw new Error('not found');
        s.currentPeriodStart = period.currentPeriodStart;
        s.currentPeriodEnd = period.currentPeriodEnd;
        s.nextBillingDate = period.nextBillingDate;
        s.gracePeriodEnd = null;
      },
      async startGracePeriod(id, gracePeriodEnd) {
        const s = subscriptions.get(id);
        if (!s) throw new Error('not found');
        s.status = 'GRACE_PERIOD';
        s.gracePeriodEnd = gracePeriodEnd;
      },
      async findBillingCheckCandidates() {
        return [...subscriptions.values()].filter((s) =>
          (['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'] as const).includes(
            s.status as 'ACTIVE' | 'PAYMENT_DUE' | 'GRACE_PERIOD'
          )
        );
      },
    },
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
    },
    suspensionEvents: {
      async create(event) {
        events.push(event);
      },
    },
    notifications: {
      async send(customerId, event, message) {
        notificationLog.push({ customerId, event, message });
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
  notificationLog: Array<{ customerId: string; event: string; message: string }>;
  paymentRows: Map<string, PaymentRecord>;
  adminNotificationLog: Array<{ adminId: string; customerId: string; event: string; message: string }>;
} {
  const base = makeFakeDeps(seed);
  const plans = new Map(seed.plans.map((p) => [p.id, { ...p }]));
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
    plans: {
      async findById(id) {
        return plans.get(id) ?? null;
      },
    },
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
}): AdminManagementDeps & {
  auditLogEntries: Array<{ actor: string; action: string; target?: string; metadata?: unknown; result: string }>;
  assignmentStore: Map<string, Set<string>>;
} {
  const { repo: adminsRepo } = makeAdminRepo(seed.admins);
  const { repo: customersRepo } = makeCustomerRepo(seed.customers);
  const { repo: assignmentsRepo, byAdmin } = makeAssignmentRepo(seed.assignments ?? []);
  const { repo: auditLogRepo, log: auditLogEntries } = makeAuditLogRepo();

  return {
    admins: adminsRepo,
    customers: customersRepo,
    adminAssignments: assignmentsRepo,
    auditLog: auditLogRepo,
    auditLogEntries,
    assignmentStore: byAdmin,
  };
}
