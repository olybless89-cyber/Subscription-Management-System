import { RailwayResourceRepository, ResourceStatusSnapshotRepository } from '../db/ports';
import { RailwayClient, RailwayApiError } from '../railway/client';
import { getServiceStatus } from '../railway/services';
import { RailwayResourceRecord } from '@/types/domain';

export interface RailwaySyncResult {
  checked: number;
  updated: number;
  errors: Array<{ resourceId: string; message: string }>;
}

/**
 * syncRailwayResources — spec section 13. Read-only against Railway (it
 * never suspends/restores anything, just reconciles local status with
 * reality) and safe to run frequently. Skips MULTI_TENANT resources —
 * there's nothing meaningful to sync for them since they're never
 * stopped/started at the Railway level in the first place (spec section
 * 16), and polling them would just churn lastSyncedAt for no signal.
 *
 * Also writes a ResourceStatusSnapshot on every check, piggy-backing on
 * this already-scheduled 30-min run — this is the entire uptime-
 * tracking mechanism (see src/lib/monitoring/uptime.ts). Snapshot
 * writes are best-effort: a failure to WRITE the history row must never
 * be confused with, or block, the actual status sync above it.
 */
export async function syncRailwayResources(
  resources: RailwayResourceRepository,
  railway: RailwayClient,
  statusSnapshots?: ResourceStatusSnapshotRepository
): Promise<RailwaySyncResult> {
  const all = await resources.findAll();
  const result: RailwaySyncResult = { checked: 0, updated: 0, errors: [] };

  for (const resource of all) {
    if (resource.hostingMode === 'MULTI_TENANT') continue;
    result.checked++;

    try {
      const status = await getServiceStatus(railway, resource.serviceId, resource.environmentId);
      await resources.updateStatus(resource.id, status, { lastError: null });
      result.updated++;
      await recordSnapshot(statusSnapshots, resource.id, status);
    } catch (err) {
      // Never assume a Railway action succeeded without verification —
      // and equally, never assume it FAILED just because we couldn't
      // reach the API. UNKNOWN is the honest status when we can't tell.
      const message =
        err instanceof RailwayApiError ? err.message : err instanceof Error ? err.message : 'Unknown error';
      await resources.updateStatus(resource.id, 'UNKNOWN', { lastError: message });
      result.errors.push({ resourceId: resource.id, message });
      await recordSnapshot(statusSnapshots, resource.id, 'UNKNOWN');
    }
  }

  return result;
}

async function recordSnapshot(
  statusSnapshots: ResourceStatusSnapshotRepository | undefined,
  railwayResourceId: string,
  status: RailwayResourceRecord['status']
): Promise<void> {
  if (!statusSnapshots) return;
  try {
    await statusSnapshots.create({ railwayResourceId, status });
  } catch {
    // Deliberately swallowed — a failure to record uptime HISTORY must
    // never affect the actual sync run happening above it.
  }
}

/** Re-exported for callers that already have a single resource in hand
 * and don't want to pull the whole findAll() list (e.g. an admin's
 * "Sync now" button on one customer's detail page). */
export async function syncSingleRailwayResource(
  resources: RailwayResourceRepository,
  railway: RailwayClient,
  resource: RailwayResourceRecord,
  statusSnapshots?: ResourceStatusSnapshotRepository
): Promise<{ status: RailwayResourceRecord['status']; error?: string }> {
  if (resource.hostingMode === 'MULTI_TENANT') {
    return { status: resource.status };
  }
  try {
    const status = await getServiceStatus(railway, resource.serviceId, resource.environmentId);
    await resources.updateStatus(resource.id, status, { lastError: null });
    await recordSnapshot(statusSnapshots, resource.id, status);
    return { status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await resources.updateStatus(resource.id, 'UNKNOWN', { lastError: message });
    await recordSnapshot(statusSnapshots, resource.id, 'UNKNOWN');
    return { status: 'UNKNOWN', error: message };
  }
}
