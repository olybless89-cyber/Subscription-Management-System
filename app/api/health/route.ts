// GET /api/health — spec section 36.
// Database is checked with a real query. Railway/payments/cron are
// reported as "configured"/"not_configured" based on env presence, not a
// live call — pinging Railway or Paystack on every health check would be
// slow and wasteful for something load balancers hit frequently. Use the
// cron sync endpoints for an actual live Railway check.

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | null = null;

export async function GET(): Promise<Response> {
  const checks: Record<string, string> = {};
  let healthy = true;

  try {
    if (!prisma) prisma = new PrismaClient();
    await prisma.$queryRaw`SELECT 1`;
    checks.database = 'ok';
  } catch (err) {
    checks.database = 'error';
    healthy = false;
  }

  checks.railway = process.env.RAILWAY_API_TOKEN ? 'configured' : 'not_configured';
  checks.payments = process.env.PAYSTACK_SECRET_KEY ? 'configured' : 'not_configured';
  checks.cron = process.env.CRON_SECRET ? 'configured' : 'not_configured';

  if (checks.railway === 'not_configured' || checks.payments === 'not_configured' || checks.cron === 'not_configured') {
    healthy = false;
  }

  return new Response(
    JSON.stringify({ status: healthy ? 'healthy' : 'degraded', ...checks }),
    { status: healthy ? 200 : 503, headers: { 'Content-Type': 'application/json' } }
  );
}
