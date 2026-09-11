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
