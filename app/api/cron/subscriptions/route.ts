// POST /api/cron/subscriptions — spec section 21 (hourly).
// Protected by CRON_SECRET, not a user session — this is meant to be
// called by your scheduler (Railway cron, GitHub Actions, etc.), not a
// browser. Same sandbox caveats as the other route files: not
// typechecked here, logic is tested independently
// (tests/subscription-checker.test.ts).
//
// Does NOT force a dry-run value here — that was a bug: forcing
// opts.dryRun from the env var on every call would have overridden any
// per-subscription dryRunOverride (see src/lib/suspension/engine.ts),
// defeating the whole point of that override for the automated path
// specifically. Leaving opts.dryRun unset lets suspendCustomer resolve
// per-subscription-override-then-global-env for each subscription
// individually, exactly as intended.

import { runSubscriptionChecker } from '../../../../src/lib/cron/subscription-checker';
import { buildCronDeps, buildRailwayClient } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const result = await runSubscriptionChecker(buildCronDeps(), buildRailwayClient());

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200, // 207: partial success, check errors[]
    headers: { 'Content-Type': 'application/json' },
  });
}
