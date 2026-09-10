export interface SendEmailInput {
  to: string;
  subject: string;
  text: string;
  /** Optional HTML body. When provided, sent alongside `text` as the
   * plain-text fallback — Resend (and every real mail client) uses the
   * HTML part when it can render it, falling back to text otherwise. */
  html?: string;
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
        ...(input.html ? { html: input.html } : {}),
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
 * renderBrandedEmailHtml — wraps a plain-text message in a simple,
 * table-based HTML email with the DWO/Web Oracle Host logo in the
 * header. Table-based layout and inline styles are deliberate — most
 * email clients (Outlook especially) strip <style> blocks and mishandle
 * modern CSS, so inline styles on table cells is still the most
 * reliably-rendering approach for email specifically, unlike the rest
 * of this app's UI.
 *
 * The logo is referenced by URL (`${APP_URL}/dwo-logo.jpg`), not
 * embedded inline — standard practice for email; most clients block
 * remote images until the recipient clicks "load images" or "trust
 * sender", which is normal and not something this code can change.
 */
export function renderBrandedEmailHtml(input: { subject: string; bodyText: string }): string {
  const appUrl = process.env.APP_URL?.replace(/\/$/, '') ?? '';
  const logoUrl = appUrl ? `${appUrl}/dwo-logo.jpg` : '';

  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const paragraphs = input.bodyText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => `<p style="margin:0 0 16px;color:#14231c;font-size:15px;line-height:1.6;">${escape(line)}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escape(input.subject)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f1e6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1e6;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#fbf9f3;border:1px solid rgba(20,35,28,0.14);border-radius:4px;overflow:hidden;">
            <tr>
              <td align="center" style="background:#16352a;padding:28px 24px;">
                ${logoUrl ? `<img src="${logoUrl}" alt="Web Oracle Host" width="120" style="display:block;max-width:120px;height:auto;" />` : `<div style="color:#ffffff;font-size:20px;font-weight:700;">WEB ORACLE HOST</div>`}
              </td>
            </tr>
            <tr>
              <td style="padding:32px 28px;">
                ${paragraphs}
              </td>
            </tr>
            <tr>
              <td style="padding:20px 28px;border-top:1px solid rgba(20,35,28,0.14);">
                <p style="margin:0;color:#4b5b52;font-size:12px;line-height:1.5;">
                  Web Oracle Host — Digital Web Oracle ICT (DWO), Abuja, Nigeria.<br />
                  This is an automated message from your hosting management account.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
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
