export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
}

export interface SendEmailResult {
  success: boolean;
  error?: string;
}

const RESEND_API_URL = 'https://api.resend.com/emails';

/**
 * sendEmail — thin wrapper over Resend's HTTP API (no SDK dependency,
 * consistent with how paystack.ts avoids one too — one fetch call
 * doesn't need a package).
 *
 * Deliberately NEVER throws. Every caller of this function (payment
 * webhook, suspension engine, cron) has already done the thing that
 * matters — recorded the payment, suspended the service — before
 * attempting to notify anyone. A missing RESEND_API_KEY, a Resend
 * outage, or a bad recipient address must degrade to "notification not
 * sent" (still logged as a Notification/AdminNotification row for the
 * audit trail — see prisma-repository.ts), never to "the payment/
 * suspension itself failed."
 */
export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;

  if (!apiKey || !from) {
    return { success: false, error: 'RESEND_API_KEY or EMAIL_FROM not configured' };
  }

  try {
    const res = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: input.to,
        subject: input.subject,
        text: input.text,
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { success: false, error: `Resend API returned ${res.status}: ${body}` };
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error sending email' };
  }
}

/**
 * subjectForEvent — human subject lines for the event strings already
 * used throughout the codebase (spec section 31 message copy, and the
 * PAYMENT_RECEIVED/RESTORED events from the webhook/restoration flow).
 * A default is provided so a future event string added elsewhere never
 * silently produces an empty subject.
 */
export function subjectForEvent(event: string): string {
  switch (event) {
    case 'PAYMENT_DUE':
      return 'Your Web Oracle Host subscription is due';
    case 'GRACE_PERIOD':
      return 'Action needed: your hosting subscription is overdue';
    case 'SUSPENDED':
      return 'Your hosting service has been suspended';
    case 'PAYMENT_RECEIVED':
      return 'Payment received — Web Oracle Host';
    case 'RESTORED':
      return 'Your hosting service has been restored';
    case 'SYSTEM_ERROR':
      return 'Web Oracle Host — system notice';
    default:
      return 'Web Oracle Host notification';
  }
}
