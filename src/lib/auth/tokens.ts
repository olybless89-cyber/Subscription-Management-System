import crypto from 'node:crypto';

/**
 * Minimal signed-token implementation (HMAC-SHA256 over a JSON payload,
 * base64url-encoded — structurally a JWT without the algorithm-confusion
 * footguns of a general JWT library, since only HS256 exists here and
 * there's no "alg": "none" to smuggle in). Good enough for first-party
 * session tokens; if you later need cross-service verification, swap
 * this for a real JWT lib without changing callers (see SessionPayload).
 */

export interface SessionPayload {
  sub: string; // AdminUser.id or Customer.id
  type: 'admin' | 'customer';
  role?: 'SUPER_ADMIN' | 'ADMIN'; // only present for type: 'admin'
  iat: number; // issued-at, unix seconds
  exp: number; // expiry, unix seconds
}

function base64url(input: Buffer): string {
  return input.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlDecode(input: string): Buffer {
  const padded = input.replace(/-/g, '+').replace(/_/g, '/').padEnd(input.length + ((4 - (input.length % 4)) % 4), '=');
  return Buffer.from(padded, 'base64');
}

function getSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not configured on the server');
  return secret;
}

function sign(data: string, secret: string): string {
  return base64url(crypto.createHmac('sha256', secret).update(data).digest());
}

export function createSessionToken(
  payload: Omit<SessionPayload, 'iat' | 'exp'>,
  opts: { expiresInSeconds?: number; now?: Date; secret?: string } = {}
): string {
  const now = opts.now ?? new Date();
  const iat = Math.floor(now.getTime() / 1000);
  const exp = iat + (opts.expiresInSeconds ?? 60 * 60 * 12); // default 12h session

  const full: SessionPayload = { ...payload, iat, exp };
  const body = base64url(Buffer.from(JSON.stringify(full)));
  const signature = sign(body, opts.secret ?? getSecret());
  return `${body}.${signature}`;
}

export function verifySessionToken(
  token: string,
  opts: { now?: Date; secret?: string } = {}
): SessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, signature] = parts;

  const secret = opts.secret ?? getSecret();
  const expectedSignature = sign(body, secret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expectedSignature);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  let payload: SessionPayload;
  try {
    payload = JSON.parse(base64urlDecode(body).toString('utf8'));
  } catch {
    return null;
  }

  const now = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (typeof payload.exp !== 'number' || payload.exp < now) return null;

  return payload;
}
