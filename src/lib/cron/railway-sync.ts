import { RailwayResourceRepository } from '../db/ports';
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
 */
export async function syncRailwayResources(
  resources: RailwayResourceRepository,
  railway: RailwayClient
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
    } catch (err) {
      // Never assume a Railway action succeeded without verification —
      // and equally, never assume it FAILED just because we couldn't
      // reach the API. UNKNOWN is the honest status when we can't tell.
      const message =
        err instanceof RailwayApiError ? err.message : err instanceof Error ? err.message : 'Unknown error';
      await resources.updateStatus(resource.id, 'UNKNOWN', { lastError: message });
      result.errors.push({ resourceId: resource.id, message });
    }
  }

  return result;
}

/** Re-exported for callers that already have a single resource in hand
 * and don't want to pull the whole findAll() list (e.g. an admin's
 * "Sync now" button on one customer's detail page). */
export async function syncSingleRailwayResource(
  resources: RailwayResourceRepository,
  railway: RailwayClient,
  resource: RailwayResourceRecord
): Promise<{ status: RailwayResourceRecord['status']; error?: string }> {
  if (resource.hostingMode === 'MULTI_TENANT') {
    return { status: resource.status };
  }
  try {
    const status = await getServiceStatus(railway, resource.serviceId, resource.environmentId);
    await resources.updateStatus(resource.id, status, { lastError: null });
    return { status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    await resources.updateStatus(resource.id, 'UNKNOWN', { lastError: message });
    return { status: 'UNKNOWN', error: message };
  }
}
