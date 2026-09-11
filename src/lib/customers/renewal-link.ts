/**
 * buildRenewalUrl — the public, unauthenticated "pay to unlock your
 * service" link, keyed by customerCode (WOH-000001, ...) since that's
 * short, stable, and already meant to be human-facing — unlike the
 * internal cuid, which is fine for admin URLs but not for something
 * meant to be clicked from an email/WhatsApp message.
 *
 * Used everywhere a suspended/due/grace-period customer gets a message:
 * the suspension engine, the cron worker, and the DUE invoice email.
 * Falls back to a relative path if APP_URL isn't set — better than a
 * broken absolute URL, though APP_URL should always be set in
 * production (same variable already used for the email logo).
 */
export function buildRenewalUrl(customerCode: string): string {
  const base = process.env.APP_URL?.replace(/\/$/, '') ?? '';
  return `${base}/renew/${encodeURIComponent(customerCode)}`;
}
