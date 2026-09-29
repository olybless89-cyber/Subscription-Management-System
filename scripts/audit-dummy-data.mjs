// scripts/audit-dummy-data.mjs
//
// READ-ONLY heuristic scan for test/trial/demo data left over from
// development, so a human can review the list and decide what to
// delete before go-live. This script never writes or deletes
// anything — it only prints a report. Deleting is a separate,
// deliberate step you take afterward (in the dashboard, or with your
// own follow-up script) once you've reviewed this list, because some
// of these heuristics can have false positives (e.g. a real customer
// who happens to work at a company called "Sample Co", or a plan
// legitimately named "Trial" that you actually offer).
//
// What it flags, and why each pattern was chosen:
//   - Customers whose email or name matches common placeholder/test
//     patterns (test@, demo@, example.com, mailinator.com, yopmail,
//     "John Doe", "Jane Doe", "N/A", single-repeated-character names,
//     asdf/qwerty-style keyboard-mash names).
//   - Customers with zero domains AND zero subscriptions — an
//     abandoned/incomplete registration, or a record created just to
//     poke around the UI.
//   - Plans named test/demo/trial/dummy/sample/placeholder, or with a
//     suspiciously small amount (under 100 minor units, i.e. under
//     1.00 in whatever currency).
//   - Domains whose domainName matches test/demo/example.com,
//     .test/.local TLDs, localhost, or "yourdomain"-style
//     placeholders.
//   - AdminUser accounts matching the same test/demo email patterns.
//   - Campaigns named test/demo that were never sent (status DRAFT).
//
// Run from the Railway shell (has DATABASE_URL already set), or
// locally with DATABASE_URL pointed at the same Postgres:
//
//   node scripts/audit-dummy-data.mjs
//
// Run this against a database that already has today's schema pushed
// (`npx prisma db push`).

import { PrismaClient } from '@prisma/client';

const TEST_WORD = /\b(test|demo|dummy|sample|placeholder|fake|temp|throwaway|scratch)\b/i;
const TEST_EMAIL_DOMAIN = /@(example\.(com|org|net)|test\.(com|local)|mailinator\.com|yopmail\.com|guerrillamail\.com|10minutemail\.com|localhost)$/i;
const TEST_EMAIL_LOCAL = /^(test|demo|dummy|sample|admin|foo|bar|baz|asdf|qwerty|xxx|nobody|noone|placeholder)[0-9]*$/i;
const GENERIC_NAME = /^(john doe|jane doe|test user|demo user|n\/a|na|unknown|foo bar|asdf|qwerty)$/i;
const REPEATED_CHAR_NAME = /^(.)\1{2,}$/i; // "aaaa", "xxxx"
const TEST_DOMAIN_NAME = /(^|\.)(test|demo|example|localhost|yourdomain|mydomain)(\.|$)|\.(test|local)$/i;

function flagCustomer(c) {
  const reasons = [];
  if (TEST_EMAIL_DOMAIN.test(c.email)) reasons.push(`email domain looks like a placeholder (${c.email})`);
  const local = c.email.split('@')[0] ?? '';
  if (TEST_EMAIL_LOCAL.test(local)) reasons.push(`email local part looks like a placeholder (${c.email})`);
  if (TEST_WORD.test(c.name)) reasons.push(`name contains a test/demo keyword ("${c.name}")`);
  if (GENERIC_NAME.test(c.name.trim())) reasons.push(`name is a generic placeholder ("${c.name}")`);
  if (REPEATED_CHAR_NAME.test(c.name.trim().replace(/\s+/g, ''))) reasons.push(`name is a repeated character ("${c.name}")`);
  if (c._count.subscriptions === 0 && c._count.domains === 0) reasons.push('no subscriptions and no domains — looks abandoned/incomplete');
  return reasons;
}

function flagPlan(p) {
  const reasons = [];
  if (TEST_WORD.test(p.name)) reasons.push(`name contains a test/demo keyword ("${p.name}")`);
  if (p.amount < 100) reasons.push(`suspiciously small amount (${p.amount} ${p.currency} minor units)`);
  if (p._count.subscriptions === 0) reasons.push('no subscriptions use this plan');
  return reasons;
}

function flagDomain(d) {
  const reasons = [];
  if (TEST_DOMAIN_NAME.test(d.domainName)) reasons.push(`domain name looks like a placeholder ("${d.domainName}")`);
  return reasons;
}

