// scripts/activate-imported-customers.mjs
//
// One-time bulk activation for the batch of customers imported from
// CSV. Importing a customer only ever creates a Customer + Domain row
// (see src/lib/customers/manage.ts#createCustomer) — it never creates a
// Subscription, so every imported customer sits with no plan and is
// invisible to the suspend/restore engine (src/lib/suspension/engine.ts
// only ever looks at existing Subscription rows). This script closes
// that gap for TODAY's already-imported batch in one step:
//
//   1. Finds (or creates) the "1 Month" plan at $20.00 USD — the same
//      plan the dashboard's per-customer "Months paid" control creates
//      when an admin activates someone on 1 month (see
//      src/lib/billing/months.ts#resolveBillingCycleForMonths and
//      src/lib/billing/manage.ts#findOrCreatePlanForMonths — this
//      script deliberately mirrors that exact matching logic: same
//      billingCycle/customMonths/amount/currency, so a plan created by
//      either path is reused by the other).
//   2. Finds every Customer with zero Subscription rows.
//   3. Creates an ACTIVE Subscription for each one on that plan,
//      starting now, with currentPeriodEnd/nextBillingDate one month
//      out — exactly what POST /api/admin/customers/:id/activate-billing
//      with { monthsPaid: 1 } would produce.
//
// It does NOT touch any customer that already has a subscription
// (whether from a previous run of this script or from the dashboard) —
// safe to re-run; already-activated customers are just skipped and
// listed as such in the summary.
//
// Requires the Plan.customMonths column to exist first — run
// `npx prisma db push` from this same Railway shell BEFORE running this
// script, or every query below will fail with a missing-column error.
//
// Run from the Railway shell (has DATABASE_URL already set):
//
//   node scripts/activate-imported-customers.mjs
//
// Optional overrides (only touch these if the $20/month rate from the
// dashboard changes and you want this script to match a NEW rate — the
// default matches DEFAULT_MONTHLY_RATE_MINOR_UNITS /
// DEFAULT_MONTHLY_RATE_CURRENCY in src/lib/billing/manage.ts):
//   MONTHLY_RATE_MINOR_UNITS (defaults to 2000, i.e. $20.00)
//   MONTHLY_RATE_CURRENCY (defaults to "USD")
//
// The plan-matching / period-math logic below MUST stay consistent with
// src/lib/billing/manage.ts#findOrCreatePlanForMonths and
// src/lib/billing/cycle.ts#addBillingCycle — this is a deliberate
// duplication (a plain .mjs script can't cheaply import .ts modules on
// a bare `node` runtime), the same pattern scripts/seed-admin.mjs and
// scripts/backfill-hosting-accounts.mjs already use. If you ever change
// the $20/month rate, the MONTHLY billing cycle math, or the plan
// name/label format, mirror the change here too.

import { PrismaClient } from '@prisma/client';

const MONTHLY_RATE_MINOR_UNITS = Number(process.env.MONTHLY_RATE_MINOR_UNITS ?? 2000);
const MONTHLY_RATE_CURRENCY = process.env.MONTHLY_RATE_CURRENCY ?? 'USD';
const BILLING_CYCLE = 'MONTHLY';
const CUSTOM_MONTHS = null; // MONTHLY is a fixed enum cycle — customMonths only applies to CUSTOM

function addOneMonthUTC(from) {
  const next = new Date(from);
  next.setUTCMonth(next.getUTCMonth() + 1);
  return next;
}

async function findOrCreateOneMonthPlan(prisma) {
  const existing = await prisma.plan.findFirst({
    where: {
      billingCycle: BILLING_CYCLE,
      customMonths: CUSTOM_MONTHS,
      amount: MONTHLY_RATE_MINOR_UNITS,
      currency: MONTHLY_RATE_CURRENCY,
    },
  });
  if (existing) return existing;

  const displayAmount = (MONTHLY_RATE_MINOR_UNITS / 100).toFixed(2);
  return prisma.plan.create({
    data: {
      name: `1 Month — ${displayAmount} ${MONTHLY_RATE_CURRENCY}`,
      amount: MONTHLY_RATE_MINOR_UNITS,
      currency: MONTHLY_RATE_CURRENCY,
      billingCycle: BILLING_CYCLE,
      customMonths: CUSTOM_MONTHS,
      gracePeriodDays: 2,
    },
  });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const plan = await findOrCreateOneMonthPlan(prisma);
    console.log(`Using plan "${plan.name}" (id ${plan.id}).`);

    const customers = await prisma.customer.findMany({
      where: { subscriptions: { none: {} } },
      select: { id: true, customerCode: true, name: true, email: true },
      orderBy: { customerCode: 'asc' },
    });

    if (customers.length === 0) {
      console.log('No customers without a subscription were found. Nothing to do.');
      return;
    }

    console.log(`Found ${customers.length} customer(s) with no subscription. Activating on "${plan.name}"...\n`);

    let activated = 0;
    let failed = 0;

    for (const customer of customers) {
      const startDate = new Date();
      const periodEnd = addOneMonthUTC(startDate);

      try {
        const subscription = await prisma.subscription.create({
          data: {
            customerId: customer.id,
            planId: plan.id,
            status: 'ACTIVE',
            startDate,
            currentPeriodStart: startDate,
            currentPeriodEnd: periodEnd,
            nextBillingDate: periodEnd,
          },
        });

        await prisma.auditLog.create({
          data: {
            actor: 'SYSTEM',
            action: 'CUSTOMER_BILLING_ACTIVATED',
            target: customer.id,
            metadata: JSON.stringify({
              monthsPaid: 1,
              planId: plan.id,
              subscriptionId: subscription.id,
              source: 'scripts/activate-imported-customers.mjs',
            }),
            result: 'SUCCESS',
          },
        });

        activated += 1;
        console.log(`  ✔ ${customer.customerCode} — ${customer.name} <${customer.email}> → active, renews ${periodEnd.toISOString().slice(0, 10)}`);
      } catch (err) {
        failed += 1;
        console.error(`  ✘ ${customer.customerCode} — ${customer.name} <${customer.email}> — FAILED: ${err.message}`);
      }
    }

    console.log(`\nDone. Activated ${activated} of ${customers.length} customer(s) on "${plan.name}".`);
    if (failed > 0) {
      console.log(`${failed} customer(s) failed — see errors above; safe to re-run this script, already-activated customers will be skipped.`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
