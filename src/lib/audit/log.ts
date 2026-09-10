import { AuditLogRepository, AuditLogEntry } from '../db/ports';

/**
 * recordAuditLog — spec section 33. A thin pass-through on purpose: the
 * interesting decision (what counts as an "important administrator
 * action") lives at each call site (admin routes, engines), not here.
 * Use actor: 'SYSTEM' for cron/worker-initiated entries.
 */
export function recordAuditLog(
  repo: AuditLogRepository,
  entry: AuditLogEntry
): Promise<void> {
  return repo.create(entry);
}
