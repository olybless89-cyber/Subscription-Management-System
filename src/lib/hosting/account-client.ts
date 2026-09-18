/**
 * Resolves a real, callable RailwayClient for a specific connected
 * HostingAccount — the thing that makes multi-account support actually
 * work: every place that used to be handed one global RailwayClient for
 * an entire suspend/restore/sync run now resolves a (possibly
 * different) client PER RESOURCE, keyed by that resource's own
 * hostingAccountId.
 *
 * Deliberately throws HostingAccountResolutionError rather than
 * returning null/undefined on any failure — every caller (engine.ts,
 * restoration.ts, railway-sync.ts) already has an established pattern
 * of catching a Railway-layer error per-resource and turning it into a
 * FAILED/UNKNOWN result with a clear `detail` string, never crashing
 * the whole batch. A resource whose account was deleted, deactivated,
 * or never migrated (hostingAccountId still null) fails exactly the
 * same honest way a real Railway outage would — it never silently
 * falls back to some other account's credentials.
 */

import { HostingAccountRepository } from '../db/ports';
import { createRailwayClient, RailwayClient } from '../railway/client';
import { listAccountProjects } from '../railway/projects';

export class HostingAccountResolutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'HostingAccountResolutionError';
  }
}

export async function resolveRailwayClientForAccount(
  hostingAccounts: HostingAccountRepository,
  hostingAccountId: string | null
): Promise<RailwayClient> {
  if (!hostingAccountId) {
    throw new HostingAccountResolutionError(
      'This resource has no connected hosting account on record — it predates multi-account support and needs to be backfilled (see scripts/backfill-hosting-accounts.mjs) or re-mapped.'
    );
  }

  const account = await hostingAccounts.findByIdWithCredentials(hostingAccountId);
  if (!account) {
    throw new HostingAccountResolutionError(`Connected hosting account ${hostingAccountId} no longer exists`);
  }
  if (!account.isActive) {
    throw new HostingAccountResolutionError(`Hosting account "${account.label}" is disconnected/inactive`);
  }
  if (account.provider !== 'RAILWAY') {
    throw new HostingAccountResolutionError(
      `Hosting account "${account.label}" is a ${account.provider} account — no ${account.provider} adapter is implemented yet, so this resource can't be acted on.`
    );
  }

  // findByIdWithCredentials already decrypts the stored credential
  // (see PrismaHostingAccountRepository) — account.apiToken here is
  // plaintext, ready to use directly. Decrypting it again would throw
  // on a well-formed token (it isn't ciphertext) and, far worse, could
  // silently produce garbage instead of throwing on some inputs — never
  // double-decrypt.
  return createRailwayClient({
    apiUrl: account.apiUrl || 'https://backboard.railway.com/graphql/v2',
    apiToken: account.apiToken,
  });
}

/** Backs the "Test connection" button on the Hosting Accounts page —
 * a cheap, read-only call (listing the account's own projects) that
 * proves the stored token is valid and reachable without touching any
 * customer's infrastructure. */
export async function testRailwayAccountConnection(
  client: RailwayClient
): Promise<{ ok: true; projectCount: number } | { ok: false; error: string }> {
  try {
    const projects = await listAccountProjects(client);
    return { ok: true, projectCount: projects.length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Unknown error reaching Railway' };
  }
}
