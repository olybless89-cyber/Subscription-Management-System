import { ResourceStatusSnapshotRepository } from '../db/ports';

export interface UptimeStats {
  /** null when there's no conclusive data at all yet (brand new
   * resource, or every check so far has been inconclusive) — the UI
   * must show "not enough data yet", never a fabricated 100%. */
  uptimePercent: number | null;
  totalChecks: number;
  /** ACTIVE + STOPPED — the only statuses that carry real signal. */
  conclusiveChecks: number;
  activeChecks: number;
  /** UNKNOWN + ERROR — Railway was unreachable or the state was
   * ambiguous (e.g. mid-deploy). Excluded from the percentage on
   * purpose: "we couldn't check" is not evidence the service was down. */
  inconclusiveChecks: number;
  windowStart: string | null;
  windowEnd: string;
  requestedWindowDays: number;
}

/**
 * computeUptimeStats — the entire "uptime tracking" feature, honestly
 * framed: this is the proportion of periodic checks (every ~30 minutes,
 * via syncRailwayResources) that came back ACTIVE, not continuous
 * monitoring. `windowStart` reports the actual earliest snapshot found,
 * which will be much more recent than `requestedWindowDays` ago for any
 * resource that hasn't been tracked that long yet — the UI is expected
 * to show that real window, not claim a full 30 days of history that
 * doesn't exist.
 */
export async function computeUptimeStats(
  deps: { statusSnapshots: ResourceStatusSnapshotRepository },
  railwayResourceId: string,
  opts: { windowDays?: number; now?: Date } = {}
): Promise<UptimeStats> {
  const windowDays = opts.windowDays ?? 30;
  const now = opts.now ?? new Date();
  const since = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000).toISOString();

  const snapshots = await deps.statusSnapshots.findByResourceId(railwayResourceId, since);

  const activeChecks = snapshots.filter((s) => s.status === 'ACTIVE').length;
  const conclusiveChecks = snapshots.filter((s) => s.status === 'ACTIVE' || s.status === 'STOPPED').length;
  const inconclusiveChecks = snapshots.length - conclusiveChecks;
  const uptimePercent = conclusiveChecks > 0 ? (activeChecks / conclusiveChecks) * 100 : null;

  return {
    uptimePercent,
    totalChecks: snapshots.length,
    conclusiveChecks,
    activeChecks,
    inconclusiveChecks,
    windowStart: snapshots.length > 0 ? snapshots[0].checkedAt : null,
    windowEnd: now.toISOString(),
    requestedWindowDays: windowDays,
  };
}
