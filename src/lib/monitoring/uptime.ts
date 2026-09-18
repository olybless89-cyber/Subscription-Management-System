import { ResourceStatusSnapshotRepository } from '../db/ports';
import { StatusSnapshotRecord } from '@/types/domain';

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
 * statsFromSnapshots — the pure math behind computeUptimeStats, split
 * out so callers that already hold a batch of snapshots (e.g. the
 * customer portal building several different windows from one fetch)
 * don't have to round-trip the database once per window. Filters to
 * the requested window itself rather than trusting the caller to have
 * pre-filtered, so it's safe to call on a snapshot list that spans a
 * wider range than windowDays.
 */
export function statsFromSnapshots(snapshots: StatusSnapshotRecord[], windowDays: number, now: Date): UptimeStats {
  const sinceMs = now.getTime() - windowDays * 24 * 60 * 60 * 1000;
  const inWindow = snapshots.filter((s) => {
    const t = new Date(s.checkedAt).getTime();
    return t >= sinceMs && t <= now.getTime();
  });

  const activeChecks = inWindow.filter((s) => s.status === 'ACTIVE').length;
  const conclusiveChecks = inWindow.filter((s) => s.status === 'ACTIVE' || s.status === 'STOPPED').length;
  const inconclusiveChecks = inWindow.length - conclusiveChecks;
  const uptimePercent = conclusiveChecks > 0 ? (activeChecks / conclusiveChecks) * 100 : null;

  let windowStart: string | null = null;
  for (const s of inWindow) {
    if (windowStart === null || s.checkedAt < windowStart) windowStart = s.checkedAt;
  }

  return {
    uptimePercent,
    totalChecks: inWindow.length,
    conclusiveChecks,
    activeChecks,
    inconclusiveChecks,
    windowStart,
    windowEnd: now.toISOString(),
    requestedWindowDays: windowDays,
  };
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
  return statsFromSnapshots(snapshots, windowDays, now);
}

export interface UptimeSeriesPoint {
  /** Short axis label for the bucket's start time, e.g. "12AM", "4AM". */
  label: string;
  /** null when no conclusive check fell in this bucket — the chart
   * must leave a gap there, never draw a fabricated 0%. */
  upPercent: number | null;
  conclusiveChecks: number;
}

/**
 * buildUptimeSeries — a fixed trailing-24-hour, 6-bucket (4h each)
 * view across every snapshot handed in, for the "System Activity"
 * chart. Buckets are aligned to UTC 4-hour marks (00/04/08/12/16/20)
 * so the axis reads as clean clock labels rather than whatever minute
 * the page happened to load at.
 */
export function buildUptimeSeries(snapshots: StatusSnapshotRecord[], now: Date): UptimeSeriesPoint[] {
  const bucketMs = 4 * 60 * 60 * 1000;
  const end = new Date(now);
  end.setUTCMinutes(0, 0, 0);
  end.setUTCHours(Math.ceil(now.getUTCHours() / 4) * 4, 0, 0, 0);

  const points: UptimeSeriesPoint[] = [];
  for (let i = 6; i >= 1; i--) {
    const bucketEnd = new Date(end.getTime() - (i - 1) * bucketMs);
    const bucketStart = new Date(bucketEnd.getTime() - bucketMs);
    const inBucket = snapshots.filter((s) => {
      const t = new Date(s.checkedAt).getTime();
      return t >= bucketStart.getTime() && t < bucketEnd.getTime();
    });
    const conclusive = inBucket.filter((s) => s.status === 'ACTIVE' || s.status === 'STOPPED');
    const active = conclusive.filter((s) => s.status === 'ACTIVE');
    points.push({
      label: formatHourLabel(bucketStart.getUTCHours()),
      upPercent: conclusive.length > 0 ? (active.length / conclusive.length) * 100 : null,
      conclusiveChecks: conclusive.length,
    });
  }
  return points;
}

function formatHourLabel(hourUtc: number): string {
  const h = ((hourUtc % 24) + 24) % 24;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${period}`;
}

export interface ActivityEvent {
  resourceLabel: string;
  status: StatusSnapshotRecord['status'];
  checkedAt: string;
  /** true when this check's status differs from the previous check for
   * the same resource — a real transition, not just "still up". */
  changed: boolean;
}

/**
 * buildRecentActivityEvents — turns raw status-check history for one or
 * more resources into a short, real activity feed: every genuine status
 * transition, plus each resource's most recent check (so a
 * never-changed-status resource still shows up as "last checked"),
 * newest first. Deliberately does NOT surface every ~30-minute check —
 * that would just repeat "still active" dozens of times.
 */
export function buildRecentActivityEvents(
  resources: Array<{ label: string; snapshots: StatusSnapshotRecord[] }>,
  opts: { limit?: number } = {}
): ActivityEvent[] {
  const limit = opts.limit ?? 6;
  const events: ActivityEvent[] = [];

  for (const r of resources) {
    const sorted = [...r.snapshots].sort((a, b) => (a.checkedAt < b.checkedAt ? -1 : a.checkedAt > b.checkedAt ? 1 : 0));
    let prevStatus: StatusSnapshotRecord['status'] | null = null;
    sorted.forEach((s, idx) => {
      const changed = prevStatus !== null && prevStatus !== s.status;
      const isLast = idx === sorted.length - 1;
      if (changed || isLast) {
        events.push({ resourceLabel: r.label, status: s.status, checkedAt: s.checkedAt, changed });
      }
      prevStatus = s.status;
    });
  }

  events.sort((a, b) => (a.checkedAt < b.checkedAt ? 1 : a.checkedAt > b.checkedAt ? -1 : 0));
  return events.slice(0, limit);
}