function flagAdmin(a) {
  const reasons = [];
  if (TEST_EMAIL_DOMAIN.test(a.email)) reasons.push(`email domain looks like a placeholder (${a.email})`);
  const local = a.email.split('@')[0] ?? '';
  if (TEST_EMAIL_LOCAL.test(local)) reasons.push(`email local part looks like a placeholder (${a.email})`);
  if (TEST_WORD.test(a.name)) reasons.push(`name contains a test/demo keyword ("${a.name}")`);
  return reasons;
}

function flagCampaign(c) {
  const reasons = [];
  if (TEST_WORD.test(c.name) && c.status === 'DRAFT') reasons.push(`name contains a test/demo keyword and it was never sent ("${c.name}")`);
  return reasons;
}

function printSection(title, rows) {
  console.log(`\n=== ${title} (${rows.length}) ===`);
  if (rows.length === 0) {
    console.log('  (none flagged)');
    return;
  }
  for (const row of rows) {
    console.log(`  ${row.label}`);
    for (const reason of row.reasons) console.log(`      - ${reason}`);
  }
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const [customers, plans, domains, admins, campaigns] = await Promise.all([
      prisma.customer.findMany({
        select: {
          id: true, customerCode: true, name: true, email: true, createdAt: true,
          _count: { select: { subscriptions: true, domains: true } },
        },
      }),
      prisma.plan.findMany({
        select: { id: true, name: true, amount: true, currency: true, isActive: true, _count: { select: { subscriptions: true } } },
      }),
      prisma.domain.findMany({ select: { id: true, domainName: true, customerId: true } }),
      prisma.adminUser.findMany({ select: { id: true, name: true, email: true, role: true } }),
      prisma.campaign.findMany({ select: { id: true, name: true, status: true } }),
    ]);

    const flaggedCustomers = customers
      .map((c) => ({ row: c, reasons: flagCustomer(c) }))
      .filter((x) => x.reasons.length > 0)
      .map((x) => ({
        label: `${x.row.customerCode} — ${x.row.name} <${x.row.email}> (id: ${x.row.id}, created ${x.row.createdAt.toISOString().slice(0, 10)})`,
        reasons: x.reasons,
      }));

    const flaggedPlans = plans
      .map((p) => ({ row: p, reasons: flagPlan(p) }))
      .filter((x) => x.reasons.length > 0)
      .map((x) => ({
        label: `"${x.row.name}" — ${x.row.amount} ${x.row.currency} (id: ${x.row.id}, active: ${x.row.isActive}, ${x.row._count.subscriptions} subscription(s))`,
        reasons: x.reasons,
      }));

    const flaggedDomains = domains
      .map((d) => ({ row: d, reasons: flagDomain(d) }))
      .filter((x) => x.reasons.length > 0)
      .map((x) => ({
        label: `${x.row.domainName} (id: ${x.row.id}, customerId: ${x.row.customerId})`,
        reasons: x.reasons,
      }));

    const flaggedAdmins = admins
      .map((a) => ({ row: a, reasons: flagAdmin(a) }))
      .filter((x) => x.reasons.length > 0)
      .map((x) => ({
        label: `${x.row.name} <${x.row.email}> — ${x.row.role} (id: ${x.row.id})`,
        reasons: x.reasons,
      }));

    const flaggedCampaigns = campaigns
      .map((c) => ({ row: c, reasons: flagCampaign(c) }))
      .filter((x) => x.reasons.length > 0)
      .map((x) => ({
        label: `"${x.row.name}" — ${x.row.status} (id: ${x.row.id})`,
        reasons: x.reasons,
      }));

    console.log('DUMMY / TEST DATA AUDIT');
    console.log('========================');
    console.log(`Scanned: ${customers.length} customers, ${plans.length} plans, ${domains.length} domains, ${admins.length} admin accounts, ${campaigns.length} campaigns.`);
    console.log('This is a heuristic scan only — review each item before deleting anything. Nothing has been changed.');

    printSection('Customers', flaggedCustomers);
    printSection('Plans', flaggedPlans);
    printSection('Domains', flaggedDomains);
    printSection('Admin accounts', flaggedAdmins);
    printSection('Campaigns', flaggedCampaigns);

    const totalFlagged = flaggedCustomers.length + flaggedPlans.length + flaggedDomains.length + flaggedAdmins.length + flaggedCampaigns.length;
    console.log(`\nTotal flagged rows: ${totalFlagged}. Nothing was deleted — this script is read-only.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Audit failed:', err);
  process.exitCode = 1;
});
