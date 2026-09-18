// POST /api/cron/renewal-reminders
// A NEW, independent cron on top of the existing /api/cron/subscriptions
// hourly job — deliberately so. This one only ever fires for a
// subscription a plain admin explicitly opted in via
// reminderDaysBeforeDue (the "Reminders & Actions" hub) and is
// idempotency-guarded at the data layer (lastRenewalReminderSentAt), so
// it can run once a day (or more — re-runs the same day are a no-op for
// anything already sent) without risk of resending. See
// src/lib/subscriptions/renewal-reminder.ts for the full rationale on
// why this is kept separate from the suspension engine's own
// PAYMENT_DUE/GRACE_PERIOD notifications rather than folded into them.

import { runRenewalReminders } from '../../../../src/lib/subscriptions/renewal-reminder';
import { buildRenewalReminderDeps } from '../../../../src/lib/deps-factory';

export async function POST(request: Request): Promise<Response> {
  const secret = request.headers.get('x-cron-secret');
  if (!secret || secret !== process.env.CRON_SECRET) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  const result = await runRenewalReminders(buildRenewalReminderDeps());

  return new Response(JSON.stringify(result), {
    status: result.errors.length > 0 ? 207 : 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
