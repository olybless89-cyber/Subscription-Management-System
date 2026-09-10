// POST /api/cron/subscriptions — spec section 21 (hourly).
// Protected by CRON_SECRET, not a user session — this is meant to be
// called by your scheduler (Railway cron, GitHub Actions, etc.), not a
// browser. Same sandbox caveats as the other route files: not
// typechecked here, logic is tested independently
// (tests/subscription-checker.test.ts).

import { runSubscriptionChecker } from '../../../../src/lib/cron/subscription-checker';
import { buildCronDeps, buildRailwayClient } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const dryRun = process.env.SUSPENSION_DRY_RUN === 'true';
  const result = await runSubscriptionChecker(buildCronDeps(), buildRailwayClient(), { dryRun });

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200, // 207: partial success, check errors[]
    headers: { 'Content-Type': 'application/json' },
  });
}
