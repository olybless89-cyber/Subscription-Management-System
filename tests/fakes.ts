import { EngineDeps, WebhookDeps, AuthDeps } from '@/lib/db/ports';
import {
  CustomerRecord,
  SubscriptionRecord,
  RailwayResourceRecord,
  SuspensionEventInput,
  PlanRecord,
  PaymentRecord,
  AdminRecord,
} from '@/types/domain';

export function makeFakeDeps(seed: {
  customers: CustomerRecord[];
  subscriptions: SubscriptionRecord[];
  railwayResources: RailwayResourceRecord[];
}): EngineDeps & {
  events: SuspensionEventInput[];
  notificationLog: Array<{ customerId: string; event: string; message: string }>;
} {
  const customers = new Map(seed.customers.map((c) => [c.id, { ...c }]));
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
    customers: {
      async findById(id) {
        return customers.get(id) ?? null;
      },
      async findByEmail(email) {
        return [...customers.values()].find((c) => c.email === email) ?? null;
      },
      async updateStatus(id, status) {
        const c = customers.get(id);
        if (!c) throw new Error('not found');
        c.status = status;
      },
    },
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
}): WebhookDeps & {
  events: SuspensionEventInput[];
  notificationLog: Array<{ customerId: string; event: string; message: string }>;
  paymentRows: Map<string, PaymentRecord>;
} {
  const base = makeFakeDeps(seed);
  const plans = new Map(seed.plans.map((p) => [p.id, { ...p }]));
  const paymentsByRef = new Map(seed.payments.map((p) => [p.reference, { ...p }]));
  const paymentsById = new Map(seed.payments.map((p) => [p.id, paymentsByRef.get(p.reference)!]));

  return {
    ...base,
    paymentRows: paymentsById,
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
  const admins = new Map(seed.admins.map((a) => [a.email, { ...a }]));
  const customers = new Map(seed.customers.map((c) => [c.email, { ...c }]));

  return {
    admins: {
      async findByEmail(email) {
        return admins.get(email) ?? null;
      },
    },
    customers: {
      async findById(id) {
        return [...customers.values()].find((c) => c.id === id) ?? null;
      },
      async findByEmail(email) {
        return customers.get(email) ?? null;
      },
      async updateStatus(id, status) {
        const c = [...customers.values()].find((x) => x.id === id);
        if (!c) throw new Error('not found');
        c.status = status;
      },
    },
  };
}
