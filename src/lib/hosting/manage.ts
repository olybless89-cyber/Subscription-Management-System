import { BillingSetupDeps } from '../db/ports';
import { HostingAccountRecord } from '@/types/domain';
import { createRailwayClient } from '../railway/client';
import { testRailwayAccountConnection } from './account-client';

export type CreateHostingAccountOutcome = 'CREATED' | 'FORBIDDEN' | 'INVALID_INPUT';

export interface CreateHostingAccountResult {
  outcome: CreateHostingAccountOutcome;
  message: string;
  account?: HostingAccountRecord;
}

/**
 * createHostingAccount — connects a new hosting-provider account (a
 * second Railway account, or, once a provider adapter exists, a
 * DigitalOcean/AWS/Vercel one). SUPER_ADMIN only, same bar as every
 * other Railway-infrastructure action (suspend/restore/mapping) and as
 * domain/customer deletion — this holds real credentials and controls
 * real customer infrastructure.
 *
 * Deliberately does not validate the token against the provider's API
 * before saving (that's what the separate "Test connection" action is
 * for) — a token that's momentarily unreachable but will work once
 * network issues clear shouldn't block connecting the account.
 */
export async function createHostingAccount(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  input: { provider: HostingAccountRecord['provider']; label: string; apiToken: string; apiUrl?: string | null }
): Promise<CreateHostingAccountResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can connect a hosting account' };
  }

  const label = input.label?.trim();
  if (!label) {
    return { outcome: 'INVALID_INPUT', message: 'label is required' };
  }
  if (!input.apiToken?.trim()) {
    return { outcome: 'INVALID_INPUT', message: 'apiToken is required' };
  }
  if (input.provider !== 'RAILWAY') {
    return {
      outcome: 'INVALID_INPUT',
      message: `No ${input.provider} adapter is implemented yet — only RAILWAY accounts can be connected right now.`,
    };
  }

  const account = await deps.hostingAccounts.create({
    provider: input.provider,
    label,
    apiToken: input.apiToken.trim(),
    apiUrl: input.apiUrl?.trim() || null,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'HOSTING_ACCOUNT_CONNECTED',
    target: account.id,
    metadata: { provider: account.provider, label: account.label },
    result: 'SUCCESS',
  });

  return { outcome: 'CREATED', message: 'Hosting account connected', account };
}

export type UpdateHostingAccountOutcome = 'UPDATED' | 'FORBIDDEN' | 'NOT_FOUND';

export interface UpdateHostingAccountResult {
  outcome: UpdateHostingAccountOutcome;
  message: string;
  account?: HostingAccountRecord;
}

/** updateHostingAccount — relabel, toggle active, or rotate the token
 * after regenerating it on the provider's side. SUPER_ADMIN only. */
export async function updateHostingAccount(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  accountId: string,
  patch: { label?: string; apiToken?: string; apiUrl?: string | null; isActive?: boolean }
): Promise<UpdateHostingAccountResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can edit a hosting account' };
  }

  const existing = await deps.hostingAccounts.findById(accountId);
  if (!existing) {
    return { outcome: 'NOT_FOUND', message: 'Hosting account not found' };
  }

  const account = await deps.hostingAccounts.update(accountId, {
    label: patch.label?.trim() || undefined,
    apiToken: patch.apiToken?.trim() || undefined,
    apiUrl: patch.apiUrl !== undefined ? patch.apiUrl?.trim() || null : undefined,
    isActive: patch.isActive,
  });

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'HOSTING_ACCOUNT_UPDATED',
    target: account.id,
    metadata: { label: account.label, isActive: account.isActive, tokenRotated: !!patch.apiToken },
    result: 'SUCCESS',
  });

  return { outcome: 'UPDATED', message: 'Hosting account updated', account };
}

export type DeleteHostingAccountOutcome = 'DELETED' | 'FORBIDDEN' | 'NOT_FOUND' | 'IN_USE';

export interface DeleteHostingAccountResult {
  outcome: DeleteHostingAccountOutcome;
  message: string;
}

/**
 * deleteHostingAccount — SUPER_ADMIN only. Refuses to delete an account
 * that still governs any RailwayResource (mirrors the FK's own Restrict
 * boundary, but with a clean, actionable error instead of a raw
 * constraint violation) — disconnect the resources first (re-map them
 * to a different account, or delete them) rather than orphaning
 * suspend/restore for whichever customers were on this account.
 */
export async function deleteHostingAccount(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  accountId: string
): Promise<DeleteHostingAccountResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can disconnect a hosting account' };
  }

  const existing = await deps.hostingAccounts.findById(accountId);
  if (!existing) {
    return { outcome: 'NOT_FOUND', message: 'Hosting account not found' };
  }

  const inUse = await deps.railwayResources.findByHostingAccountId(accountId);
  if (inUse.length > 0) {
    return {
      outcome: 'IN_USE',
      message: `${inUse.length} mapped resource(s) still use this account — re-map or remove them before disconnecting it.`,
    };
  }

  await deps.hostingAccounts.delete(accountId);

  await deps.auditLog.create({
    actor: requestingAdminId,
    action: 'HOSTING_ACCOUNT_DISCONNECTED',
    target: accountId,
    metadata: { label: existing.label, provider: existing.provider },
    result: 'SUCCESS',
  });

  return { outcome: 'DELETED', message: `"${existing.label}" disconnected` };
}

export type TestHostingAccountOutcome = 'OK' | 'FORBIDDEN' | 'NOT_FOUND' | 'UNSUPPORTED' | 'UNREACHABLE';

export interface TestHostingAccountResult {
  outcome: TestHostingAccountOutcome;
  message: string;
}

/** testHostingAccount — the "Test connection" button. Makes one cheap,
 * read-only call with the account's own stored credentials and reports
 * whether it worked, without ever exposing the token itself. */
export async function testHostingAccount(
  deps: BillingSetupDeps,
  requestingAdminId: string,
  accountId: string
): Promise<TestHostingAccountResult> {
  const requester = await deps.admins.findById(requestingAdminId);
  if (!requester) {
    return { outcome: 'FORBIDDEN', message: 'Requesting admin not found' };
  }
  if (requester.role !== 'SUPER_ADMIN') {
    return { outcome: 'FORBIDDEN', message: 'Only the super admin can test a hosting account' };
  }

  const account = await deps.hostingAccounts.findByIdWithCredentials(accountId);
  if (!account) {
    return { outcome: 'NOT_FOUND', message: 'Hosting account not found' };
  }
  if (account.provider !== 'RAILWAY') {
    return { outcome: 'UNSUPPORTED', message: `No ${account.provider} adapter is implemented yet — nothing to test.` };
  }

  const client = createRailwayClient({
    apiUrl: account.apiUrl || 'https://backboard.railway.com/graphql/v2',
    apiToken: account.apiToken,
  });
  const result = await testRailwayAccountConnection(client);

  if (result.ok) {
    return { outcome: 'OK', message: `Connected — ${result.projectCount} project(s) visible to this token.` };
  }
  return { outcome: 'UNREACHABLE', message: result.error };
}
