// POST /api/cron/railway-sync — spec section 13 (every 30 min).
// Same auth model as /api/cron/subscriptions: CRON_SECRET header, not a
// user session.

import { syncRailwayResources } from '../../../../src/lib/cron/railway-sync';
import { buildCronDeps, buildRailwayClient, buildResourceStatusSnapshotRepository } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const deps = buildCronDeps();
  const result = await syncRailwayResources(
    deps.railwayResources,
    buildRailwayClient(),
    buildResourceStatusSnapshotRepository()
  );

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
