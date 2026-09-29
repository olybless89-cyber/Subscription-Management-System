// scripts/seed-month-plans.mjs
//
// Creates the twelve standard "N months paid, flat $20/month" plans
// (1 through 12 months) as real, active Plan rows, so they show up on
// the dashboard's Plans page immediately instead of being created
// lazily, one at a time, the first time an admin picks that tier on
// the New Subscription form.
//
// Mirrors — deliberately, byte-for-byte in the matching logic —
// src/lib/billing/months.ts#resolveBillingCycleForMonths and
// src/lib/billing/manage.ts#findOrCreatePlanForMonths:
//   - months 1, 3, 4, 6, 12 map to the named cycles MONTHLY, QUARTERLY,
//     FOUR_MONTHS, SEMI_ANNUAL, YEARLY (customMonths stays null — those
//     cycles already have a fixed month count of their own).
//   - every other month count (2, 5, 7, 8, 9, 10, 11) is billingCycle
//     CUSTOM with customMonths set to that exact number.
//   - amount = 2000 minor units ($20.00) * months, currency USD.
// A plan is matched on billingCycle + customMonths + amount + currency
// (never on name), so this script is safe to re-run — an existing plan
// (whether created by this script, by the New Subscription form's
// monthsPaid path, or by scripts/activate-imported-customers.mjs for
// the 1-month case) is reused rather than duplicated, and any
// subscription created afterwards for the same tier will land on that
// same row.
//
// This is a plain .mjs script duplicating .ts logic on purpose — a
// bare `node` runtime can't cheaply import .ts modules — the same
// pattern scripts/activate-imported-customers.mjs, scripts/backfill-
// hosting-accounts.mjs and scripts/seed-admin.mjs already use. If the
// $20/month rate, the month->cycle mapping, or the plan name/label
// format ever changes, mirror the change here too.
//
// Requires the Plan.customMonths column to exist (run `npx prisma db
// push` first if this is a brand new database).
//
// Run from the Railway shell (has DATABASE_URL already set), or
// locally with DATABASE_URL pointed at the same Postgres:
//
//   node scripts/seed-month-plans.mjs
//
// Optional overrides (only touch these if the $20/month rate changes —
// the default matches DEFAULT_MONTHLY_RATE_MINOR_UNITS /
// DEFAULT_MONTHLY_RATE_CURRENCY in src/lib/billing/manage.ts):
//   MONTHLY_RATE_MINOR_UNITS (defaults to 2000, i.e. $20.00)
//   MONTHLY_RATE_CURRENCY (defaults to "USD")
//   GRACE_PERIOD_DAYS (defaults to 2)

import { PrismaClient } from '@prisma/client';

const MONTHLY_RATE_MINOR_UNITS = Number(process.env.MONTHLY_RATE_MINOR_UNITS ?? 2000);
const MONTHLY_RATE_CURRENCY = process.env.MONTHLY_RATE_CURRENCY ?? 'USD';
const GRACE_PERIOD_DAYS = Number(process.env.GRACE_PERIOD_DAYS ?? 2);

const NAMED_CYCLES = { 1: 'MONTHLY', 3: 'QUARTERLY', 4: 'FOUR_MONTHS', 6: 'SEMI_ANNUAL', 12: 'YEARLY' };

function resolveBillingCycleForMonths(months) {
  const named = NAMED_CYCLES[months];
  if (named) return { billingCycle: named, customMonths: null };
  return { billingCycle: 'CUSTOM', customMonths: months };
}

async function findOrCreatePlanForMonths(prisma, months) {
  const { billingCycle, customMonths } = resolveBillingCycleForMonths(months);
  const amount = MONTHLY_RATE_MINOR_UNITS * months;

  const existing = await prisma.plan.findFirst({
    where: { billingCycle, customMonths, amount, currency: MONTHLY_RATE_CURRENCY },
  });
  if (existing) {
    return { plan: existing, created: false };
  }

  const label = months === 1 ? '1 Month' : `${months} Months`;
  const displayAmount = (amount / 100).toFixed(2);
  const plan = await prisma.plan.create({
    data: {
      name: `${label} — ${displayAmount} ${MONTHLY_RATE_CURRENCY}`,
      amount,
      currency: MONTHLY_RATE_CURRENCY,
      billingCycle,
      customMonths,
      gracePeriodDays: GRACE_PERIOD_DAYS,
    },
  });
  return { plan, created: true };
}

async function main() {
  const prisma = new PrismaClient();
  try {
    console.log(`Seeding the 1-12 month plan tiers at ${MONTHLY_RATE_CURRENCY} ${(MONTHLY_RATE_MINOR_UNITS / 100).toFixed(2)}/month...\n`);

    let created = 0;
    let reused = 0;

    for (let months = 1; months <= 12; months += 1) {
      const { plan, created: wasCreated } = await findOrCreatePlanForMonths(prisma, months);
      if (wasCreated) {
        created += 1;
        console.log(`  ✔ created  "${plan.name}" (${plan.billingCycle}${plan.customMonths ? `, customMonths=${plan.customMonths}` : ''})`);
      } else {
        reused += 1;
        console.log(`  · exists   "${plan.name}" (${plan.billingCycle}${plan.customMonths ? `, customMonths=${plan.customMonths}` : ''})`);
      }
    }

    console.log(`\nDone. ${created} plan(s) created, ${reused} already existed. All 12 month tiers are now active Plan rows, ready to be allocated to customers.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exitCode = 1;
});
