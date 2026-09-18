// scripts/backfill-hosting-accounts.mjs
//
// One-time migration for the multi-provider hosting-accounts feature.
// Before this feature existed, the whole app shared ONE Railway
// account via the RAILWAY_API_TOKEN/RAILWAY_API_URL env vars. Every
// RailwayResource row now needs its own hostingAccountId (see
// prisma/schema.prisma's HostingAccount model and
// src/lib/hosting/account-client.ts) — a resource with hostingAccountId
// still null fails suspend/restore/sync loudly rather than guessing
// which account it belongs to (spec section 37: never silently fall
// back). This script closes that gap for existing data in one step:
//
//   1. Creates (or reuses, on retry) a HostingAccount row from your
//      existing RAILWAY_API_TOKEN/RAILWAY_API_URL env vars — this
//      becomes the first row in the Hosting Accounts list, exactly
//      like any account you'd connect through the dashboard.
//   2. Sets hostingAccountId on every RailwayResource row that's still
//      null to that account's id.
//
// It does NOT touch resources that already have a hostingAccountId set
// (e.g. from a re-run, or ones mapped after the migration through the
// dashboard) — safe to re-run.
//
// Run from the Railway shell (has DATABASE_URL, RAILWAY_API_TOKEN, and
// HOSTING_CREDENTIALS_KEY already set) AFTER you've run
// `npx prisma db push` to create the HostingAccount table and the
// RailwayResource.hostingAccountId column:
//
//   node scripts/backfill-hosting-accounts.mjs
//
// Optional: HOSTING_ACCOUNT_LABEL (defaults to "Primary Railway account
// (migrated)") — used both as the label for the created account and as
// the lookup key that makes re-running this script safe.
//
// The encryption format below MUST stay byte-for-byte compatible with
// src/lib/hosting/crypto.ts#encryptSecret — this is a deliberate
// duplication (a plain .mjs script can't cheaply import a .ts module on
// a bare `node` runtime), the same pattern scripts/seed-admin.mjs
// already uses for password hashing. If you ever change the format in
// crypto.ts, mirror the change here too.

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const ALGORITHM = 'aes-256-gcm';

function getKey() {
  const raw = process.env.HOSTING_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error(
      'HOSTING_CREDENTIALS_KEY is not configured — generate one with `openssl rand -hex 32` and set it as an env var before running this script.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('HOSTING_CREDENTIALS_KEY must be exactly 32 bytes (64 hex characters).');
  }
  return key;
}

function encryptSecret(plaintext) {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

async function main() {
  const apiToken = process.env.RAILWAY_API_TOKEN;
  const apiUrl = process.env.RAILWAY_API_URL || null;
  const label = process.env.HOSTING_ACCOUNT_LABEL?.trim() || 'Primary Railway account (migrated)';

  if (!apiToken) {
    console.error(
      'RAILWAY_API_TOKEN is not set — nothing to migrate. If this app never had one connected yet, skip ' +
        'this script and connect an account from the Hosting Accounts dashboard page instead.'
    );
    process.exit(1);
  }

  // Will throw early (before touching the DB) if the key is missing or
  // malformed — fail loud rather than creating a HostingAccount row
  // with a garbage-encrypted token.
  getKey();

  const prisma = new PrismaClient();
  try {
    let account = await prisma.hostingAccount.findFirst({ where: { label } });
    if (account) {
      console.log(`Reusing existing hosting account "${account.label}" (id: ${account.id}) — not re-creating.`);
    } else {
      account = await prisma.hostingAccount.create({
        data: {
          provider: 'RAILWAY',
          label,
          apiUrl,
          encryptedApiToken: encryptSecret(apiToken),
          isActive: true,
        },
      });
      console.log(`Created hosting account "${account.label}" (id: ${account.id}) from RAILWAY_API_TOKEN.`);
    }

    const result = await prisma.railwayResource.updateMany({
      where: { hostingAccountId: null },
      data: { hostingAccountId: account.id },
    });
    console.log(`Backfilled hostingAccountId on ${result.count} existing RailwayResource row(s).`);

    const stillNull = await prisma.railwayResource.count({ where: { hostingAccountId: null } });
    if (stillNull > 0) {
      // Should be unreachable (the updateMany above targets exactly this
      // set) — but never claim success without verifying.
      console.warn(`${stillNull} RailwayResource row(s) still have a null hostingAccountId — investigate.`);
    } else {
      console.log('Every RailwayResource row now has a hostingAccountId. Migration complete.');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill failed:', err);
  process.exit(1);
});
