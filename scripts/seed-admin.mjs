// scripts/seed-admin.mjs
//
// Creates (or updates) one AdminUser so you have something to log in
// with — there's no signup UI yet, so this is the only way in.
//
// Run from the Railway shell (has DATABASE_URL set already) or locally
// with DATABASE_URL pointed at the same Postgres:
//
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a-strong-password' node scripts/seed-admin.mjs
//
// Optional: ADMIN_NAME (defaults to "Admin"), ADMIN_ROLE (SUPER_ADMIN or
// ADMIN, defaults to SUPER_ADMIN).
//
// Safe to re-run: it upserts on email, so running it again with a new
// ADMIN_PASSWORD resets that admin's password rather than erroring on a
// duplicate.
//
// The hash format below MUST stay byte-for-byte compatible with
// src/lib/auth/password.ts#hashPassword — this is a deliberate
// duplication (a plain .mjs script can't cheaply import a .ts module on
// a bare `node` runtime) rather than an oversight. If you ever change
// the format in password.ts, mirror the change here too.

import crypto from 'node:crypto';
import { PrismaClient } from '@prisma/client';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function hashPassword(plain) {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES);
    crypto.scrypt(plain, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

async function main() {
  const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Admin';
  const role = process.env.ADMIN_ROLE === 'ADMIN' ? 'ADMIN' : 'SUPER_ADMIN';

  if (!email || !password) {
    console.error('Usage: ADMIN_EMAIL=... ADMIN_PASSWORD=... node scripts/seed-admin.mjs');
    process.exit(1);
  }
  if (password.length < 12) {
    console.error('ADMIN_PASSWORD should be at least 12 characters — pick something longer.');
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const prisma = new PrismaClient();

  try {
    const admin = await prisma.adminUser.upsert({
      where: { email },
      update: { passwordHash, role, name },
      create: {
        email,
        name,
        passwordHash,
        role,
        canManageAdmins: role === 'SUPER_ADMIN',
      },
    });
    console.log(`Admin ready: ${admin.email} (${admin.role}, id: ${admin.id})`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Failed to seed admin:', err);
  process.exit(1);
});
