// POST /api/cron/birthdays
// Meant to be scheduled at 7am daily by your external scheduler
// (Railway cron, GitHub Actions, etc.) — this route doesn't know or
// care what time it is, it just checks today's date against every
// customer's stored birthday. See src/lib/customers/birthday.ts for the
// matching logic and its idempotency caveat (no "already sent today"
// tracking — don't schedule this more than once a day).

import { runBirthdayMessages } from '../../../../src/lib/customers/birthday';
import { buildCustomEmailDeps } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const result = await runBirthdayMessages(buildCustomEmailDeps());

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
