import crypto from 'node:crypto';

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * Hashes a password with scrypt (Node's built-in, no external dependency
 * or its supply-chain risk) and a random per-password salt. Output format
 * is `scrypt:<saltHex>:<hashHex>` so the salt travels with the hash and
 * verifyPassword doesn't need it passed separately.
 */
export function hashPassword(plain: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(SALT_BYTES);
    crypto.scrypt(plain, salt, KEY_LENGTH, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt.toString('hex')}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(plain: string, stored: string): Promise<boolean> {
  return new Promise((resolve, reject) => {
    const parts = stored.split(':');
    if (parts.length !== 3 || parts[0] !== 'scrypt') {
      // Not a hash this module produced — never treat as a match.
      resolve(false);
      return;
    }
    const [, saltHex, hashHex] = parts;
    const salt = Buffer.from(saltHex, 'hex');
    const expected = Buffer.from(hashHex, 'hex');
    crypto.scrypt(plain, salt, expected.length, (err, derivedKey) => {
      if (err) return reject(err);
      // Constant-time comparison, and guard against length mismatch
      // throwing inside timingSafeEqual.
      if (derivedKey.length !== expected.length) {
        resolve(false);
        return;
      }
      resolve(crypto.timingSafeEqual(derivedKey, expected));
    });
  });
}
