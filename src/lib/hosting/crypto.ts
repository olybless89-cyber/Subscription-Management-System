/**
 * Encrypts/decrypts hosting-account API tokens at rest.
 *
 * SERVER-SIDE ONLY, same rule as src/lib/railway/client.ts. Uses
 * AES-256-GCM with a key read lazily from HOSTING_CREDENTIALS_KEY (a
 * 64-character hex string = 32 raw bytes) so this module can be
 * imported in test contexts without that env var set — it only throws
 * once something actually tries to encrypt/decrypt.
 *
 * Deliberately a separate key from SESSION_SECRET/CRON_SECRET: those
 * sign/verify short-lived tokens this app issues itself, this encrypts
 * long-lived third-party API credentials — mixing the two means
 * rotating one for its own reason (e.g. a session-token leak) would
 * also silently break the other.
 *
 * Generate a key with: `openssl rand -hex 32`
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';

function getKey(): Buffer {
  const raw = process.env.HOSTING_CREDENTIALS_KEY;
  if (!raw) {
    throw new Error(
      'HOSTING_CREDENTIALS_KEY is not configured on the server — generate one with `openssl rand -hex 32` and set it as an env var before connecting a hosting account.'
    );
  }
  const key = Buffer.from(raw, 'hex');
  if (key.length !== 32) {
    throw new Error('HOSTING_CREDENTIALS_KEY must be exactly 32 bytes (64 hex characters).');
  }
  return key;
}

/** Encrypts `plaintext`, returning `iv:authTag:ciphertext` (all hex),
 * safe to store as a single string column. */
export function encryptSecret(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted.toString('hex')}`;
}

/** Reverses encryptSecret. Throws (never returns garbage) if the stored
 * value is malformed or the key doesn't match — a silently-wrong
 * decrypted token would fail as a confusing "Railway API unreachable"
 * far from its real cause, so failing loudly here is deliberate. */
export function decryptSecret(stored: string): string {
  const key = getKey();
  const parts = stored.split(':');
  if (parts.length !== 3) {
    throw new Error('Stored credential is malformed — expected iv:authTag:ciphertext');
  }
  const [ivHex, authTagHex, dataHex] = parts;
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
  decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()]);
  return decrypted.toString('utf8');
}
