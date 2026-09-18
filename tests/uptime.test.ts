import { describe, it, expect } from 'vitest';
import { computeUptimeStats } from '@/lib/monitoring/uptime';
import { makeResourceStatusSnapshotRepo } from './fakes';

describe('computeUptimeStats', () => {
  it('returns null uptimePercent (never a fabricated 100%) when there are no snapshots at all', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.uptimePercent).toBeNull();
    expect(stats.totalChecks).toBe(0);
    expect(stats.windowStart).toBeNull();
  });

  it('computes 100% when every conclusive check was ACTIVE', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.uptimePercent).toBe(100);
    expect(stats.totalChecks).toBe(3);
  });

  it('computes a real fractional percentage from a mix of ACTIVE and STOPPED', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'STOPPED' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.uptimePercent).toBe(75);
    expect(stats.activeChecks).toBe(3);
    expect(stats.conclusiveChecks).toBe(4);
  });

  it('excludes UNKNOWN/ERROR checks from the percentage', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_1', status: 'UNKNOWN' });
    await repo.create({ railwayResourceId: 'res_1', status: 'UNKNOWN' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.uptimePercent).toBe(100);
    expect(stats.totalChecks).toBe(4);
    expect(stats.inconclusiveChecks).toBe(2);
  });

  it('returns null (not 0%) when every single check so far has been inconclusive', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'UNKNOWN' });
    await repo.create({ railwayResourceId: 'res_1', status: 'UNKNOWN' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.uptimePercent).toBeNull();
    expect(stats.totalChecks).toBe(2);
  });

  it('only counts snapshots for the requested resource, not any other', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });
    await repo.create({ railwayResourceId: 'res_2', status: 'STOPPED' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1');

    expect(stats.totalChecks).toBe(1);
    expect(stats.uptimePercent).toBe(100);
  });

  it('reports the real windowStart from the earliest snapshot, not the requested window size', async () => {
    const { repo } = makeResourceStatusSnapshotRepo();
    await repo.create({ railwayResourceId: 'res_1', status: 'ACTIVE' });

    const stats = await computeUptimeStats({ statusSnapshots: repo }, 'res_1', { windowDays: 30 });

    expect(stats.windowStart).not.toBeNull();
    expect(new Date(stats.windowStart!).getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe('statsFromSnapshots', () => {
  it('filters out snapshots older than the requested window, even when the input list is wider', async () => {
    const { statsFromSnapshots } = await import('@/lib/monitoring/uptime');
    const now = new Date('2026-09-18T12:00:00.000Z');
    const snapshots = [
      { id: 's1', railwayResourceId: 'res_1', status: 'ACTIVE' as const, checkedAt: '2026-09-01T00:00:00.000Z' }, // outside a 1-day window
      { id: 's2', railwayResourceId: 'res_1', status: 'STOPPED' as const, checkedAt: '2026-09-18T06:00:00.000Z' }, // inside
    ];

    const stats = statsFromSnapshots(snapshots, 1, now);

    expect(stats.totalChecks).toBe(1);
    expect(stats.uptimePercent).toBe(0);
  });
});

describe('buildUptimeSeries', () => {
  it('always returns 6 buckets spanning the trailing 24h with clock-aligned labels', async () => {
    const { buildUptimeSeries } = await import('@/lib/monitoring/uptime');
    const now = new Date('2026-09-18T21:10:00.000Z');

    const points = buildUptimeSeries([], now);

    expect(points).toHaveLength(6);
    expect(points.every((p) => p.upPercent === null)).toBe(true);
    expect(points[points.length - 1].label).toBe('8PM'); // most recent bucket starts at the 20:00 UTC mark
  });

  it('computes a real percentage for a bucket that has conclusive checks, leaving empty buckets null', async () => {
    const { buildUptimeSeries } = await import('@/lib/monitoring/uptime');
    const now = new Date('2026-09-18T21:10:00.000Z');
    const snapshots = [
      { id: 's1', railwayResourceId: 'res_1', status: 'ACTIVE' as const, checkedAt: '2026-09-18T20:15:00.000Z' },
      { id: 's2', railwayResourceId: 'res_1', status: 'STOPPED' as const, checkedAt: '2026-09-18T20:45:00.000Z' },
    ];

    const points = buildUptimeSeries(snapshots, now);
    const lastBucket = points[points.length - 1];
    const earlierBuckets = points.slice(0, -1);

    expect(lastBucket.upPercent).toBe(50);
    expect(earlierBuckets.every((p) => p.upPercent === null)).toBe(true);
  });
});

describe('buildRecentActivityEvents', () => {
  it("includes each resource's most recent check even when its status never changed", async () => {
    const { buildRecentActivityEvents } = await import('@/lib/monitoring/uptime');
    const snapshots = [
      { id: 's1', railwayResourceId: 'res_1', status: 'ACTIVE' as const, checkedAt: '2026-09-18T10:00:00.000Z' },
      { id: 's2', railwayResourceId: 'res_1', status: 'ACTIVE' as const, checkedAt: '2026-09-18T10:30:00.000Z' },
    ];

    const events = buildRecentActivityEvents([{ label: 'example.com', snapshots }]);

    expect(events).toHaveLength(1);
    expect(events[0].changed).toBe(false);
    expect(events[0].checkedAt).toBe('2026-09-18T10:30:00.000Z');
  });

  it('surfaces a genuine status transition as its own event', async () => {
    const { buildRecentActivityEvents } = await import('@/lib/monitoring/uptime');
    const snapshots = [
      { id: 's1', railwayResourceId: 'res_1', status: 'ACTIVE' as const, checkedAt: '2026-09-18T10:00:00.000Z' },
      { id: 's2', railwayResourceId: 'res_1', status: 'STOPPED' as const, checkedAt: '2026-09-18T10:30:00.000Z' },
    ];

    const events = buildRecentActivityEvents([{ label: 'example.com', snapshots }]);

    expect(events).toHaveLength(1);
    expect(events[0].changed).toBe(true);
    expect(events[0].status).toBe('STOPPED');
  });

  it('sorts newest first across resources and respects the limit', async () => {
    const { buildRecentActivityEvents } = await import('@/lib/monitoring/uptime');
    const a = [{ id: 'a1', railwayResourceId: 'res_a', status: 'ACTIVE' as const, checkedAt: '2026-09-18T09:00:00.000Z' }];
    const b = [{ id: 'b1', railwayResourceId: 'res_b', status: 'ACTIVE' as const, checkedAt: '2026-09-18T11:00:00.000Z' }];

    const events = buildRecentActivityEvents(
      [
        { label: 'a.example.com', snapshots: a },
        { label: 'b.example.com', snapshots: b },
      ],
      { limit: 1 }
    );

    expect(events).toHaveLength(1);
    expect(events[0].resourceLabel).toBe('b.example.com');
  });
});
