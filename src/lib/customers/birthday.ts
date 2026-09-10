import { CustomEmailDeps } from '../db/ports';

export interface BirthdayCronResult {
  checked: number;
  sent: number;
  errors: Array<{ customerId: string; message: string }>;
}

/**
 * runBirthdayMessages — spec: "the system is meant to send birthday
 * messages automatically once its the date, 7am in the morning."
 *
 * The 7am timing is NOT enforced in this function — it's whatever time
 * your scheduler (Railway cron, GitHub Actions, etc.) calls
 * POST /api/cron/birthdays. This function just does the date-matching
 * and sending; matching "7am" happens at the schedule-configuration
 * layer, not in code that can't observe wall-clock time reliably on its
 * own (a serverless/container platform's cron trigger is the source of
 * truth for "when", this is the source of truth for "who").
 *
 * Matches on month+day only, ignoring year (dateOfBirth's year is
 * stored but never checked) and ignoring time-of-day/timezone within
 * the date itself — a customer born on any year's March 5th matches
 * every March 5th this runs.
 *
 * Idempotent by construction only in the sense that running it twice
 * on the same day sends the message twice — there's no "already sent
 * today" tracking. Configure the cron schedule to fire once per day,
 * not the function to be safe against firing twice; see the "what's not
 * done" note in the README for why this line was drawn here.
 */
export async function runBirthdayMessages(
  deps: CustomEmailDeps,
  opts: { now?: Date } = {}
): Promise<BirthdayCronResult> {
  const now = opts.now ?? new Date();
  const todayMonth = now.getUTCMonth();
  const todayDate = now.getUTCDate();

  const candidates = await deps.customers.findWithBirthday();
  const result: BirthdayCronResult = { checked: candidates.length, sent: 0, errors: [] };

  for (const customer of candidates) {
    if (!customer.dateOfBirth) continue; // findWithBirthday() already filters this, but stay defensive
    const dob = new Date(customer.dateOfBirth);
    if (dob.getUTCMonth() !== todayMonth || dob.getUTCDate() !== todayDate) continue;

    try {
      await deps.notifications.send(
        customer.id,
        'BIRTHDAY',
        `Happy Birthday, ${customer.name}! 🎉 Wishing you a great year ahead, from all of us at Web Oracle Host.`,
        'Happy Birthday from Web Oracle Host! 🎂'
      );
      result.sent++;
    } catch (err) {
      result.errors.push({
        customerId: customer.id,
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }

  return result;
}
